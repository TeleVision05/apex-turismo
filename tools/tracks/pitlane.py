"""Optional pit lane polyline extraction."""
import math

from geometry import resample_closed_loop, nearest_index
import numpy as np
from scipy.interpolate import splprep, splev


def build_pit_lane(pit_ways, loop_xs, loop_ns, loop_y, node_xy, spacing=4.0):
    """Resample the pit lane way(s) every `spacing` m and attach elevation
    from the nearest main-loop point. Returns list[[x,y,z]] or None if the
    pit lane geometry looks too messy (very short, or far from the loop)."""
    if not pit_ways:
        return None
    way = max(pit_ways, key=lambda w: len(w.get("xy", [])))
    xy = way.get("xy")
    if not xy or len(xy) < 3:
        return None
    xs = np.array([p[0] for p in xy])
    ns = np.array([p[1] for p in xy])

    # sanity: pit lane should be reasonably close to the main loop somewhere
    loop_xs_a = np.asarray(loop_xs)
    loop_ns_a = np.asarray(loop_ns)
    end_d = min(
        np.min(np.hypot(loop_xs_a - xs[0], loop_ns_a - ns[0])),
        np.min(np.hypot(loop_xs_a - xs[-1], loop_ns_a - ns[-1])),
    )
    if end_d > 200:
        return None

    length = float(np.sum(np.hypot(np.diff(xs), np.diff(ns))))
    if length < 30:
        return None
    n_samples = max(int(round(length / spacing)), 4)
    try:
        tck, _ = splprep([xs, ns], s=len(xs) * 0.5, per=False, k=min(3, len(xs) - 1))
        u_fine = np.linspace(0, 1, n_samples)
        xf, nf = splev(u_fine, tck)
    except Exception:  # noqa: BLE001
        xf, nf = xs, ns

    pts = []
    for x0, n0 in zip(xf, nf):
        idx = nearest_index(loop_xs, loop_ns, x0, n0)
        y = loop_y[idx]
        pts.append([round(float(x0), 2), round(float(y), 2), round(float(-n0), 2)])
    return pts
