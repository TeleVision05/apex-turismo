"""Reusable curve/section math for the deterministic body loft.

`catmull_rom_eval` is a cubic Hermite spline through (x, value) keypoints
using centripetal-style finite-difference tangents damped by `tension`
(0.5 per the brief - half-strength tangents, so segments between very
different neighbours don't overshoot into an S-curve).

`rounded_trapezoid_section` builds one closed cross-section loop (a
rounded rectangle when bottom_w==top_w, a rounded-top trapezoid otherwise)
used for both the lower-body loft and the greenhouse loft.
"""
import math


def catmull_rom_eval(pts, x, tension=0.5):
    """pts: sorted [(x, value), ...]. Returns the interpolated value at x."""
    n = len(pts)
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    i = 0
    while i < n - 2 and pts[i + 1][0] < x:
        i += 1
    x0, v0 = pts[i]
    x1, v1 = pts[i + 1]
    scale = 1.0 - tension
    if i - 1 >= 0:
        xm1, vm1 = pts[i - 1]
        m0 = scale * (v1 - vm1) / (x1 - xm1)
    else:
        m0 = scale * (v1 - v0) / (x1 - x0)
    if i + 2 < n:
        x2, v2 = pts[i + 2]
        m1 = scale * (v2 - v0) / (x2 - x0)
    else:
        m1 = scale * (v1 - v0) / (x1 - x0)
    t = (x - x0) / (x1 - x0)
    t2, t3 = t * t, t * t * t
    h00, h10 = 2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t
    h01, h11 = -2 * t3 + 3 * t2, t3 - t2
    dx = x1 - x0
    return h00 * v0 + h10 * dx * m0 + h01 * v1 + h11 * dx * m1


class Profile:
    """A tunable keypoint table (x_fraction in [0,1], value) turned into a
    queryable function of absolute x (metres), x_fraction * L."""

    def __init__(self, keypoints_frac, length):
        self.pts = sorted((xf * length, v) for xf, v in keypoints_frac)

    def __call__(self, x):
        return catmull_rom_eval(self.pts, x)


def _corner_arc(cy, cz, r, theta0, theta1, n=6):
    pts = []
    for i in range(n):
        t = theta0 + (theta1 - theta0) * i / (n - 1)
        rad = math.radians(t)
        pts.append((cy + r * math.cos(rad), cz + r * math.sin(rad)))
    return pts


def rounded_trapezoid_section(bottom_w, top_w, zf, zt, rb, rt, crown=0.0,
                               edge_mid=True, n_per_corner=9):
    """One closed loop of 2D (y, z) points: a rounded rectangle (or, when
    bottom_w != top_w, a rounded-top trapezoid - the greenhouse tumblehome).
    Order: bottom-right corner -> [right mid] -> top-right -> [top mid,
    crowned] -> top-left -> [left mid] -> bottom-left -> [bottom mid]."""
    rb = max(0.005, min(rb, (zt - zf) * 0.45, bottom_w * 0.45))
    rt = max(0.005, min(rt, (zt - zf) * 0.45, top_w * 0.45))
    BR = _corner_arc(bottom_w - rb, zf + rb, rb, -90, 0, n_per_corner)
    TR = _corner_arc(top_w - rt, zt - rt, rt, 0, 90, n_per_corner)
    TL = _corner_arc(-(top_w - rt), zt - rt, rt, 90, 180, n_per_corner)
    BL = _corner_arc(-(bottom_w - rb), zf + rb, rb, 180, 270, n_per_corner)

    pts = list(BR)
    if edge_mid:
        pts.append(((BR[-1][0] + TR[0][0]) / 2, (BR[-1][1] + TR[0][1]) / 2))
    pts.extend(TR)
    if edge_mid:
        pts.append((0.0, zt + crown))
    pts.extend(TL)
    if edge_mid:
        pts.append(((TL[-1][0] + BL[0][0]) / 2, (TL[-1][1] + BL[0][1]) / 2))
    pts.extend(BL)
    if edge_mid:
        pts.append((0.0, zf))
    return pts
