# Car model generator

Procedurally builds the 9-car roster as glTF/GLB models for the game, plus
studio preview renders and a re-import verification pass. Headless Blender
only - never run against a live GUI session.

## Running it

```
# whole roster -> public/models/cars/*.glb, public/models/cars/index.json,
# tools/cars/previews/<id>_<view>.png
/Applications/Blender.app/Contents/MacOS/Blender --background \
    --python tools/cars/build_cars.py

# a subset (skips index.json so a partial run can't clobber it)
/Applications/Blender.app/Contents/MacOS/Blender --background \
    --python tools/cars/build_cars.py -- sakura_86 aurelia_gt3

# re-import every exported GLB in a *fresh* Blender process and assert
# the object/material contract below
/Applications/Blender.app/Contents/MacOS/Blender --background \
    --python tools/cars/verify.py
```

## File layout

| file | responsibility |
|---|---|
| `specs.py` | the `CarSpec` dict for each of the 9 roster cars |
| `curves.py` | damped Catmull-Rom spline + rounded-section builders, shared by the body and greenhouse lofts |
| `body.py` | body/glass/pillar geometry - the deterministic rounded-section loft (see below) |
| `wheels.py` | tyre+rim wheel objects and static brake disc/caliper objects |
| `details.py` | lights, mirrors, grille, splitter/diffuser, wing, exhaust, interior, steering wheel |
| `materials.py` | the fixed Principled BSDF material set |
| `export.py` | hierarchy assembly, UVs/shading, GLB export, mesh-derived `index.json` measurements |
| `render.py` | EEVEE studio preview renders (front3/4, rear3/4, side) |
| `verify.py` | re-import + contract assertions |
| `build_cars.py` | entry point, wires the above together per car id |

## How the body is built

An earlier version tried both a single hand-lofted cross-section sweep and
a pure three-view boolean intersection; the first self-intersected at the
bumpers, the second gave a clean block with no windscreen rake or roofline
("a bathtub on a slab"). The body is now a **deterministic rounded-section
loft**, driven entirely by tunable keypoint tables (`specs.get_profile`):

1. Five profile functions of longitudinal position x (0 = nose, L = tail):
   `w(x)` plan half-width, `zf(x)` floor height, `zt(x)` lower-body top
   (hood -> belt -> deck line), `rt(x)` top corner radius - each a short
   keypoint table run through a damped Catmull-Rom spline (`curves.py`,
   tension 0.5) and sampled every 0.04 m. `rb` (rocker radius) is a
   constant. A `zr(x)` roof curve (cosine ease onto/off a flat roof at
   height H) drives the greenhouse.
2. Every station is the *same* 28-point rounded-rectangle cross-section
   (`curves.rounded_trapezoid_section`) - 4 corner arcs + 4 edge midpoints,
   the top one carrying a slight crown - just with different w/zf/zt/rt.
   Identical topology at every station means the loft cannot fold back on
   itself. Consecutive stations are bridged with quads, the two ends
   capped with an n-gon, then Bevel (0.03 m, 2 segments) + one Subdivision
   level.
3. Wheel arches are a boolean difference per wheel (cylinder, radius
   `wheelRadius+0.05`), not baked into the profile, plus a partial-torus
   lip in Paint (left open at the bottom ~80 deg so it can't dip below the
   ground). The cutter and the wheel hub share one lateral-offset formula
   (`body.wheel_lateral_offset`) so the wheel is always centred in its arch.
4. The greenhouse is an independent rounded-trapezoid loft from `xa`
   (windscreen base) to `xc` (backlight base): wide base sunk 4 cm into
   the belt, narrower rounded top riding `zr(x)`. Its own top-facing
   faces (>60 deg from horizontal) are re-tagged Paint by face normal so
   the roof reads as sheet metal; the rest stays Glass. A/B/C pillars are
   separate boxes that run only from `zt(x)` to `zr(x)` **at that same x**
   and are rotated to the local roof-curve slope, so they can never rise
   above the roof.
5. Detail placement (lights, mirrors, grille, bumper lips, wing) queries
   `body.size_at_y()` / the same `zt`/`zr` curves the loft was built from,
   so it stays flush with whatever the loft actually produced - the rear
   wing's uprights, in particular, start exactly on `zt(x)` at the wing's
   own position, so it can't float clear of the deck.

Preview renders recolour `Paint` to a mid blue (#2a5fb8) and use a
1.2 m eye-height camera at a 30 deg azimuth so the shape reads like a
photo, not a lit turntable render; the exported GLB always keeps the
white `Paint` the contract calls for.

## Deliberate deviations from the brief

- Wheel arches/window apertures are still booleans (as asked), but the main
  body panel is a three-view intersection rather than a single cross
  -section loft - see above for why.
- `hood_length_ratio` in `CarSpec` is currently unused (hood proportion is
  implied by the roof-span fractions + style-based screen/back-span
  instead); kept in the spec for a future tuning pass.
- `mid_engine` / `rear_engine` / `closed_cockpit` / `fin` / `fender_bulges`
  flags exist in `CarSpec` but don't yet change geometry - noted as
  unfinished in the build report.

## GLB contract

Root object **`Car`**, with these children (exact names), each a single
mesh object except the four wheels/brakes:

`Body` (mat `Paint`) - `Glass` (mat `Glass`) - `Trim` (mat `Trim`) -
`Chrome` (mat `Chrome`, when the car has one) - `Headlights` (mat
`Headlight`) - `Taillights` (mat `Taillight`) - `Brakelights` (mat
`Brakelight`) - `Interior` (mat `Interior`) - `SteeringWheel` (mat
`Interior`) - `Wheel_FL` / `Wheel_FR` / `Wheel_RL` / `Wheel_RR` (mats
`Rubber` + `Rim`, spin axis = local X) - `Brake_FL` / `Brake_FR` /
`Brake_RL` / `Brake_RR` (mat `Brake`, static, hub-positioned).

Coordinates: nose +Y, roof +Z, right side +X, origin at wheelbase centre
on the ground (Z=0). LHD - driver (and `SteeringWheel`) at X<0.

`public/models/cars/index.json` dimensions are measured off the exported
mesh (`export.measure_dimensions`), not copied from `CarSpec`.
