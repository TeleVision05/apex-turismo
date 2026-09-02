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


# (width, depth, height) - real lens sizes, not slabs. quad_round (GT3) is
# two round discs per side instead, handled separately below.
LIGHT_SIZE = {
    "flat_pop": (0.30, 0.05, 0.14), "wedge": (0.34, 0.05, 0.12),
    "angular": (0.34, 0.05, 0.12), "slit": (0.34, 0.04, 0.09),
}


def _light_pair(style, y, z, half_w, depth, mat, name_prefix):
    """Front or rear light cluster, mirrored L/R. Returns list of objects."""
    objs = []
    for side, sx in (("L", -1), ("R", 1)):
        cx = sx * half_w
        if style == "quad_round":
            r = 0.07  # 0.14 m discs, two per side
            for i, oz in enumerate((z - r * 1.1, z + r * 1.1)):
                objs.append(_cylinder_obj(f"{name_prefix}_{side}_{i}", r,
                                           depth, (cx, y, oz), mat, axis='Y'))
        else:
            w, d, h = LIGHT_SIZE.get(style, LIGHT_SIZE["wedge"])
            objs.append(_box_obj(f"{name_prefix}_{side}", (w, depth, h),
                                  (cx, y, z), mat))
    return objs


def build_headlights(spec, curves, bounds, materials):
    """Inset 1cm into the nose surface, centred at 0.55 of the nose
    (bumper-top) height."""
    nose_x = 0.02 * curves["L"]
    y = body.blender_y(nose_x, bounds) - 0.01
    half_w, _ = body.size_at_y(curves, bounds, y)
    hw = half_w * 0.80
    z = curves["zt"](0.0) * 0.55
    return _light_pair(spec["headlight_style"], y, z, hw, 0.04,
                        materials["Headlight"], "Headlight")


def build_taillights(spec, curves, bounds, materials):
    style = spec["headlight_style"] if spec["headlight_style"] == "quad_round" else "wedge"
    y = bounds["y_rear_bump"] + 0.08
    half_w, top = body.size_at_y(curves, bounds, y)
    hw = half_w * 0.90
    z = top * 0.62
    return _light_pair(style, y - 0.05, z, hw, 0.05, materials["Taillight"], "Taillight")


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
    if spec.get("mirror_style", "door") == "none":
        return []
    y = body.blender_y(curves["xa"], bounds) - 0.18
    belt_x, _ = body.size_at_y(curves, bounds, y)
    belt_z = body.belt_z_of(spec)
    objs = []
    for side, sx in (("L", -1), ("R", 1)):
        objs.append(_box_obj(f"Mirror_{side}_stalk", (0.05, 0.05, 0.03),
                              (sx * (belt_x + 0.05), y, belt_z + 0.06), materials["Trim"]))
        objs.append(_box_obj(f"Mirror_{side}_housing", (0.14, 0.09, 0.06),
                              (sx * (belt_x + 0.13), y, belt_z + 0.07), materials["Trim"]))
    return objs


def build_grille(spec, curves, bounds, materials):
    """40% of the car's width x 0.12 m, sat between the headlights."""
    nose_x = 0.02 * curves["L"]
    y = body.blender_y(nose_x, bounds) - 0.005
    hw = spec["width"] * 0.20
    z = curves["zt"](0.0) * 0.55
    return [_box_obj("Grille", (hw * 2, 0.02, 0.12), (0, y, z), materials["Trim"])]


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
    L = curves["L"]
    front_x = [0.0, 0.03 * L, 0.06 * L, 0.10 * L, 0.15 * L]
    rear_x = [L - x for x in reversed(front_x)]
    z_f = lambda x: curves["zf"](x) * 0.55
    front = _swept_strip("BumperLip_F", curves, bounds, front_x, 0.86, z_f,
                          0.03, materials["Trim"])
    rear = _swept_strip("BumperLip_R", curves, bounds, rear_x, 0.86, z_f,
                         0.03, materials["Trim"])
    return [front, rear]


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
        objs.append(_cylinder_obj(f"Exhaust_{i}", 0.045, 0.10, (x, y, z),
                                   materials["Chrome"], axis='Y'))
    return objs


def build_badge(spec, curves, bounds, materials):
    """Sit right on the nose/tail surface height, not a generic mid-height
    guess - the nose tip is much lower than half the car's overall H."""
    return [_cylinder_obj("Badge_F", 0.04, 0.01, (0, bounds["y_front_bump"] - 0.015,
                           curves["zt"](0.02) * 0.96), materials["Chrome"], axis='Y'),
            _cylinder_obj("Badge_R", 0.04, 0.01, (0, bounds["y_rear_bump"] + 0.015,
                           curves["zt"](curves["L"] - 0.02) * 0.96), materials["Chrome"], axis='Y')]


def build_interior(spec, curves, bounds, materials):
    mat = materials["Interior"]
    y_cowl = body.blender_y(curves["xa"], bounds)
    y_trunk = body.blender_y(curves["xc"], bounds)
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
