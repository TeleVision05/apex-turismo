"""Re-import an exported GLB in a *fresh* Blender session and assert the
contract. Run headless:
  Blender --background --python tools/cars/verify.py -- <car_id> [<car_id> ...]
Prints PASS/FAIL per assertion per car and exits non-zero on any failure.
"""
import os
import sys
import json

import bpy

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

    wheel_radius = index_by_id.get(car_id, {}).get("wheelRadius")
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

    fl = _find("Wheel_FL", objs)
    fr = _find("Wheel_FR", objs)
    rl = _find("Wheel_RL", objs)
    rr = _find("Wheel_RR", objs)
    if fl and fr:
        check("front wheels symmetric in X",
              abs(fl.matrix_world.translation.x + fr.matrix_world.translation.x) < 0.01)
    if rl and rr:
        check("rear wheels symmetric in X",
              abs(rl.matrix_world.translation.x + rr.matrix_world.translation.x) < 0.01)
    if fl and rl:
        check("front wheel ahead of rear wheel (+Y nose)",
              fl.matrix_world.translation.y > rl.matrix_world.translation.y)

    body = _find("Body", objs)
    if body:
        verts_y = [(body.matrix_world @ v.co).y for v in body.data.vertices]
        verts_z = [(body.matrix_world @ v.co).z for v in body.data.vertices]
        check("body nose extends toward +Y", max(verts_y) > abs(min(verts_y)) * 0.3)
        check("body sits on/above ground (min Z >= -0.02)", min(verts_z) >= -0.02,
              f"min_z={min(verts_z):.4f}")

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
