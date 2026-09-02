#!/usr/bin/env python
"""Build real-circuit track JSON files for the apex-turismo racing game.

Usage:
    .venv/bin/python build_tracks.py [track_id ...]

With no arguments, builds every track in TRACKS. See README.md.
"""
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np

from overpass import fetch_overpass, raceway_query, road_fallback_query
from stitch import (
    filter_ways,
    project_ways,
    build_graph,
    find_loop,
    extract_corners,
    dominant_width,
    START_WAY_RE,
)
from geometry import (
    resample_closed_loop,
    signed_area_xn,
    heading_kinks_deg,
    nearest_index,
    find_curvature_peaks,
)
from elevation import fetch_elevations_strided, fetch_elevations, process_elevation
from pitlane import build_pit_lane
from plotting import plot_track

ROOT = Path(__file__).parent
OUT_DIR = ROOT.parent.parent / "public" / "tracks"
PREVIEW_DIR = ROOT / "previews"

# id, name, country, length_m, direction, width_m, lat, lon, radius_m
TRACKS = [
    ("suzuka", "Suzuka Circuit", "Japan", 5807, "clockwise", 12, 34.8431, 136.5407, 3000),
    ("monza", "Autodromo Nazionale Monza", "Italy", 5793, "clockwise", 12, 45.6156, 9.2811, 3000),
    ("spa", "Circuit de Spa-Francorchamps", "Belgium", 7004, "clockwise", 12, 50.4372, 5.9714, 4000),
    ("laguna_seca", "WeatherTech Raceway Laguna Seca", "USA", 3602, "anticlockwise", 12, 36.5841, -121.7524, 2500),
    ("nurburgring_gp", "Nurburgring GP-Strecke", "Germany", 5148, "clockwise", 12, 50.3356, 6.9475, 3000),
    ("brands_hatch", "Brands Hatch GP", "UK", 3908, "clockwise", 11, 51.3569, 0.2631, 2500),
    ("tsukuba", "Tsukuba Circuit", "Japan", 2045, "clockwise", 10, 36.1517, 139.9202, 1500),
    ("bathurst", "Mount Panorama Circuit", "Australia", 6213, "anticlockwise", 11, -33.4470, 149.5544, 4000),
    ("fuji", "Fuji Speedway", "Japan", 4563, "clockwise", 13, 35.3717, 138.9270, 3000),
    ("interlagos", "Autodromo Jose Carlos Pace", "Brazil", 4309, "anticlockwise", 12, -23.7036, -46.6997, 2500),
    ("red_bull_ring", "Red Bull Ring", "Austria", 4318, "clockwise", 12, 47.2197, 14.7647, 2500),
    ("silverstone", "Silverstone Circuit", "UK", 5891, "clockwise", 13, 52.0786, -1.0169, 3500),
]

# Per-track hacks that couldn't be avoided, kept in one place with a reason.
OVERRIDES = {
    # Bathurst's public-road circuit is not fully tagged highway=raceway;
    # fall back to named public roads that make up the Mount Panorama lap.
    "bathurst": {
        "fallback_name_regex": "Conrod|Mountain|Panorama|Skyline|Dipper|Forrest|Reid|Sulman|McPhillamy|Pit"
    },
    # "Paddock Hill Bend" is Brands Hatch's real turn 1 -- the generic
    # pit/paddock/kart/service/access/escape name-drop regex (spec step 1)
    # would otherwise drop it as a paddock-access road, breaking loop
    # connectivity (way id from cache/brands_hatch.json).
    "brands_hatch": {"keep_way_ids": {25804653}},
    # A 3000 m radius pulls in the Nordschleife, Sprintstrecke, a rallycross
    # circuit and the Mullenbachschleife, all sharing junction nodes with the
    # GP-Strecke; the walker kept shortcutting onto them (confirmed
    # 2026-09-01: a ~4587 m loop through "Nurburgring Sprintstrecke" +
    # "Rallycross circuit" ways, a visibly wrong out-and-back spur in the
    # preview). Shrinking the search radius to 1500 m mostly excludes the
    # Nordschleife/Sprintstrecke loops geographically, and excluding the
    # remaining overlap by name isolates the compact 5148 m GP loop through
    # the Mercedes Arena / Ford-Kurve hairpins.
    "nurburgring_gp": {
        "radius_m": 1500,
        "extra_drop_regex": r"nordschleife|rallycross|sprint|m[uü]llenbach|kart|test",
    },
}


def build_one(spec, elevation_fn=None):
    tid, name, country, length_m, direction, width_m, lat, lon, radius_m = spec
    override = OVERRIDES.get(tid, {})
    elevation_fn = elevation_fn or fetch_elevations_strided
    radius_m = override.get("radius_m", radius_m)

    if "fallback_name_regex" in override:
        q = road_fallback_query(lat, lon, radius_m, override["fallback_name_regex"])
        raw = fetch_overpass(tid, q, cache_suffix="_roads")
        kept = [e for e in raw["elements"] if e.get("type") == "way" and "geometry" in e]
        pit_ways = []
    else:
        raw = fetch_overpass(tid, raceway_query(lat, lon, radius_m))
        elements = raw["elements"]
        if "extra_drop_regex" in override:
            pat = re.compile(override["extra_drop_regex"], re.I)
            elements = [
                e
                for e in elements
                if not any(pat.search(v) for k, v in e.get("tags", {}).items() if k == "name" or k.startswith("name:"))
            ]
        kept, pit_ways = filter_ways(elements, keep_way_ids=override.get("keep_way_ids"))

    if len(kept) < 2:
        raise RuntimeError(f"only {len(kept)} usable ways after filtering")

    _, origin = project_ways(kept, pit_ways)
    node_xy, edges = build_graph(kept)
    loop_path, loop_len_pre = find_loop(kept, node_xy, edges, length_m)
    loop_nodes = loop_path[:-1]

    xs = np.array([node_xy[n][0] for n in loop_nodes])
    ns = np.array([node_xy[n][1] for n in loop_nodes])
    xs_r, ns_r = resample_closed_loop(xs, ns, spacing=4.0)

    signed_area = signed_area_xn(xs_r, ns_r)
    is_anticlockwise = signed_area > 0
    wants_anticlockwise = direction == "anticlockwise"
    if is_anticlockwise != wants_anticlockwise:
        xs_r, ns_r = xs_r[::-1], ns_r[::-1]

    start_way = _find_start_way(kept)
    if start_way is not None:
        mx, mn = start_way["xy"][len(start_way["xy"]) // 2]
    else:
        mx, mn = xs_r[0], ns_r[0]
    start_idx = nearest_index(xs_r, ns_r, mx, mn)
    xs_r = np.roll(xs_r, -start_idx)
    ns_r = np.roll(ns_r, -start_idx)
    start_idx = 0

    lats, lons = _inverse_project(xs_r, ns_r, origin)
    raw_elev = elevation_fn(tid, lats, lons)
    ys_r = process_elevation(raw_elev, spacing_m=4.0)

    loop_node_set = set(loop_nodes)
    corner_defs = extract_corners(kept, loop_node_set)
    corners = []
    for c in corner_defs:
        if c["name"].strip().lower() == name.strip().lower():
            continue  # whole-circuit name (e.g. OSM tagged the full loop, not a corner)
        idx = int(nearest_index(xs_r, ns_r, c["mid_xy"][0], c["mid_xy"][1]))
        corners.append({"name": c["name"], "number": c["number"], "index": idx})
    corners.sort(key=lambda c: c["index"])

    if len(corners) < 6:
        corners = _synthesize_corners(corners, xs_r, ns_r, needed=6)

    width = dominant_width(kept) or width_m
    widths = [width] * len(xs_r)

    pit_lane = build_pit_lane(pit_ways, xs_r, ns_r, ys_r, node_xy)

    points = [[round(float(x), 2), round(float(y), 2), round(float(-n), 2)] for x, n, y in zip(xs_r, ns_r, ys_r)]
    total_len = _loop_length(points)

    kinks = heading_kinks_deg(np.array([p[0] for p in points]), np.array([p[2] for p in points]))

    out = {
        "id": tid,
        "name": name,
        "country": country,
        "lengthM": round(total_len, 1),
        "direction": direction,
        "sampleSpacingM": 4,
        "points": points,
        "widths": widths,
        "startIndex": start_idx,
        "corners": corners,
        "pitLane": pit_lane,
        "origin": {"lat": round(origin[0], 2), "lon": round(origin[1], 2)},
        "source": "OpenStreetMap contributors, ODbL; elevation Open-Meteo",
    }
    stats = {
        "id": tid,
        "points": len(points),
        "lengthM": total_len,
        "realLengthM": length_m,
        "maxGrade": _max_grade(ys_r),
        "elevRange": float(ys_r.max() - ys_r.min()),
        "corners": len(corners),
        "maxKink": float(kinks.max()),
    }
    return out, stats


def _synthesize_corners(corners, xs_r, ns_r, needed=6, min_sep_samples=20):
    """Top up a too-short OSM corner list with corners derived from
    curvature peaks (heading-change local maxima), named "Turn 1", "Turn
    2"... in driving order. Used when OSM has few/no named corner ways for
    a track (e.g. Fuji Speedway only tags the whole loop, not its corners)."""
    zs_r = -ns_r
    peak_idxs = find_curvature_peaks(xs_r, zs_r)
    existing_idxs = [c["index"] for c in corners]

    def far_enough(idx):
        n = len(xs_r)
        for e in existing_idxs:
            d = min(abs(idx - e), n - abs(idx - e))
            if d < min_sep_samples:
                return False
        return True

    chosen = []
    for idx in peak_idxs:
        if len(corners) + len(chosen) >= needed:
            break
        if far_enough(idx) and all(min(abs(idx - c), len(xs_r) - abs(idx - c)) >= min_sep_samples for c in chosen):
            chosen.append(idx)

    chosen.sort()
    synthetic = [{"name": f"Turn {i + 1}", "number": i + 1, "index": int(idx)} for i, idx in enumerate(chosen)]
    merged = corners + synthetic
    merged.sort(key=lambda c: c["index"])
    return merged


def _find_start_way(ways):
    named = [w for w in ways if any(START_WAY_RE.search(v) for k, v in w.get("tags", {}).items() if k == "name" or k.startswith("name:"))]
    if not named:
        return None
    named.sort(key=lambda w: -len(w.get("xy", [])))
    return named[0]


def _inverse_project(xs, ns, origin):
    lat0, lon0 = origin
    cos_lat0 = math.cos(math.radians(lat0))
    lats = lat0 + ns / 110540.0
    lons = lon0 + xs / (cos_lat0 * 111320.0)
    return lats, lons


def _loop_length(points):
    total = 0.0
    n = len(points)
    for i in range(n):
        a, b = points[i], points[(i + 1) % n]
        total += math.hypot(b[0] - a[0], b[2] - a[2])
    return total


def _max_grade(ys):
    dy = np.diff(np.concatenate([ys, ys[:1]]))
    return float(np.max(np.abs(dy)) / 4.0 * 100)


def main():
    ids = sys.argv[1:] or [t[0] for t in TRACKS]
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)

    results, failures, all_stats = [], [], []
    for spec in TRACKS:
        if spec[0] not in ids:
            continue
        tid = spec[0]
        print(f"--- building {tid} ---")
        if results or failures:
            time.sleep(4)  # be polite to the Overpass mirrors between tracks
        try:
            out, stats = build_one(spec)
        except Exception as e:  # noqa: BLE001
            print(f"FAILED {tid}: {e}")
            failures.append((tid, str(e)))
            continue
        (OUT_DIR / f"{tid}.json").write_text(json.dumps(out))
        plot_track(
            PREVIEW_DIR / f"{tid}.png",
            tid,
            out["name"],
            out["points"],
            out["corners"],
            out["startIndex"],
            out["direction"],
        )
        results.append(out)
        all_stats.append(stats)
        print(f"OK {tid}: {stats['points']} pts, {stats['lengthM']:.0f}m (real {stats['realLengthM']}m), max kink {stats['maxKink']:.1f} deg")

    rebuild_index()
    _print_summary(all_stats, failures)


def rebuild_index():
    """Rebuild index.json from every <id>.json actually present in
    OUT_DIR, not just the tracks built in this particular run -- so running
    build_tracks.py on a subset of ids never drops previously-built tracks
    from the index."""
    index = []
    for path in sorted(OUT_DIR.glob("*.json")):
        if path.name == "index.json":
            continue
        r = json.loads(path.read_text())
        index.append(
            {
                "id": r["id"],
                "name": r["name"],
                "country": r["country"],
                "lengthM": r["lengthM"],
                "direction": r["direction"],
                "corners": len(r["corners"]),
                "elevationRangeM": round(max(p[1] for p in r["points"]) - min(p[1] for p in r["points"]), 1),
            }
        )
    (OUT_DIR / "index.json").write_text(json.dumps(index, indent=2))
    return index


def _print_summary(all_stats, failures):
    print("\n=== SUMMARY ===")
    print(f"{'id':<16}{'pts':>6}{'lenM':>9}{'realM':>8}{'diff%':>8}{'maxGrade%':>11}{'elevRng':>9}{'corners':>9}{'maxKink':>9}")
    for s in all_stats:
        diff_pct = (s["lengthM"] - s["realLengthM"]) / s["realLengthM"] * 100
        print(
            f"{s['id']:<16}{s['points']:>6}{s['lengthM']:>9.0f}{s['realLengthM']:>8}{diff_pct:>7.1f}%{s['maxGrade']:>10.1f}%{s['elevRange']:>9.1f}{s['corners']:>9}{s['maxKink']:>9.1f}"
        )
    if failures:
        print("\nFailed:")
        for tid, err in failures:
            print(f"  {tid}: {err}")


if __name__ == "__main__":
    main()
