"""Entry point. Run headless:
  Blender --background --python tools/cars/build_cars.py -- [car ids...]
With no ids, builds the whole roster.
"""
import os
import sys
import json

import bpy

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import specs
import materials as materials_mod
import body
import wheels
import details
import export as export_mod
import render as render_mod

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
MODELS_DIR = os.path.join(REPO_ROOT, "public", "models", "cars")
PREVIEW_DIR = os.path.join(SCRIPT_DIR, "previews")


def _finalize_group(obj, mat):
    """Every join_group() result can carry a phantom empty material slot
    from whatever boolean/bevel ops its parts went through - pin it down
    to exactly one slot (`mat`, index 0) before export."""
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0
    return obj


def _build_body_and_glass(spec, bounds, mats):
    body_obj = body.build_body(spec, bounds, mats)
    glass_obj = body.build_glass(spec, bounds, mats)
    pillar_parts = body.build_pillars(spec, bounds, mats)
    wing_body, wing_trim = details.build_wing(spec, bounds, mats)
    if wing_body:
        body_obj = export_mod.join_group([body_obj] + wing_body, "Body")
        _finalize_group(body_obj, mats["Paint"])
    return body_obj, glass_obj, pillar_parts, wing_trim


def _build_detail_groups(spec, curves, bounds, mats, pillar_parts, wing_trim):
    trim_parts = (details.build_mirrors(spec, curves, bounds, mats)
                  + details.build_grille(spec, curves, bounds, mats)
                  + details.build_bumper_lips(spec, curves, bounds, mats)
                  + details.build_splitter_diffuser(spec, bounds, mats)
                  + wing_trim + pillar_parts)
    trim_obj = _finalize_group(export_mod.join_group(trim_parts, "Trim"), mats["Trim"])

    chrome_parts = details.build_exhaust(spec, bounds, mats) + details.build_badge(spec, bounds, mats)
    chrome_obj = _finalize_group(export_mod.join_group(chrome_parts, "Chrome"), mats["Chrome"])

    headlight_obj = _finalize_group(
        export_mod.join_group(details.build_headlights(spec, curves, bounds, mats), "Headlights"),
        mats["Headlight"])
    taillight_obj = _finalize_group(
        export_mod.join_group(details.build_taillights(spec, curves, bounds, mats), "Taillights"),
        mats["Taillight"])
    brakelight_obj = _finalize_group(
        export_mod.join_group(details.build_brakelights(spec, curves, bounds, mats), "Brakelights"),
        mats["Brakelight"])
    interior_obj = _finalize_group(
        export_mod.join_group(details.build_interior(spec, bounds, mats), "Interior"),
        mats["Interior"])

    return dict(trim=trim_obj, chrome=chrome_obj, headlights=headlight_obj,
                taillights=taillight_obj, brakelights=brakelight_obj, interior=interior_obj)


def build_one_car(car_id, do_render=True):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    spec = specs.get_spec(car_id)
    mats = materials_mod.build_materials()

    bounds = body.compute_bounds(spec)
    curves = body.get_curves(spec, bounds)
    body_obj, glass_obj, pillar_parts, wing_trim = _build_body_and_glass(spec, bounds, mats)
    groups = _build_detail_groups(spec, curves, bounds, mats, pillar_parts, wing_trim)
    steering_obj = details.build_steering_wheel(spec, bounds, mats)
    wb = wheels.build_all_wheels(spec, mats)

    root = export_mod.build_hierarchy(
        car_id, body_obj, glass_obj, groups["trim"], groups["chrome"], groups["headlights"],
        groups["taillights"], groups["brakelights"], groups["interior"], steering_obj, wb)

    os.makedirs(MODELS_DIR, exist_ok=True)
    glb_path = os.path.join(MODELS_DIR, f"{car_id}.glb")
    export_mod.export_glb(root, glb_path)

    tri_count = export_mod.triangle_count(body_obj) + export_mod.triangle_count(glass_obj)
    for obj in list(wb.values()) + list(groups.values()) + [steering_obj]:
        tri_count += export_mod.triangle_count(obj)

    measured = export_mod.measure_dimensions(body_obj, glass_obj, wb)

    preview_paths = {}
    if do_render:
        os.makedirs(PREVIEW_DIR, exist_ok=True)
        render_mod.setup_studio(spec)
        preview_paths = render_mod.render_views(spec, PREVIEW_DIR, car_id)

    return dict(spec=spec, tri_count=tri_count, glb_path=glb_path,
                preview_paths=preview_paths, bounds=bounds, measured=measured)


def write_index(entries):
    index_path = os.path.join(MODELS_DIR, "index.json")
    with open(index_path, "w") as f:
        json.dump(entries, f, indent=2)
    return index_path


def main():
    argv = sys.argv
    if "--" in argv:
        car_ids = argv[argv.index("--") + 1:]
    else:
        car_ids = []
    if not car_ids:
        car_ids = list(specs.ROSTER_ORDER)

    index_entries = []
    for car_id in car_ids:
        print(f"=== building {car_id} ===")
        result = build_one_car(car_id, do_render=True)
        m = result["measured"]
        index_entries.append(dict(
            id=car_id, file=f"{car_id}.glb",
            length=round(m["length"], 4), width=round(m["width"], 4),
            height=round(m["height"], 4), wheelbase=round(m["wheelbase"], 4),
            trackFront=round(m["trackFront"], 4), trackRear=round(m["trackRear"], 4),
            wheelRadius=round(m["wheelRadius"], 4), tyreWidth=round(m["tyreWidth"], 4),
            triangles=result["tri_count"],
        ))
        print(f"    triangles={result['tri_count']} glb={result['glb_path']}")

    if len(car_ids) == len(specs.ROSTER_ORDER):
        idx_path = write_index(index_entries)
        print(f"wrote {idx_path}")
    else:
        print("partial build - not overwriting index.json; entries:")
        print(json.dumps(index_entries, indent=2))


if __name__ == "__main__":
    main()
