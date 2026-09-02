"""Geometry helpers: lat/lon projection, resampling, smoothing, signed area."""
import math
import numpy as np


def make_projector(lat0, lon0):
    """Return (lonlat_to_xz) function for equirectangular projection centered at lat0/lon0.

    x = east meters, north = north meters, z = -north (Three.js convention).
    """
    cos_lat0 = math.cos(math.radians(lat0))

    def project(lat, lon):
        x = (lon - lon0) * cos_lat0 * 111320.0
        north = (lat - lat0) * 110540.0
        return x, north

    return project


def polyline_length(points):
    """points: list/array of (x, ...) at least 2D. Returns total arc length."""
    pts = np.asarray(points, dtype=float)
    d = np.diff(pts[:, :2], axis=0)
    return float(np.sum(np.hypot(d[:, 0], d[:, 1])))


def signed_area_xn(xs, ns):
    """Shoelace signed area in (x=east, north) plane. Positive = anticlockwise
    when viewed from above with north up (standard math convention)."""
    xs = np.asarray(xs, dtype=float)
    ns = np.asarray(ns, dtype=float)
    x2 = np.roll(xs, -1)
    n2 = np.roll(ns, -1)
    return 0.5 * float(np.sum(xs * n2 - x2 * ns))


def resample_closed_loop(xs, ns, spacing=4.0):
    """Resample a closed loop (x, north arrays, first point != last point) to
    ~spacing meters using a periodic cubic spline. Returns (xs_r, ns_r)."""
    from scipy.interpolate import splprep, splev

    xs = np.asarray(xs, dtype=float)
    ns = np.asarray(ns, dtype=float)
    # drop consecutive duplicate points which break splprep
    keep = np.ones(len(xs), dtype=bool)
    for i in range(1, len(xs)):
        if abs(xs[i] - xs[i - 1]) < 1e-9 and abs(ns[i] - ns[i - 1]) < 1e-9:
            keep[i] = False
    xs, ns = xs[keep], ns[keep]

    n_pts = len(xs)
    s = n_pts * 0.5
    tck, u = splprep([xs, ns], s=s, per=True, k=3)

    pre_length = polyline_length(np.column_stack([np.append(xs, xs[0]), np.append(ns, ns[0])]))
    n_samples = max(int(round(pre_length / spacing)), 8)

    u_fine = np.linspace(0, 1, n_samples, endpoint=False)
    xf, nf = splev(u_fine, tck)
    xf = np.asarray(xf)
    nf = np.asarray(nf)

    post_length = polyline_length(np.column_stack([np.append(xf, xf[0]), np.append(nf, nf[0])]))
    if pre_length > 0 and abs(post_length - pre_length) / pre_length > 0.01:
        # refine smoothing factor down and retry once
        tck, u = splprep([xs, ns], s=min(s, n_pts * 0.1), per=True, k=3)
        xf, nf = splev(u_fine, tck)
        xf, nf = np.asarray(xf), np.asarray(nf)

    return xf, nf


def periodic_gaussian_smooth(values, sigma_samples):
    """Gaussian smoothing on a periodic (closed-loop) 1D array."""
    values = np.asarray(values, dtype=float)
    n = len(values)
    radius = max(int(round(sigma_samples * 3)), 1)
    kernel_idx = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (kernel_idx / sigma_samples) ** 2)
    kernel /= kernel.sum()
    padded = np.concatenate([values[-radius:], values, values[:radius]])
    out = np.convolve(padded, kernel, mode="valid")
    return out[:n]


def heading_kinks_deg(xs, zs):
    """Max/array of absolute heading change (degrees) between consecutive
    segments of a closed loop in the x/z plane."""
    xs = np.asarray(xs, dtype=float)
    zs = np.asarray(zs, dtype=float)
    dx = np.roll(xs, -1) - xs
    dz = np.roll(zs, -1) - zs
    heading = np.arctan2(dz, dx)
    dh = np.roll(heading, -1) - heading
    dh = (dh + np.pi) % (2 * np.pi) - np.pi
    return np.degrees(np.abs(dh))


def nearest_index(xs, ns, x0, n0):
    xs = np.asarray(xs)
    ns = np.asarray(ns)
    d2 = (xs - x0) ** 2 + (ns - n0) ** 2
    return int(np.argmin(d2))
