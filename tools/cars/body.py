"""Body + Glass generation - deterministic rounded-section loft.

Recipe (all metres; local x runs 0=nose -> L=tail, y is lateral half
-width, z is up - converted to Blender space only when vertices are
created):

  1. Five profile functions (`specs.get_profile`) evaluated with a damped
     Catmull-Rom spline (`curves.catmull_rom_eval`, tension 0.5) at
     stations every 0.04 m: w(x) plan half-width, zf(x) floor height,
     zt(x) lower-body top (hood/belt/deck line), rt(x) top corner radius.
     rb (rocker radius) is a constant.
  2. Each station is ONE rounded-rectangle cross-section (28 points: four
     6-point corner arcs + the four edge midpoints, the top one carrying a
     slight crown) - identical topology everywhere, so the loft can't
     self-intersect. Consecutive stations are bridged with quads, the two
     end stations capped with an n-gon, then Bevel + one Subdivision level.
  3. Wheel arches are cut with a boolean difference per wheel (not baked
     into the profile), plus a torus lip.
  4. The greenhouse is an independent rounded-trapezoid loft from xa to xc
     (tumblehome: wide base sunk into the belt, narrower rounded top that
     rides the roof curve `zr(x)`); its own top-facing (>60 deg from
     horizontal) faces are re-tagged Paint so the roof reads as sheet
     metal, the rest stays Glass. A/B/C pillars are separate raked boxes
     that never rise above zr(x) at their own x.
"""
import math
import bmesh
import bpy

import curves as curvemod
from specs import get_profile

ROW_FLOOR, ROW_SHOULDER, ROW_BELT, ROW_EDGE, ROW_TOP = range(5)  # legacy ids


def wheel_lateral_offset(spec):
    """Shared by the arch cutter and wheels.py - 'wheel centre y must equal
    the arch centre y'."""
    return spec["width"] / 2.0 - spec["tyre_width"] / 2.0 - 0.02


def compute_bounds(spec):
    length, wb = spec["length"], spec["wheelbase"]
    front_overhang = (length - wb) * spec["front_overhang_ratio"]
    rear_overhang = (length - wb) - front_overhang
    y_front_bump = wb / 2.0 + front_overhang
    y_rear_bump = -wb / 2.0 - rear_overhang
    return dict(y_rear_bump=y_rear_bump, y_front_bump=y_front_bump,
                y_rear_axle=-wb / 2.0, y_front_axle=wb / 2.0,
                x_rear_axle=y_front_bump + wb / 2.0,
                x_front_axle=y_front_bump - wb / 2.0,
                L=length)


def blender_y(x, b):
    """x (0=nose..L=tail) -> Blender/car-space Y (nose is +Y)."""
    return b["y_front_bump"] - x


def x_of(y, b):
    return b["y_front_bump"] - y


def belt_z_of(spec):
    return spec["height"] * spec["belt_height_ratio"]


def get_curves(spec, b):
    """Profile callables + greenhouse span, keyed by absolute x. Also
    exposes local_size_at() for placing details flush with the loft."""
    prof = get_profile(spec)
    L = b["L"]
    w = curvemod.Profile(prof["w"], L)
    zf = curvemod.Profile(prof["zf"], L)
    zt = curvemod.Profile(prof["zt"], L)
    rt = curvemod.Profile(prof["rt"], L)
    xa, xb, xc = prof["xa"] * L, prof["xb"] * L, prof["xc"] * L
    screen_run, back_run, H = prof["screen_run"], prof["back_run"], prof["H"]

    def zr(x):
        if x >= xa and x < xa + screen_run:
            t = (x - xa) / screen_run
            t = 0.5 - 0.5 * math.cos(math.pi * t)
            return zt(xa) + (H - zt(xa)) * t
        if x > xc - back_run and x <= xc:
            t = (x - (xc - back_run)) / back_run
            t = 0.5 - 0.5 * math.cos(math.pi * t)
            return H + (zt(xc) - H) * t
        if xa + screen_run <= x <= xc - back_run:
            return H
        return zt(x)

    return dict(w=w, zf=zf, zt=zt, rt=rt, zr=zr, xa=xa, xb=xb, xc=xc, L=L, H=H)


def size_at_y(cv, b, y):
    """(half_width, top_z) at a Blender-space Y, for detail placement."""
    x = x_of(y, b)
    return cv["w"](x), cv["zt"](x)
