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
| `body.py` | body/glass/pillar geometry - the three-view boolean method (see below) |
| `wheels.py` | tyre+rim wheel objects and static brake disc/caliper objects |
| `details.py` | lights, mirrors, grille, splitter/diffuser, wing, exhaust, interior, steering wheel |
| `materials.py` | the fixed Principled BSDF material set |
| `export.py` | hierarchy assembly, UVs/shading, GLB export, mesh-derived `index.json` measurements |
| `render.py` | EEVEE studio preview renders (front3/4, rear3/4, side) |
| `verify.py` | re-import + contract assertions |
| `build_cars.py` | entry point, wires the above together per car id |

## How the body is built

A single hand-lofted cross-section sweep turned out to be brittle - a small
sign error in one station's control point cascades into a self-intersecting
panel, and every fix to the shape was a fresh opportunity for a new one. The
body is instead built as a **three-view intersection**, which is what car
stylists' blueprints already are:

1. Three 2D silhouettes are defined straight from the `CarSpec` - a **side**
   profile (Y-Z: bumpers, hood, cowl, roof, deck), a **plan** profile (X-Y:
   nose taper, fender bulges, door width, tail taper) and a **front**
   profile (X-Z: a constant rounded-shoulder/tumblehome cross-section).
   Each is a small set of control points run through a Catmull-Rom spline
   (`body._catmull_rom_chain`) to ~80-100 points - smooth curves, not a
   straight-edged polygon.
2. Each silhouette is extruded into a slab along the axis it doesn't
   describe (side -> sweep X, plan -> sweep Z, front -> sweep Y), and the
   three slabs are boolean-**INTERSECT**ed (`body.boolean_op`, EXACT
   solver). Whatever survives all three cuts is the car mass - no per
   -station formula, so nothing can fold back on itself.
3. Wheel arches are cut with a boolean **DIFFERENCE** against a cylinder
   through each axle. Window apertures are cut the same way, using one box
   per glazing bay (windscreen / front door / rear quarter / backlight);
   the bays stop short of each other by a pillar-width gap so the body
   stays solid there (that solid strip *is* the A/B/C pillar).
4. A Bevel modifier (5 segments, 35° angle limit) softens every cut and
   panel edge, followed by one level of Subdivision - by the time it runs
   the control cage is already the right shape, so it rounds shoulders
   without turning into the old "lumpy blob".
5. Glass is a *second*, independent set of thin panels sampled from the
   same side/plan curves per glazing bay (inset ~3.5cm, recessed 6-8mm) -
   it never touches the boolean solid, so it can't be dragged into a bad
   shape by it. Thin Trim boxes at each pillar gap read as the window
   surrounds so the greenhouse doesn't look like one glass blob.
6. Wheel-position and body-relative detail placement (lights, mirrors,
   grille, bumper lips) all query `body.local_size_at(curves, y)`, which
   samples the same side/plan curves the body was built from, instead of
   re-deriving the silhouette from the spec - so details stay flush with
   whatever the boolean actually produced.

Wheels are unrelated geometry (hub-centred tyre+rim revolve, `wheels.py`)
and are simply positioned at the four hub points.

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
