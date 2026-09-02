"""Re-import an exported GLB in a *fresh* Blender session and assert the
contract. Run headless:
  Blender --background --python tools/cars/verify.py -- <car_id> [<car_id> ...]
Prints PASS/FAIL per assertion per car and exits non-zero on any failure.
"""
import os
import sys
import json

import bpy
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
MODELS_DIR = os.path.join(REPO_ROOT, "public", "models", "cars")

REQUIRED_OBJECTS = [
    "Body", "Glass", "Trim", "Headlights", "Taillights", "Brakelights",
    "Interior", "SteeringWheel",
    "Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR",
    "Brake_FL", "Brake_FR", "Brake_RL", "Brake_RR",
]
REQUIRED_MATERIALS = [
    "Paint", "Glass", "Trim", "Headlight", "Taillight", "Brakelight",
    "Interior", "Rubber", "Rim", "Brake",
]


def _find(name, objs):
    for o in objs:
        if o.name == name or o.name.startswith(name + "."):
            return o
    return None


def _check_greenhouse_and_wing(check, world_pts, entry):
    H = entry.get("H")
    y_front, y_rear = entry.get("greenhouseYFront"), entry.get("greenhouseYRear")
    if H is None or y_front is None or y_rear is None:
        return
    span_z = [p.z for p in world_pts if y_rear - 0.05 <= p.y <= y_front + 0.05]
    if span_z:
        check("greenhouse max Z ~= H", H - 0.03 <= max(span_z) <= H + 0.01,
              f"max_z={max(span_z):.3f} H={H:.3f}")
    if not entry.get("hasWing", False):
        all_max_z = max(p.z for p in world_pts)
        check("nothing above H+0.05 (no wing on this car)", all_max_z <= H + 0.05,
              f"max_z={all_max_z:.3f} H={H:.3f}")


def _check_wheel_centring(check, objs, entry):
    # compare against the actual value used to both place the hub AND cut
    # the arch (body.wheel_lateral_offset at build time) - recomputing it
    # from the *measured* (bevel/subsurf-shrunk) body width would just
    # measure loft shrinkage, not arch/hub misalignment.
    expected_lat = entry.get("wheelLateralOffset")
    if expected_lat is None:
        return
    for wname in ("Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"):
        obj = _find(wname, objs)
        if obj is None:
            continue
        actual = abs(obj.matrix_world.translation.x)
        check(f"{wname} centred in its arch", abs(actual - expected_lat) < 0.01,
              f"actual={actual:.4f} expected={expected_lat:.4f}")


def _nearest_dists(sample_pts, ref_pts, chunk=3000):
    sample = np.array(sample_pts)
    ref = np.array(ref_pts)
    min_d = np.full(len(sample), np.inf)
    for i in range(0, len(ref), chunk):
        blk = ref[i:i + chunk]
        d = np.linalg.norm(sample[:, None, :] - blk[None, :, :], axis=2)
        min_d = np.minimum(min_d, d.min(axis=1))
    return min_d


# Trim's tolerance is wider than Chrome's: mirrors (on stalks) and wing
# uprights/endplates are Trim parts that sit away from the body BY DESIGN
# (the spec explicitly asks for stalk-mounted mirrors and a wing mounted
# 0.25-0.4m above the deck on its own uprights) - a bare 3cm check would
# fail them for doing exactly what was asked. 0.45m comfortably covers the
# tip of a swan-neck upright reaching up to the wing blade while still
# catching a genuinely floating/disconnected part (the bumper-lip and
# wheel-well bugs caught during development were 0.5-0.7m+).
# Chrome's exhaust tips are meant to protrude slightly past the rear
# valance/diffuser (real exhaust tips are not flush with the bodywork) -
# 0.16m covers a quad-exhaust car's outer tips; badges sit much closer.
PROXIMITY_TOLERANCE = {"Trim": 0.45, "Chrome": 0.16}


def _check_trim_proximity(check, objs):
    body = _find("Body", objs)
    if body is None:
        return
    body_pts = [tuple(body.matrix_world @ v.co) for v in body.data.vertices]
    for name, tol in PROXIMITY_TOLERANCE.items():
        obj = _find(name, objs)
        if obj is None or not obj.data.vertices:
            continue
        pts = [tuple(obj.matrix_world @ v.co) for v in obj.data.vertices]
        pts = pts[::max(1, len(pts) // 400)]  # subsample for speed
        d = _nearest_dists(pts, body_pts)
        check(f"{name} detail objects within {tol * 100:.0f}cm of the body surface",
              float(d.max()) <= tol, f"max_dist={float(d.max()):.4f}")


def _check_wheel_ground_contact(check, objs, wheel_radius):
    for wname in ("Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"):
        obj = _find(wname, objs)
        if obj is None:
            continue
        wm = obj.matrix_world.translation
        if wheel_radius is not None:
            check(f"{wname} hub Z ~= wheel radius", abs(wm.z - wheel_radius) < 0.02,
                  f"z={wm.z:.4f} r={wheel_radius}")
        mesh_min_z = min((obj.matrix_world @ v.co).z for v in obj.data.vertices)
        check(f"{wname} tyre bottom within 1cm of Z=0", mesh_min_z < 0.011,
              f"min_z={mesh_min_z:.4f}")

    fl, fr = _find("Wheel_FL", objs), _find("Wheel_FR", objs)
    rl, rr = _find("Wheel_RL", objs), _find("Wheel_RR", objs)
    if fl and fr:
        check("front wheels symmetric in X",
              abs(fl.matrix_world.translation.x + fr.matrix_world.translation.x) < 0.01)
    if rl and rr:
        check("rear wheels symmetric in X",
              abs(rl.matrix_world.translation.x + rr.matrix_world.translation.x) < 0.01)
    if fl and rl:
        check("front wheel ahead of rear wheel (+Y nose)",
              fl.matrix_world.translation.y > rl.matrix_world.translation.y)


def verify_car(car_id, index_by_id):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    glb_path = os.path.join(MODELS_DIR, f"{car_id}.glb")
    results = []

    def check(label, ok, detail=""):
        results.append((label, ok, detail))

    if not os.path.exists(glb_path):
        check("file exists", False, glb_path)
        return results

    bpy.ops.import_scene.gltf(filepath=glb_path)
    objs = list(bpy.context.scene.objects)

    root = _find("Car", objs)
    check("root 'Car' exists", root is not None)

    for name in REQUIRED_OBJECTS:
        obj = _find(name, objs)
        check(f"object '{name}' exists", obj is not None)

    _check_wheel_ground_contact(check, objs, index_by_id.get(car_id, {}).get("wheelRadius"))

    body = _find("Body", objs)
    entry = index_by_id.get(car_id, {})
    if body:
        world_pts = [body.matrix_world @ v.co for v in body.data.vertices]
        verts_y = [p.y for p in world_pts]
        verts_z = [p.z for p in world_pts]
        check("body nose extends toward +Y", max(verts_y) > abs(min(verts_y)) * 0.3)
        check("body sits on/above ground (min Z >= -0.02)", min(verts_z) >= -0.02,
              f"min_z={min(verts_z):.4f}")
        _check_greenhouse_and_wing(check, world_pts, entry)

    _check_wheel_centring(check, objs, entry)
    _check_trim_proximity(check, objs)

    total_tris = 0
    for o in objs:
        if o.type == 'MESH':
            for p in o.data.polygons:
                total_tris += max(0, len(p.vertices) - 2)
    check("triangle budget 25k-80k", 25000 <= total_tris <= 80000, f"tris={total_tris}")

    mat_names = set()
    for o in objs:
        if o.type == 'MESH':
            for slot in o.material_slots:
                if slot.material:
                    mat_names.add(slot.material.name.split(".")[0])
    for m in REQUIRED_MATERIALS:
        check(f"material '{m}' present", m in mat_names)

    return results


def main():
    argv = sys.argv
    if "--" in argv:
        car_ids = argv[argv.index("--") + 1:]
    else:
        car_ids = []
    index_path = os.path.join(MODELS_DIR, "index.json")
    index_by_id = {}
    if os.path.exists(index_path):
        with open(index_path) as f:
            for entry in json.load(f):
                index_by_id[entry["id"]] = entry
    if not car_ids:
        car_ids = list(index_by_id.keys())

    any_fail = False
    for car_id in car_ids:
        print(f"=== verify {car_id} ===")
        results = verify_car(car_id, index_by_id)
        for label, ok, detail in results:
            status = "PASS" if ok else "FAIL"
            if not ok:
                any_fail = True
            print(f"  [{status}] {label}" + (f" ({detail})" if detail else ""))

    sys.exit(1 if any_fail else 0)


if __name__ == "__main__":
    main()
