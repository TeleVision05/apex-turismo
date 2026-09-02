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
        else:  # 'X'
            ring_a.append(bm.verts.new((-half, radius * c, radius * s)))
            ring_b.append(bm.verts.new((half, radius * c, radius * s)))
    for i in range(n):
        v1, v2 = ring_a[i], ring_a[(i + 1) % n]
        v3, v4 = ring_b[(i + 1) % n], ring_b[i]
        bm.faces.new((v1, v2, v3, v4))
    centre_a = bm.verts.new((0, -half, 0) if axis == 'Y' else (-half, 0, 0))
    centre_b = bm.verts.new((0, half, 0) if axis == 'Y' else (half, 0, 0))
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


LIGHT_SIZE = {
    "flat_pop": (0.42, 0.10, 0.16), "wedge": (0.36, 0.09, 0.13),
    "quad_round": (0.30, 0.10, 0.20), "angular": (0.38, 0.09, 0.15),
    "slit": (0.46, 0.06, 0.07),
}


def _light_pair(style, y, z, half_w, depth, mat, name_prefix):
    """Front or rear light cluster, mirrored L/R. Returns list of objects."""
    w, d, h = LIGHT_SIZE.get(style, LIGHT_SIZE["wedge"])
    objs = []
    for side, sx in (("L", -1), ("R", 1)):
        cx = sx * half_w
        if style == "quad_round":
            r = h / 4.4
            for row in range(2):
                for col in range(2):
                    ox = cx + sx * (col - 0.5) * r * 2.3
                    oz = z + (row - 0.5) * r * 2.3
                    objs.append(_cylinder_obj(f"{name_prefix}_{side}_{row}{col}", r,
                                               depth, (ox, y, oz), mat, axis='Y'))
        else:
            objs.append(_box_obj(f"{name_prefix}_{side}", (w, depth, h),
                                  (cx, y, z), mat))
    return objs


def build_headlights(spec, curves, bounds, materials):
    y = bounds["y_front_bump"] - 0.08
    half_w, top = body.local_size_at(curves, y)
    hw = half_w * 0.90
    z = top * 0.72
    return _light_pair(spec["headlight_style"], y + 0.05, z, hw, 0.06,
                        materials["Headlight"], "Headlight")


def build_taillights(spec, curves, bounds, materials):
    style = spec["headlight_style"] if spec["headlight_style"] == "quad_round" else "wedge"
    y = bounds["y_rear_bump"] + 0.08
    half_w, top = body.local_size_at(curves, y)
    hw = half_w * 0.90
    z = top * 0.62
    return _light_pair(style, y - 0.05, z, hw, 0.05, materials["Taillight"], "Taillight")


def build_brakelights(spec, curves, bounds, materials):
    y = bounds["y_rear_bump"] + 0.08
    half_w, top = body.local_size_at(curves, y)
    hw = half_w * 0.90
    z = top * 0.62
    objs = []
    for side, sx in (("L", -1), ("R", 1)):
        objs.append(_box_obj(f"Brakelight_{side}", (0.10, 0.03, 0.06),
                              (sx * hw, y - 0.025, z), materials["Brakelight"]))
    return objs


def build_mirrors(spec, curves, bounds, materials):
    if spec.get("mirror_style", "door") == "none":
        return []
    y = bounds["y_cowl"] - 0.18
    belt_x, _ = body.local_size_at(curves, y)
    belt_z = body.belt_z_of(spec)
    objs = []
    for side, sx in (("L", -1), ("R", 1)):
        objs.append(_box_obj(f"Mirror_{side}_stalk", (0.05, 0.05, 0.03),
                              (sx * (belt_x + 0.05), y, belt_z + 0.06), materials["Trim"]))
        objs.append(_box_obj(f"Mirror_{side}_housing", (0.14, 0.09, 0.06),
                              (sx * (belt_x + 0.13), y, belt_z + 0.07), materials["Trim"]))
    return objs


def build_grille(spec, curves, bounds, materials):
    y = bounds["y_front_bump"] - 0.10
    half_w, _ = body.local_size_at(curves, y)
    hw = half_w * 0.55
    z = spec["height"] * (0.30 if not spec.get("tall_grille") else 0.24)
    h = spec["height"] * (0.14 if not spec.get("tall_grille") else 0.24)
    return [_box_obj("Grille", (hw * 2, 0.03, h), (0, y + 0.07, z), materials["Trim"])]


def build_bumper_lips(spec, curves, bounds, materials):
    y_f = bounds["y_front_bump"] - 0.05
    y_r = bounds["y_rear_bump"] + 0.05
    hw_f, _ = body.local_size_at(curves, y_f)
    hw_r, _ = body.local_size_at(curves, y_r)
    return [
        _box_obj("BumperLip_F", (hw_f * 1.5, 0.04, 0.05),
                  (0, y_f - 0.02, spec["ground_clearance"] * 0.55), materials["Trim"]),
        _box_obj("BumperLip_R", (hw_r * 1.5, 0.04, 0.05),
                  (0, y_r + 0.02, spec["ground_clearance"] * 0.55), materials["Trim"]),
    ]


def build_splitter_diffuser(spec, bounds, materials):
    objs = []
    hw = spec["width"] / 2
    if spec.get("splitter"):
        objs.append(_box_obj("Splitter", (hw * 1.9, 0.20, 0.02),
                              (0, bounds["y_front_bump"] + 0.08,
                               spec["ground_clearance"] * 0.35),
                              materials["Trim"]))
    if spec.get("diffuser"):
        n_fins = 5
        for i in range(n_fins):
            fx = (i - (n_fins - 1) / 2) * (hw * 1.5 / n_fins)
            objs.append(_box_obj(f"DiffuserFin_{i}", (0.02, 0.22, 0.10),
                                  (fx, bounds["y_rear_bump"] + 0.10,
                                   spec["ground_clearance"] * 0.6),
                                  materials["Trim"]))
    return objs


def build_wing(spec, bounds, materials):
    """Returns (body_parts, trim_parts) - blade is Paint, uprights/endplates
    and lip-style spoilers are Trim, per the 'merged into Body/Trim' note."""
    wing = spec.get("wing", "none")
    if wing == "none":
        return [], []
    hw = spec["width"] / 2
    y = bounds["y_rear_bump"] + 0.18
    if wing == "lip":
        trim = [_box_obj("Wing_lip", (hw * 1.6, 0.14, 0.02),
                          (0, y, spec["rear_deck_height"] + 0.02), materials["Trim"])]
        return [], trim
    # gt3: blade + 2 uprights + 2 endplates. `span` is the wing's HALF-span
    # (kept a little inside the body's own half-width, like a real wing).
    span = hw * 0.86
    height = spec["height"] * (0.30 if spec.get("wing_swanneck") else 0.24)
    blade_z = spec["rear_deck_height"] + height
    body = [_box_obj("Wing_blade", (span * 2, 0.22, 0.025), (0, y, blade_z),
                      materials["Paint"])]
    trim = []
    for sx in (-1, 1):
        ux = sx * span * 0.75
        trim.append(_box_obj(f"Wing_upright_{sx}", (0.035, 0.10, height),
                              (ux, y, spec["rear_deck_height"] + height / 2),
                              materials["Trim"]))
        trim.append(_box_obj(f"Wing_endplate_{sx}", (0.02, 0.26, height * 0.9),
                              (sx * span, y, blade_z), materials["Trim"]))
    return body, trim


def build_exhaust(spec, bounds, materials):
    count = max(1, spec.get("exhaust_count", 1))
    hw = spec["width"] / 2 * 0.55
    z = spec["ground_clearance"] * 0.7
    y = bounds["y_rear_bump"] - 0.03
    objs = []
    for i in range(count):
        x = 0.0 if count == 1 else (i - (count - 1) / 2) * (hw * 1.4 / max(1, count - 1))
        objs.append(_cylinder_obj(f"Exhaust_{i}", 0.045, 0.10, (x, y, z),
                                   materials["Chrome"], axis='Y'))
    return objs


def build_badge(spec, bounds, materials):
    return [_cylinder_obj("Badge_F", 0.05, 0.01, (0, bounds["y_front_bump"] - 0.01,
                           spec["height"] * 0.5), materials["Chrome"], axis='Y'),
            _cylinder_obj("Badge_R", 0.05, 0.01, (0, bounds["y_rear_bump"] + 0.01,
                           spec["height"] * 0.5), materials["Chrome"], axis='Y')]


def build_interior(spec, bounds, materials):
    mat = materials["Interior"]
    y_cowl = bounds["y_cowl"]
    y_trunk = bounds["y_trunk_start"]
    hw = spec["width"] / 2 * 0.85
    floor_z = spec["ground_clearance"] + 0.03
    objs = [
        _box_obj("CabinFloor", (hw * 1.8, y_trunk - y_cowl, 0.02),
                  (0, (y_cowl + y_trunk) / 2, floor_z), mat),
        _box_obj("Dashboard", (hw * 1.7, 0.18, 0.22),
                  (0, y_cowl + 0.20, spec["height"] * 0.42), mat),
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
    return objs


def build_steering_wheel(spec, bounds, materials):
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
    obj.location = (-hw * 0.42, bounds["y_cowl"] + 0.30, spec["height"] * 0.44)
    obj.rotation_euler = (math.radians(25), 0, 0)
    return obj
