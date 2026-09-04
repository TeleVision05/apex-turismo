"""Merges partial-build measurements into public/models/cars/index.json
without disturbing existing entries (byte-for-byte) for ids not rebuilt.

Usage: python3 tools/cars/merge_index.py id1 id2 ...
Re-measures each id by loading its already-exported GLB is not possible
headlessly without Blender, so this script instead re-runs the Blender
measurement step for exactly the given ids (build_cars.py's own
"partial build" JSON on stdout) and merges the result. Run it right after
a partial `Blender --background --python build_cars.py -- <ids>` build,
passing the SAME ids, e.g.:

  Blender --background --python tools/cars/build_cars.py -- foo bar
  Blender --background --python tools/cars/merge_index.py -- foo bar
"""
import json
import os
import sys

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import build_cars  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
MODELS_DIR = os.path.join(REPO_ROOT, "public", "models", "cars")
INDEX_PATH = os.path.join(MODELS_DIR, "index.json")


def main():
    argv = sys.argv
    ids = argv[argv.index("--") + 1:] if "--" in argv else []
    if not ids:
        print("usage: merge_index.py -- id1 id2 ...")
        return

    with open(INDEX_PATH) as f:
        existing = json.load(f)
    by_id = {e["id"]: e for e in existing}

    for car_id in ids:
        print(f"=== measuring {car_id} ===")
        result = build_cars.build_one_car(car_id, do_render=False)
        m = result["measured"]
        cv, sp = result["curves"], result["spec"]
        entry = dict(
            id=car_id, file=f"{car_id}.glb",
            length=round(m["length"], 4), width=round(m["width"], 4),
            height=round(m["height"], 4), wheelbase=round(m["wheelbase"], 4),
            trackFront=round(m["trackFront"], 4), trackRear=round(m["trackRear"], 4),
            wheelRadius=round(m["wheelRadius"], 4), tyreWidth=round(m["tyreWidth"], 4),
            triangles=result["tri_count"],
            H=round(cv["H"], 4),
            greenhouseYFront=round(build_cars.body.blender_y(cv["xa"], result["bounds"]), 4),
            greenhouseYRear=round(build_cars.body.blender_y(cv["xc"], result["bounds"]), 4),
            hasWing=sp.get("wing", "none") != "none",
            wheelLateralOffset=round(build_cars.body.wheel_lateral_offset(sp), 4),
            source="procedural",
        )
        by_id[car_id] = entry

    # Preserve original ordering for pre-existing ids, append new ones in
    # the order they were requested.
    order = [e["id"] for e in existing] + [i for i in ids if i not in by_id or i not in
                                            [e["id"] for e in existing]]
    seen = set()
    merged = []
    for cid in order:
        if cid in seen:
            continue
        seen.add(cid)
        merged.append(by_id[cid])

    with open(INDEX_PATH, "w") as f:
        json.dump(merged, f, indent=2)
    print(f"wrote {INDEX_PATH} ({len(merged)} entries)")


if __name__ == "__main__":
    main()
