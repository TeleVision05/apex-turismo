"""Render studio previews of an already-exported real-model GLB, the same
way build_cars.py does for the procedural roster, so the two can be
compared side by side. Run headless:

  Blender --background --python tools/cars/preview_real.py -- <car_id> [<car_id> ...]

Reads public/models/cars/<id>.glb and writes
tools/cars/previews_real/<id>_<view>.png (front34/rear34/side).
"""
import os
import sys

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import specs
import render as render_mod

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
MODELS_DIR = os.path.join(REPO_ROOT, "public", "models", "cars")
PREVIEW_DIR = os.path.join(SCRIPT_DIR, "previews_real")


def _recolor_paint():
    mat = bpy.data.materials.get("Paint")
    if mat is None or not mat.use_nodes:
        return
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        return
    srgb = [c / 255.0 for c in (0x2A, 0x5F, 0xB8)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    bsdf.inputs["Base Color"].default_value = (*linear, 1.0)


def render_one(car_id):
    glb_path = os.path.join(MODELS_DIR, f"{car_id}.glb")
    if not os.path.exists(glb_path):
        print(f"SKIP {car_id}: no glb at {glb_path}")
        return
    spec = specs.get_spec(car_id)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb_path)
    _recolor_paint()
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    render_mod.setup_studio(spec)
    paths = render_mod.render_views(spec, PREVIEW_DIR, car_id)
    print(f"RENDERED {car_id} -> {paths}")


def main():
    argv = sys.argv
    car_ids = argv[argv.index("--") + 1:] if "--" in argv else []
    if not car_ids:
        car_ids = list(specs.ROSTER_ORDER)
    for car_id in car_ids:
        render_one(car_id)


if __name__ == "__main__":
    main()
