"""Small detail parts: lights, mirrors, grille, splitter/diffuser, wing,
exhaust tips, interior and the steering wheel.

Every builder here returns one or more small bpy objects; build_cars.py
groups them by target material/category and joins each group into the one
named object the GLB contract requires (Headlights, Taillights, ... ).
"""
import math
import bmesh
import bpy

import body


def _new_object(name):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def _box_bm(bm, size, mat_idx=0):
    sx, sy, sz = size[0] / 2, size[1] / 2, size[2] / 2
    v = [bm.verts.new(c) for c in (
        (-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz),
        (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz))]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2),
             (2, 6, 7, 3), (3, 7, 4, 0)]
    for f in faces:
        face = bm.faces.new([v[i] for i in f])
        face.material_index = mat_idx


def _box_obj(name, size, loc, mat, rot=(0, 0, 0)):
    bm = bmesh.new()
    _box_bm(bm, size)
    obj = _new_object(name)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    for p in obj.data.polygons:
        p.use_smooth = False
    return obj


def _cylinder_obj(name, radius, length, loc, mat, axis='Y', segments=16, rot=(0, 0, 0)):
    bm = bmesh.new()
    n = segments
    ring_a, ring_b = [], []
    half = length / 2
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        if axis == 'Y':
            ring_a.append(bm.verts.new((radius * c, -half, radius * s)))
            ring_b.append(bm.verts.new((radius * c, half, radius * s)))
        elif axis == 'Z':
            ring_a.append(bm.verts.new((radius * c, radius * s, -half)))
            ring_b.append(bm.verts.new((radius * c, radius * s, half)))
        else:  # 'X'
            ring_a.append(bm.verts.new((-half, radius * c, radius * s)))
            ring_b.append(bm.verts.new((half, radius * c, radius * s)))
    for i in range(n):
        v1, v2 = ring_a[i], ring_a[(i + 1) % n]
        v3, v4 = ring_b[(i + 1) % n], ring_b[i]
        bm.faces.new((v1, v2, v3, v4))
    if axis == 'Y':
        centre_a, centre_b = bm.verts.new((0, -half, 0)), bm.verts.new((0, half, 0))
    elif axis == 'Z':
        centre_a, centre_b = bm.verts.new((0, 0, -half)), bm.verts.new((0, 0, half))
    else:
        centre_a, centre_b = bm.verts.new((-half, 0, 0)), bm.verts.new((half, 0, 0))
    for i in range(n):
        bm.faces.new((ring_a[(i + 1) % n], ring_a[i], centre_a))
        bm.faces.new((ring_b[i], ring_b[(i + 1) % n], centre_b))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _new_object(name)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mat)
    obj.location = loc
    obj.rotation_euler = rot
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


# (width, depth, height) - real lens sizes, not slabs. quad_round (GT3) is
# two round discs per side instead, handled separately below.
LIGHT_SIZE = {
    "flat_pop": (0.30, 0.05, 0.14), "wedge": (0.34, 0.05, 0.12),
    "angular": (0.34, 0.05, 0.12), "slit": (0.34, 0.04, 0.09),
}


def _compound_round_light(name, cx, y, z, r, materials, lens_mat, chrome=True):
    """Dark reflector cavity (Trim) behind a thin chrome bezel ring behind a
    bright lens disc (lens_mat), stepped in Y so it reads as a real housing
    instead of a flat emissive disc. y is the outer body surface Y. Returns
    (trim_parts, chrome_parts, lens_parts) - callers must route each list
    to its own contract object; a Headlights/Taillights object may only
    carry the `lens_mat` material, so the reflector/bezel geometry has to
    live on Trim/Chrome instead."""
    trim = [_cylinder_obj(f"{name}_reflector", r * 0.95, 0.03,
                           (cx, y - 0.034, z), materials["Trim"], axis='Y')]
    chrome_parts = []
    if chrome:
        chrome_parts.append(_cylinder_obj(f"{name}_bezel", r * 0.90, 0.012,
                                           (cx, y - 0.018, z), materials["Chrome"], axis='Y'))
    lens = [_cylinder_obj(f"{name}_lens", r * 0.74, 0.014,
                           (cx, y - 0.008, z), materials[lens_mat], axis='Y')]
    return trim, chrome_parts, lens


def _compound_box_light(name, cx, y, z, size, materials, lens_mat, chrome=True):
    w, d, h = size
    trim = [_box_obj(f"{name}_reflector", (w, 0.03, h), (cx, y - 0.032, z), materials["Trim"])]
    chrome_parts = []
    if chrome:
        chrome_parts.append(_box_obj(f"{name}_bezel", (w * 1.12, 0.012, h * 1.12),
                                      (cx, y - 0.017, z), materials["Chrome"]))
    lens = [_box_obj(f"{name}_lens", (w * 0.82, 0.012, h * 0.82),
                      (cx, y - 0.007, z), materials[lens_mat])]
    return trim, chrome_parts, lens


def build_headlights(spec, curves, bounds, materials):
    """Inset into the nose surface, centred at 0.55 of the nose (bumper-top)
    height. Each unit is a layered reflector/bezel/lens stack, not a flat
    emissive slab, so it reads as a real light housing up close. Returns
    (trim_parts, chrome_parts, lens_parts) - see _compound_*_light."""
    nose_x = 0.02 * curves["L"]
    y = body.blender_y(nose_x, bounds) - 0.01
    half_w, _ = body.size_at_y(curves, bounds, y)
    hw = half_w * 0.80
    z = curves["zt"](0.0) * 0.55
    style = spec["headlight_style"]
    trim, chrome_parts, lens = [], [], []
    for side, sx in (("L", -1), ("R", 1)):
        cx = sx * hw
        if style == "quad_round":
            r = 0.07
            for i, oz in enumerate((z - r * 1.1, z + r * 1.1)):
                t, c, l = _compound_round_light(f"Headlight_{side}_{i}", cx, y, oz, r,
                                                 materials, "Headlight")
                trim += t; chrome_parts += c; lens += l
        else:
            size = LIGHT_SIZE.get(style, LIGHT_SIZE["wedge"])
            t, c, l = _compound_box_light(f"Headlight_{side}", cx, y, z, size,
                                           materials, "Headlight")
            trim += t; chrome_parts += c; lens += l
    return trim, chrome_parts, lens


def build_taillights(spec, curves, bounds, materials):
    """Returns (trim_parts, lens_parts) - the "bar" backing and the reflector
    cavity behind quad-round/box lenses are Trim; only the lens is
    Taillight-material (chrome bezels are skipped on tail units)."""
    style = spec.get("taillight_style", "wedge")
    y = bounds["y_rear_bump"] + 0.08
    half_w, top = body.size_at_y(curves, bounds, y)
    hw = half_w * 0.90
    z = top * 0.62
    trim, lens = [], []
    if style == "bar":
        # a full-width light bar (SF90-style): dark backing spanning most of
        # the tail, a slim bright strip proud of it.
        span = half_w * 1.7
        trim.append(_box_obj("Taillight_bar_backing", (span, 0.03, 0.05),
                              (0, y - 0.03, z), materials["Trim"]))
        lens.append(_box_obj("Taillight_bar_lens", (span * 0.94, 0.012, 0.022),
                              (0, y - 0.012, z), materials["Taillight"]))
        return trim, lens
    for side, sx in (("L", -1), ("R", 1)):
        cx = sx * hw
        if style == "quad_round":
            r = 0.07
            for i, oz in enumerate((z - r * 1.1, z + r * 1.1)):
                t, _c, l = _compound_round_light(f"Taillight_{side}_{i}", cx, y - 0.05, oz, r,
                                                  materials, "Taillight", chrome=False)
                trim += t; lens += l
        else:
            w, d, h = LIGHT_SIZE.get(style, LIGHT_SIZE["wedge"])
            t, _c, l = _compound_box_light(f"Taillight_{side}", cx, y - 0.05, z, (w, d, h),
                                            materials, "Taillight", chrome=False)
            trim += t; lens += l
    return trim, lens


def build_brakelights(spec, curves, bounds, materials):
    y = bounds["y_rear_bump"] + 0.08
    half_w, top = body.size_at_y(curves, bounds, y)
    hw = half_w * 0.90
    z = top * 0.62
    objs = []
    for side, sx in (("L", -1), ("R", 1)):
        objs.append(_box_obj(f"Brakelight_{side}", (0.10, 0.03, 0.06),
                              (sx * hw, y - 0.025, z), materials["Brakelight"]))
    return objs


def build_mirrors(spec, curves, bounds, materials):
    """Stalk + housing (Trim) with a flat Chrome mirror face on the
    inboard-facing side, so it doesn't read as a solid black block."""
    if spec.get("mirror_style", "door") == "none":
        return []
    y = body.blender_y(curves["xa"], bounds) - 0.18
    belt_x, _ = body.size_at_y(curves, bounds, y)
    belt_z = body.belt_z_of(spec)
    objs = []
    for side, sx in (("L", -1), ("R", 1)):
        objs.append(_box_obj(f"Mirror_{side}_stalk", (0.05, 0.05, 0.03),
                              (sx * (belt_x + 0.05), y, belt_z + 0.06), materials["Trim"]))
        housing_x = sx * (belt_x + 0.13)
        objs.append(_box_obj(f"Mirror_{side}_housing", (0.14, 0.09, 0.06),
                              (housing_x, y, belt_z + 0.07), materials["Trim"]))
        objs.append(_box_obj(f"Mirror_{side}_face", (0.11, 0.01, 0.05),
                              (housing_x - sx * 0.02, y - 0.048, belt_z + 0.07),
                              materials["Chrome"]))
    return objs


GRILLE_BAR_COUNT = {"tall": 7, "wide": 5}


def _mesh_grille_bars(name_prefix, hw, hh, y, z, materials, vertical=False, bar_count=9):
    """A fine grid of thin bars across a recessed opening - a canvas-free
    way to fake a mesh/slat grille texture."""
    objs = []
    if vertical:
        for i in range(bar_count):
            t = (i + 0.5) / bar_count - 0.5
            objs.append(_box_obj(f"{name_prefix}_bar_{i}", (0.012, 0.03, hh * 1.9),
                                  (t * hw * 1.9, y, z), materials["Trim"]))
    else:
        for i in range(bar_count):
            t = (i + 0.5) / bar_count - 0.5
            objs.append(_box_obj(f"{name_prefix}_bar_{i}", (hw * 1.9, 0.03, 0.012),
                                  (0, y, z + t * hh * 1.9), materials["Trim"]))
    return objs


def build_grille(spec, curves, bounds, materials):
    """A recessed cavity (dark Trim backing set 3cm behind the nose surface)
    with a fine grid of thin bars in front of it, so it reads as a real mesh
    grille instead of a flat painted panel. `tall_grille` cars (a big
    upright kidney-style grille) get two narrower vertical-bar grilles side
    by side instead of one wide one."""
    nose_x = 0.02 * curves["L"]
    y = body.blender_y(nose_x, bounds) - 0.005
    z = curves["zt"](0.0) * 0.55
    objs = []
    if spec.get("tall_grille"):
        hh = curves["zt"](0.0) * 0.34
        for sx in (-1, 1):
            cx = sx * spec["width"] * 0.115
            hw = spec["width"] * 0.09
            objs.append(_box_obj(f"GrilleBacking_{sx}", (hw * 2, 0.02, hh * 2),
                                  (cx, y - 0.03, z + hh * 0.1), materials["Trim"]))
            objs.extend(_mesh_grille_bars(f"Grille_{sx}", hw, hh, y - 0.01,
                                           z + hh * 0.1, materials, vertical=True,
                                           bar_count=5))
    else:
        hw = spec["width"] * 0.20
        hh = 0.06
        objs.append(_box_obj("GrilleBacking", (hw * 2, 0.02, hh * 2),
                              (0, y - 0.03, z), materials["Trim"]))
        objs.extend(_mesh_grille_bars("Grille", hw, hh, y - 0.01, z, materials,
                                       vertical=False, bar_count=7))
    return objs


def _swept_strip(name, curves, bounds, x_samples, half_w_scale, z_fn,
                  thickness, mat):
    """A thin ribbon that follows the loft's own w(x) at each sample x -
    used for the bumper lips/splitter so they hug the nose/tail curvature
    instead of being a flat plank."""
    bm = bmesh.new()
    rings = []
    for x in x_samples:
        hw = curves["w"](max(0.0, min(curves["L"], x))) * half_w_scale
        y = body.blender_y(x, bounds)
        z = z_fn(x)
        rings.append([
            bm.verts.new((-hw, y, z - thickness / 2)),
            bm.verts.new((hw, y, z - thickness / 2)),
            bm.verts.new((hw, y, z + thickness / 2)),
            bm.verts.new((-hw, y, z + thickness / 2)),
        ])
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        for j in range(4):
            v1, v2 = a[j], a[(j + 1) % 4]
            v3, v4 = b[(j + 1) % 4], b[j]
            bm.faces.new((v1, v2, v3, v4))
    for ring in (rings[0], rings[-1]):
        try:
            bm.faces.new(ring)
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _new_object(name)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mat)
    return obj


def build_bumper_lips(spec, curves, bounds, materials):
    """Single lower valance ribbon per end — hugs the floor curve so it reads
    as the bottom of the bumper, not a second shelf mid-fascia."""
    L = curves["L"]
    front_x = [0.0, 0.04 * L, 0.08 * L, 0.12 * L]
    rear_x = [L - x for x in reversed(front_x)]
    # Keep the lip on the underside of the fascia (zf + thin half-height).
    z_f = lambda x: curves["zf"](x) + 0.012
    front = _swept_strip("BumperLip_F", curves, bounds, front_x, 0.88, z_f,
                          0.018, materials["Trim"])
    rear = _swept_strip("BumperLip_R", curves, bounds, rear_x, 0.88, z_f,
                         0.018, materials["Trim"])
    return [front, rear]


def build_front_bumper_detail(spec, curves, bounds, materials):
    """Lower-bumper intake + fog lamps seated on the same shelf as the lip
    so the nose reads as one bumper, not stacked bars.
    Returns (trim_parts, chrome_parts, headlight_lens_parts)."""
    nose_x = 0.015 * curves["L"]
    y = body.blender_y(nose_x, bounds) - 0.01
    # Same height band as BumperLip_F (zf + ~1–3cm).
    z = curves["zf"](0.0) + 0.035
    hw = spec["width"] * 0.14
    hh = 0.040
    trim = [_box_obj("LowerIntake_backing", (hw * 2, 0.02, hh * 2),
                      (0, y - 0.03, z), materials["Trim"])]
    trim.extend(_mesh_grille_bars("LowerIntake", hw, hh, y - 0.012, z,
                                   materials, vertical=False, bar_count=4))
    chrome_parts, lens = [], []
    for sx in (-1, 1):
        fog_x = sx * spec["width"] * 0.30
        t, c, l = _compound_round_light("FogLamp", fog_x, y, z, 0.028,
                                         materials, "Headlight", chrome=True)
        trim += t; chrome_parts += c; lens += l
    return trim, chrome_parts, lens


def build_license_plate(spec, curves, bounds, materials):
    """A shallow dark recess with a light plate inset, rear only (road
    cars) - race/prototype cars run without a plate. Returns
    (trim_parts, chrome_parts)."""
    if spec["body_style"] in ("gt_race", "prototype"):
        return [], []
    y = bounds["y_rear_bump"] + 0.10
    top = curves["zt"](curves["L"] - 0.02)
    z = top * 0.30
    trim = [_box_obj("PlateRecess", (0.24, 0.015, 0.13), (0, y - 0.02, z), materials["Trim"])]
    chrome_parts = [_box_obj("Plate", (0.20, 0.006, 0.10), (0, y - 0.01, z), materials["Chrome"])]
    return trim, chrome_parts


def build_door_details(spec, curves, bounds, materials):
    """Thin inset seam lines standing in for boolean-cut shut-line grooves
    (a body-surface boolean was judged too failure-prone across 9 very
    different silhouettes for this pass - see README deviations), plus a
    door-handle blister per side."""
    objs = []
    belt_z = body.belt_z_of(spec)
    half_w, _ = body.size_at_y(curves, bounds, body.blender_y(curves["xa"], bounds))
    # door shut line at the B-pillar
    y_b = body.blender_y(curves["xb"], bounds)
    for sx in (-1, 1):
        objs.append(_box_obj(f"DoorSeam_{sx}", (0.006, 0.02, belt_z * 0.75),
                              (sx * half_w * 0.99, y_b, belt_z * 0.5), materials["Trim"]))
        handle_y = y_b + 0.35
        objs.append(_box_obj(f"DoorHandle_{sx}", (0.02, 0.11, 0.035),
                              (sx * half_w * 1.0, handle_y, belt_z * 0.62), materials["Trim"]))
    # hood shut line (cowl) and trunk/deck shut line
    hood_y = body.blender_y(curves["xa"] - 0.04, bounds)
    hood_hw, hood_z = body.size_at_y(curves, bounds, hood_y)
    objs.append(_box_obj("HoodSeam", (hood_hw * 1.7, 0.008, 0.015),
                          (0, hood_y, hood_z - 0.01), materials["Trim"]))
    if spec["body_style"] not in ("wedge", "gt_race", "prototype"):
        trunk_y = body.blender_y(curves["xc"] + 0.03, bounds)
        trunk_hw, trunk_z = body.size_at_y(curves, bounds, trunk_y)
        objs.append(_box_obj("TrunkSeam", (trunk_hw * 1.5, 0.008, 0.015),
                              (0, trunk_y, trunk_z - 0.01), materials["Trim"]))
    return objs


def build_antenna(spec, curves, bounds, materials):
    """A short whip antenna at the base of the rear screen - skipped for
    open-cockpit/closed-canopy prototypes, which get their own dorsal fin."""
    if spec["body_style"] == "prototype":
        return []
    y = body.blender_y(curves["xc"], bounds) - 0.06
    hw, z = body.size_at_y(curves, bounds, y)
    return [_cylinder_obj("Antenna", 0.006, 0.14, (hw * 0.55, y, z + 0.07),
                           materials["Trim"], axis='Z', segments=8)]


def build_side_scoops(spec, curves, bounds, materials):
    """Mid-engine intake scallop ahead of the rear wheel."""
    if not spec.get("mid_engine"):
        return []
    objs = []
    y = bounds["y_rear_axle"] + 0.35
    hw, top = body.size_at_y(curves, bounds, y)
    z = top * 0.55
    for sx in (-1, 1):
        objs.append(_box_obj(f"SideScoop_{sx}", (0.015, 0.30, 0.14),
                              (sx * hw * 1.0, y, z), materials["Trim"]))
        for i in range(4):
            objs.append(_box_obj(f"SideScoop_{sx}_slat_{i}", (0.03, 0.02, 0.11),
                                  (sx * (hw * 1.0 + 0.02), y - 0.10 + i * 0.06, z),
                                  materials["Trim"]))
    return objs


def build_rear_vents(spec, curves, bounds, materials):
    """Rear-engine deck louvers (a la 911) over the engine bay."""
    if not spec.get("rear_engine"):
        return []
    y0 = body.blender_y(curves["xc"], bounds)
    hw, top = body.size_at_y(curves, bounds, y0)
    objs = []
    for i in range(6):
        yy = y0 - 0.05 - i * 0.035
        objs.append(_box_obj(f"RearVent_{i}", (hw * 1.3, 0.012, 0.01),
                              (0, yy, top - 0.02), materials["Trim"]))
    return objs


def build_fin(spec, curves, bounds, materials):
    """A dorsal stabiliser fin along the roof->tail centreline (LMP)."""
    if not spec.get("fin"):
        return []
    y0 = body.blender_y(curves["xc"] - 0.10, bounds)
    y1 = bounds["y_rear_bump"] + 0.10
    z0 = curves["H"]
    z1 = curves["zt"](curves["L"] - 0.10) + 0.03
    bm = bmesh.new()
    v = [
        bm.verts.new((-0.006, y0, z0)), bm.verts.new((0.006, y0, z0)),
        bm.verts.new((-0.006, y1, z1)), bm.verts.new((0.006, y1, z1)),
        bm.verts.new((-0.006, y1, z1 + 0.02)), bm.verts.new((0.006, y1, z1 + 0.02)),
    ]
    bm.faces.new((v[0], v[1], v[3], v[2]))
    bm.faces.new((v[2], v[3], v[5], v[4]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _new_object("Fin")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(materials["Trim"])
    return [obj]


def build_splitter_diffuser(spec, curves, bounds, materials):
    objs = []
    hw = spec["width"] / 2
    if spec.get("splitter"):
        L = curves["L"]
        protrusion = 0.06
        x_samples = [-protrusion, 0.0, 0.04 * L, 0.09 * L, 0.15 * L]
        z_f = lambda x: curves["zf"](max(0.0, x)) - 0.02
        objs.append(_swept_strip("Splitter", curves, bounds, x_samples, 0.90,
                                  z_f, 0.02, materials["Trim"]))
    if spec.get("diffuser"):
        n_fins = 5
        for i in range(n_fins):
            fx = (i - (n_fins - 1) / 2) * (hw * 1.5 / n_fins)
            objs.append(_box_obj(f"DiffuserFin_{i}", (0.02, 0.22, 0.10),
                                  (fx, bounds["y_rear_bump"] + 0.10,
                                   spec["ground_clearance"] * 0.6),
                                  materials["Trim"]))
    return objs


def build_wing(spec, curves, bounds, materials):
    """Returns (body_parts, trim_parts) - blade is Paint, uprights/endplates
    and lip-style spoilers are Trim, per the 'merged into Body/Trim' note.
    The uprights start ON the deck (zt at the wing's own x), not at a flat
    spec constant, so the wing never floats clear of the body."""
    wing = spec.get("wing", "none")
    if wing == "none":
        return [], []
    hw = spec["width"] / 2
    y = bounds["y_rear_bump"] + 0.18
    deck_z = body.size_at_y(curves, bounds, y)[1]
    if wing == "lip":
        trim = [_box_obj("Wing_lip", (hw * 1.6, 0.14, 0.02),
                          (0, y, deck_z + 0.02), materials["Trim"])]
        return [], trim
    # gt3: blade (90% of W) + 2 uprights (swan-neck ones angle in from the
    # blade's underside) + 2 endplates (0.25 x 0.12 m).
    span = hw * 0.90
    height = spec["height"] * (0.34 if spec.get("wing_swanneck") else 0.28)
    blade_z = deck_z + height
    body_parts = [_box_obj("Wing_blade", (span * 2, 0.22, 0.025), (0, y, blade_z),
                            materials["Paint"])]
    trim = []
    swan = spec.get("wing_swanneck")
    for sx in (-1, 1):
        ux_top = sx * span * (0.55 if swan else 0.75)
        ux_base = sx * span * 0.75
        trim.append(_box_obj(f"Wing_upright_{sx}", (0.035, 0.10, height),
                              ((ux_top + ux_base) / 2, y, deck_z + height / 2),
                              materials["Trim"],
                              rot=(0, 0, math.atan2(ux_top - ux_base, height) if swan else 0)))
        trim.append(_box_obj(f"Wing_endplate_{sx}", (0.02, 0.25, 0.12),
                              (sx * span, y, blade_z), materials["Trim"]))
    return body_parts, trim


def _exhaust_tip(name, radius, loc, materials, segments=16):
    """A genuinely hollow tip: an open chrome tube (no end caps) with a
    dark inner tube recessed a few cm behind the opening, instead of a
    solid chrome rod."""
    length = 0.10
    half = length / 2
    bm = bmesh.new()
    ring_a, ring_b = [], []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        c, s = math.cos(a), math.sin(a)
        ring_a.append(bm.verts.new((radius * c, -half, radius * s)))
        ring_b.append(bm.verts.new((radius * c, half, radius * s)))
    for i in range(segments):
        v1, v2 = ring_a[i], ring_a[(i + 1) % segments]
        v3, v4 = ring_b[(i + 1) % segments], ring_b[i]
        bm.faces.new((v1, v2, v3, v4))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    outer = _new_object(f"{name}_tip")
    bm.to_mesh(outer.data)
    bm.free()
    outer.data.materials.append(materials["Chrome"])
    outer.location = loc
    for p in outer.data.polygons:
        p.use_smooth = True
    x, y, z = loc
    inner = _cylinder_obj(f"{name}_bore", radius * 0.76, length * 0.5,
                           (x, y + 0.012, z), materials["Trim"], axis='Y')
    return [outer, inner]


def build_exhaust(spec, curves, bounds, materials):
    count = max(1, spec.get("exhaust_count", 1))
    hw = spec["width"] / 2 * 0.55
    # 0.28 m is the nominal height, but never higher than the local rear
    # -bumper surface actually reaches (a low car's tail tapers well under
    # that near the very tip).
    tail_x = curves["L"] - 0.04
    z = min(0.28, curves["zt"](tail_x) * 0.55)
    y = bounds["y_rear_bump"] + 0.04
    objs = []
    for i in range(count):
        x = 0.0 if count == 1 else (i - (count - 1) / 2) * (hw * 1.4 / max(1, count - 1))
        objs.extend(_exhaust_tip(f"Exhaust_{i}", 0.045, (x, y, z), materials))
    return objs


def build_badge(spec, curves, bounds, materials):
    """Sit right on the nose/tail surface height, not a generic mid-height
    guess - the nose tip is much lower than half the car's overall H."""
    return [_cylinder_obj("Badge_F", 0.04, 0.01, (0, bounds["y_front_bump"] - 0.015,
                           curves["zt"](0.02) * 0.96), materials["Chrome"], axis='Y'),
            _cylinder_obj("Badge_R", 0.04, 0.01, (0, bounds["y_rear_bump"] + 0.015,
                           curves["zt"](curves["L"] - 0.02) * 0.96), materials["Chrome"], axis='Y')]


def _roll_cage(y_cowl, y_trunk, hw, floor_z, roof_z, mat):
    """A simplified tube cage: two A-pillar bars, a windscreen header bar,
    a main hoop (uprights + roof bar) at the B-pillar, and two rear braces
    down to the rear floor - read as a real cage, not a decorative box."""
    objs = []
    r = 0.014
    top_z = roof_z - 0.05
    # A-pillar bars (front footwell -> windscreen header, both sides)
    for sx in (-1, 1):
        x = sx * hw * 0.55
        length = math.hypot(top_z - floor_z, 0.55)
        angle = math.atan2(0.55, top_z - floor_z)
        objs.append(_cylinder_obj(f"Cage_Apillar_{sx}", r, length,
                                   (x, y_cowl + 0.20, (floor_z + top_z) / 2),
                                   mat, axis='Z', segments=8, rot=(angle, 0, 0)))
    objs.append(_cylinder_obj("Cage_header", r, hw * 1.1,
                               (0, y_cowl + 0.35, top_z), mat, axis='X', segments=8))
    # main hoop at the B-pillar
    hoop_y = (y_cowl + y_trunk) / 2
    for sx in (-1, 1):
        objs.append(_cylinder_obj(f"Cage_hoop_{sx}", r, top_z - floor_z,
                                   (sx * hw * 0.60, hoop_y, (floor_z + top_z) / 2),
                                   mat, axis='Z', segments=8))
    objs.append(_cylinder_obj("Cage_roofbar", r, hw * 1.2,
                               (0, hoop_y, top_z), mat, axis='X', segments=8))
    # rear braces down to the rear floor
    for sx in (-1, 1):
        rear_y = hoop_y + 0.45
        length = math.hypot(top_z - floor_z, 0.45)
        angle = math.atan2(0.45, top_z - floor_z)
        objs.append(_cylinder_obj(f"Cage_brace_{sx}", r, length,
                                   (sx * hw * 0.60, hoop_y + 0.22, (floor_z + top_z) / 2),
                                   mat, axis='Z', segments=8, rot=(-angle, 0, 0)))
    return objs


def build_interior(spec, curves, bounds, materials):
    mat = materials["Interior"]
    y_cowl = body.blender_y(curves["xa"], bounds)
    y_trunk = body.blender_y(curves["xc"], bounds)
    hw = spec["width"] / 2 * 0.85
    floor_z = spec["ground_clearance"] + 0.03
    objs = [
        _box_obj("CabinFloor", (hw * 1.8, y_trunk - y_cowl, 0.02),
                  (0, (y_cowl + y_trunk) / 2, floor_z), mat),
        # dashboard body + a raised instrument-cowl hood over the binnacle
        # + a centre console running back from it
        _box_obj("Dashboard", (hw * 1.7, 0.18, 0.20),
                  (0, y_cowl + 0.20, spec["height"] * 0.40), mat),
        _box_obj("Dashboard_cowl", (hw * 0.55, 0.14, 0.09),
                  (-hw * 0.35, y_cowl + 0.14, spec["height"] * 0.40 + 0.13), mat),
        _box_obj("CentreConsole", (0.16, (y_trunk - y_cowl) * 0.45, 0.14),
                  (0.0, y_cowl + 0.45, floor_z + 0.09), mat),
        _box_obj("DoorCard_L", (0.04, (y_trunk - y_cowl) * 0.6, 0.28),
                  (-hw * 0.98, (y_cowl + y_trunk) / 2, spec["height"] * 0.34), mat),
        _box_obj("DoorCard_R", (0.04, (y_trunk - y_cowl) * 0.6, 0.28),
                  (hw * 0.98, (y_cowl + y_trunk) / 2, spec["height"] * 0.34), mat),
    ]
    # clamp seat-back height to whatever cabin headroom this car actually
    # has (low prototypes/wedges have far less than a notchback coupe) so
    # it never pokes up through the glass.
    headroom = max(0.24, spec["roof_height"] - floor_z - 0.14)
    back_h = min(0.46, headroom * 0.60)
    for side, sx in (("L", -1), ("R", 1)):
        sy = y_cowl + 0.55
        objs.append(_box_obj(f"Seat_{side}_base", (0.44, 0.46, 0.10),
                              (sx * hw * 0.42, sy, floor_z + 0.14), mat))
        objs.append(_box_obj(f"Seat_{side}_back", (0.42, 0.10, back_h),
                              (sx * hw * 0.42, sy - 0.20, floor_z + 0.14 + back_h / 2), mat,
                              rot=(math.radians(-8), 0, 0)))
        objs.append(_box_obj(f"Seat_{side}_bolster_L", (0.05, 0.44, back_h * 0.5),
                              (sx * hw * 0.42 - 0.19, sy - 0.03,
                               floor_z + 0.14 + back_h * 0.35), mat))
        objs.append(_box_obj(f"Seat_{side}_bolster_R", (0.05, 0.44, back_h * 0.5),
                              (sx * hw * 0.42 + 0.19, sy - 0.03,
                               floor_z + 0.14 + back_h * 0.35), mat))

    if spec["body_style"] in ("gt_race", "prototype"):
        objs.extend(_roll_cage(y_cowl, y_trunk, hw, floor_z, curves["H"], mat))
    elif not spec.get("mid_engine"):
        bench_y = y_trunk - 0.30
        objs.append(_box_obj("RearBench_base", (hw * 1.5, 0.34, 0.09),
                              (0, bench_y, floor_z + 0.09), mat))
        objs.append(_box_obj("RearBench_back", (hw * 1.5, 0.09, 0.30),
                              (0, bench_y - 0.16, floor_z + 0.09 + 0.15), mat,
                              rot=(math.radians(-6), 0, 0)))
    return objs


def build_steering_wheel(spec, curves, bounds, materials):
    """Torus rim + 3 spokes. Local Z is the column axis (per the object's
    own rotation) so the game can spin it about local Z; tilted 25 deg."""
    mat = materials["Interior"]
    bm = bmesh.new()
    ring_r, tube_r = 0.16, 0.018
    seg_major, seg_minor = 24, 8
    verts = [[None] * seg_minor for _ in range(seg_major)]
    for i in range(seg_major):
        a = 2 * math.pi * i / seg_major
        cx, cy = math.cos(a) * ring_r, math.sin(a) * ring_r
        nx, ny = math.cos(a), math.sin(a)
        for j in range(seg_minor):
            b = 2 * math.pi * j / seg_minor
            px = cx + nx * tube_r * math.cos(b)
            py = cy + ny * tube_r * math.cos(b)
            pz = tube_r * math.sin(b)
            verts[i][j] = bm.verts.new((px, py, pz))
    for i in range(seg_major):
        for j in range(seg_minor):
            a1, b1 = verts[i][j], verts[i][(j + 1) % seg_minor]
            a2, b2 = verts[(i + 1) % seg_major][(j + 1) % seg_minor], verts[(i + 1) % seg_major][j]
            bm.faces.new((a1, b1, a2, b2))
    for s in range(3):
        a = 2 * math.pi * s / 3
        ca, sa = math.cos(a), math.sin(a)
        _box_bm(bm, (ring_r * 1.9, 0.03, 0.02))
        for v in list(bm.verts)[-8:]:
            x, y, z = v.co
            v.co = (x * ca - y * sa, x * sa + y * ca, z)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    obj = _new_object("SteeringWheel")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True

    hw = spec["width"] / 2
    obj.location = (-hw * 0.42, body.blender_y(curves["xa"], bounds) + 0.10, spec["height"] * 0.44)
    obj.rotation_euler = (math.radians(25), 0, 0)
    return obj
