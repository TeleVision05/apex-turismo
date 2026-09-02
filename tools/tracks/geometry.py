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


def _densify(xs, ns, max_gap=15.0):
    """Insert linearly-interpolated points into any raw gap longer than
    max_gap. OSM ways sometimes digitize long straights with just two
    sparse endpoint nodes; feeding that straight into splprep next to a
    tight corner starves the spline of local support and it overshoots,
    producing a tiny self-intersecting loop right at the corner apex
    (observed on Silverstone's Chapel-Curve/Hangar-Straight junction: a
    146 m raw chord next to a real corner produced a ~150-177 deg heading
    "kink" that persisted even with zero smoothing, i.e. it was a resampling
    artifact, not real track geometry). Denser input keeps the spline
    faithful to the corner instead of overshooting."""
    out_x, out_n = [xs[0]], [ns[0]]
    for i in range(1, len(xs) + 1):
        x0, n0 = xs[i - 1], ns[i - 1]
        x1, n1 = xs[i % len(xs)], ns[i % len(xs)]
        gap = math.hypot(x1 - x0, n1 - n0)
        if gap > max_gap:
            steps = int(math.ceil(gap / max_gap))
            for k in range(1, steps):
                t = k / steps
                out_x.append(x0 + (x1 - x0) * t)
                out_n.append(n0 + (n1 - n0) * t)
        if i < len(xs):
            out_x.append(x1)
            out_n.append(n1)
    return np.array(out_x), np.array(out_n)


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
    xs, ns = _densify(xs, ns)

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


def find_curvature_peaks(xs, zs, spacing=4.0, min_deg=3.0, min_separation_m=80.0):
    """Local maxima of heading-change magnitude along a closed loop -- used
    to synthesize "Turn N" corner markers when OSM has no (or too few)
    named corners. Returns indices sorted by curvature magnitude (highest
    first)."""
    from scipy.signal import find_peaks

    kink = heading_kinks_deg(xs, zs)
    # smooth lightly so noisy single-sample spikes don't dominate
    kink_s = periodic_gaussian_smooth(kink, sigma_samples=1.5)
    distance = max(int(round(min_separation_m / spacing)), 1)
    n = len(kink_s)
    padded = np.concatenate([kink_s, kink_s, kink_s])
    peaks, props = find_peaks(padded, height=min_deg, distance=distance)
    peaks = [p - n for p in peaks if n <= p < 2 * n]
    heights = [kink_s[p] for p in peaks]
    order = np.argsort(heights)[::-1]
    return [peaks[i] for i in order]


def nearest_index(xs, ns, x0, n0):
    xs = np.asarray(xs)
    ns = np.asarray(ns)
    d2 = (xs - x0) ** 2 + (ns - n0) ** 2
    return int(np.argmin(d2))
