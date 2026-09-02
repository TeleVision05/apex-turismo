"""One-off helper: fetch all tracks' raceway ways in a single combined
Overpass query (to stay well under public-mirror rate limits) and split the
result into the normal per-track cache files that overpass.fetch_overpass()
expects, so the rest of the pipeline needs no changes."""
import json
import sys
from pathlib import Path

from overpass import fetch_overpass, CACHE_DIR
from build_tracks import TRACKS


def combined_query(specs):
    parts = [f'way["highway"="raceway"](around:{r},{lat},{lon});' for (_, lat, lon, r) in specs]
    return "[out:json][timeout:180];(" + "".join(parts) + ");out geom;"


def way_center(way):
    geom = way["geometry"]
    lat = sum(p["lat"] for p in geom) / len(geom)
    lon = sum(p["lon"] for p in geom) / len(geom)
    return lat, lon


def assign_and_split(elements, specs):
    per_track = {tid: [] for (tid, _, _, _) in specs}
    for el in elements:
        if el.get("type") != "way" or "geometry" not in el:
            continue
        wlat, wlon = way_center(el)
        best_tid, best_d = None, None
        for tid, lat, lon, _r in specs:
            d = (wlat - lat) ** 2 + (wlon - lon) ** 2
            if best_d is None or d < best_d:
                best_d, best_tid = d, tid
        per_track[best_tid].append(el)
    return per_track


def main():
    ids = sys.argv[1:] or [t[0] for t in TRACKS if t[0] != "suzuka"]
    specs = [(t[0], t[6], t[7], t[8]) for t in TRACKS if t[0] in ids]
    print(f"Fetching combined query for: {[s[0] for s in specs]}")
    q = combined_query(specs)
    data = fetch_overpass("_bulk", q)
    per_track = assign_and_split(data["elements"], specs)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    for tid, elements in per_track.items():
        out_path = CACHE_DIR / f"{tid}.json"
        if out_path.exists():
            print(f"  {tid}: cache already exists, skipping ({len(elements)} found)")
            continue
        out_path.write_text(json.dumps({"elements": elements}))
        print(f"  {tid}: {len(elements)} ways -> {out_path}")


if __name__ == "__main__":
    main()
