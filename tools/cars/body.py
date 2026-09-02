"""Body + Glass generation - deterministic rounded-section loft.

Recipe (all metres; local x runs 0=nose -> L=tail, y is lateral half
-width, z is up - converted to Blender space only when vertices are
created):

  1. Five profile functions (`specs.get_profile`) evaluated with a damped
     Catmull-Rom spline (`curves.catmull_rom_eval`, tension 0.5) at
     stations every 0.04 m: w(x) plan half-width, zf(x) floor height,
     zt(x) lower-body top (hood/belt/deck line - the CABIN span of zt is
     the belt height, `specs.belt_ratio(spec) * spec['height']`), rt(x)
     top corner radius. rb (rocker radius) is a constant.
  2. Each station is ONE rounded-rectangle cross-section (28 points: four
     6-point corner arcs + the four edge midpoints, the top one carrying a
     slight crown) - identical topology everywhere, so the loft can't
     self-intersect. Consecutive stations are bridged with quads, the two
     end stations capped with an n-gon, then Bevel + one Subdivision level.
  3. Wheel arches are cut with a boolean difference per wheel (not baked
     into the profile). Box-arch cars union a rounded flare first. A
     wheel-well shell (Trim) is added only where the fender has genuine
     overhead clearance - no torus lip (it read as a floating ring).
  4. The greenhouse is an independent rounded-trapezoid loft from xa to xc
     (tumblehome: wide base sunk into the belt, narrower rounded top that
     rides the roof curve `zr(x)`, which reaches all the way to H =
     spec['height']). The WHOLE loft is Paint (`build_greenhouse`'s
     `shell`) - so A/B/C pillars and the roof are solid sheet metal by
     construction - and a second, independent Glass object copies only
     the faces whose real (post-construction) position/normal qualify as
     windscreen, rear screen or side window, pushed 0.5cm proud.
"""
import math
import bmesh
import bpy

import curves as curvemod
from specs import get_profile

ROW_FLOOR, ROW_SHOULDER, ROW_BELT, ROW_EDGE, ROW_TOP = range(5)  # legacy ids


def wheel_lateral_offset(spec):
    """Shared by the arch cutter and wheels.py - 'wheel centre y must equal
    the arch centre y'."""
    return spec["width"] / 2.0 - spec["tyre_width"] / 2.0 - 0.02


def compute_bounds(spec):
    length, wb = spec["length"], spec["wheelbase"]
    front_overhang = (length - wb) * spec["front_overhang_ratio"]
    rear_overhang = (length - wb) - front_overhang
    y_front_bump = wb / 2.0 + front_overhang
    y_rear_bump = -wb / 2.0 - rear_overhang
    return dict(y_rear_bump=y_rear_bump, y_front_bump=y_front_bump,
                y_rear_axle=-wb / 2.0, y_front_axle=wb / 2.0,
                x_rear_axle=y_front_bump + wb / 2.0,
                x_front_axle=y_front_bump - wb / 2.0,
                L=length)


def blender_y(x, b):
    """x (0=nose..L=tail) -> Blender/car-space Y (nose is +Y)."""
    return b["y_front_bump"] - x


def x_of(y, b):
    return b["y_front_bump"] - y


def belt_z_of(spec):
    from specs import belt_ratio
    return spec["height"] * belt_ratio(spec)


def get_curves(spec, b):
    """Profile callables + greenhouse span, keyed by absolute x. Also
    exposes local_size_at() for placing details flush with the loft."""
    prof = get_profile(spec)
    L = b["L"]
    w = curvemod.Profile(prof["w"], L)
    zf = curvemod.Profile(prof["zf"], L)
    zt = curvemod.Profile(prof["zt"], L)
    rt = curvemod.Profile(prof["rt"], L)
    xa, xb, xc = prof["xa"] * L, prof["xb"] * L, prof["xc"] * L
    screen_run, back_run, H = prof["screen_run"], prof["back_run"], prof["H"]

    def zr(x):
        if x >= xa and x < xa + screen_run:
            t = (x - xa) / screen_run
            t = 0.5 - 0.5 * math.cos(math.pi * t)
            return zt(xa) + (H - zt(xa)) * t
        if x > xc - back_run and x <= xc:
            t = (x - (xc - back_run)) / back_run
            t = 0.5 - 0.5 * math.cos(math.pi * t)
            return H + (zt(xc) - H) * t
        if xa + screen_run <= x <= xc - back_run:
            return H
        return zt(x)

    return dict(w=w, zf=zf, zt=zt, rt=rt, zr=zr, xa=xa, xb=xb, xc=xc, L=L, H=H,
                belt_z=prof["belt_z"])


def size_at_y(cv, b, y):
    """(half_width, top_z) at a Blender-space Y, for detail placement."""
    x = x_of(y, b)
    return cv["w"](x), cv["zt"](x)


# ------------------------------------------------------------- helpers ---
def _new_object(name):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def _to_verts(bm, section2d, x, b):
    y = blender_y(x, b)
    return [bm.verts.new((p[0], y, p[1])) for p in section2d]


def _bridge_rings(bm, ring_a, ring_b):
    n = len(ring_a)
    for i in range(n):
        v1, v2 = ring_a[i], ring_a[(i + 1) % n]
        v3, v4 = ring_b[(i + 1) % n], ring_b[i]
        bm.faces.new((v1, v2, v3, v4))


def _stations(lo, hi, step=0.02):
    n = max(2, int(round((hi - lo) / step)) + 1)
    return [lo + (hi - lo) * i / (n - 1) for i in range(n)]


def boolean_op(target, other, operation, delete_other=True):
    mod = target.modifiers.new("Bool", 'BOOLEAN')
    mod.operation = operation
    mod.object = other
    mod.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=mod.name)
    if delete_other:
        bpy.data.objects.remove(other, do_unlink=True)
    return target


def _shade_smooth(obj, angle_deg=35):
    for p in obj.data.polygons:
        p.use_smooth = True
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    except Exception:
        pass


def _finalize_single_material(obj, mat):
    """A boolean/bevel history can leave a phantom empty slot 0 behind -
    clear it so `mat` is unambiguously the only slot."""
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0


N_PER_CORNER = 9  # keep in sync with curves.rounded_trapezoid_section default


def _character_line_indices(n=N_PER_CORNER):
    """Ring-point indices (into a 4n+4 rounded_trapezoid_section, edge_mid=
    True) that trace the shoulder crease (max-width edge-mid points) and the
    belt line (base of the top corner arc, where the door/fender's vertical
    flank rolls over into the greenhouse-facing shoulder)."""
    shoulder = (n, 3 * n + 2)          # right/left edge-mid points
    belt = (n + 1, 3 * n + 1)          # TR-arc start / TL-arc end
    return shoulder, belt


def _hood_bulge_extra(spec, x, L):
    """Extra crown height (m) for a power-dome hood bulge, a smooth cosine
    ridge centred over the hood between the nose and the cowl."""
    if not spec.get("hood_bulge"):
        return 0.0
    xa_frac = 0.40
    hood_end = xa_frac * L * 0.92
    hood_start = 0.06 * L
    if x < hood_start or x > hood_end:
        return 0.0
    t = (x - hood_start) / max(0.01, hood_end - hood_start)
    return 0.028 * math.sin(math.pi * t)


def build_lower_body_block(spec, b, cv):
    stations_x = _stations(0.0, cv["L"], 0.02)
    rb = 0.06
    bm = bmesh.new()
    grid = []
    for x in stations_x:
        w, zf, zt, rt = cv["w"](x), cv["zf"](x), cv["zt"](x), cv["rt"](x)
        crown = 0.02 + _hood_bulge_extra(spec, x, cv["L"])
        section = curvemod.rounded_trapezoid_section(w, w, zf, zt, rb, rt, crown=crown)
        grid.append(_to_verts(bm, section, x, b))
    for i in range(len(grid) - 1):
        _bridge_rings(bm, grid[i], grid[i + 1])
    for ring in (grid[0], grid[-1]):
        try:
            bm.faces.new(ring)
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    # Crease the shoulder and belt character lines (edge creases, not hard
    # edges) along the longitudinal seams identified above, so Subdivision
    # keeps them reading as sharp lines instead of smoothing them away.
    crease_layer = bm.edges.layers.float.new("crease_edge")
    shoulder_idx, belt_idx = _character_line_indices()
    for i in range(len(grid) - 1):
        ring_a, ring_b = grid[i], grid[i + 1]
        for idx in shoulder_idx:
            e = bm.edges.get((ring_a[idx], ring_b[idx]))
            if e:
                e[crease_layer] = 0.65
        for idx in belt_idx:
            e = bm.edges.get((ring_a[idx], ring_b[idx]))
            if e:
                e[crease_layer] = 0.55

    obj = _new_object("BodyBlock")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def _arch_cylinder(hub_x, hub_y, hub_z, radius, width):
    bm = bmesh.new()
    segs = 32
    ring_a, ring_b = [], []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        y = hub_y + radius * math.sin(a)
        z = hub_z + radius * math.cos(a)
        ring_a.append(bm.verts.new((hub_x - width / 2, y, z)))
        ring_b.append(bm.verts.new((hub_x + width / 2, y, z)))
    _bridge_rings(bm, ring_a, ring_b)
    ca = bm.verts.new((hub_x - width / 2, hub_y, hub_z))
    cb = bm.verts.new((hub_x + width / 2, hub_y, hub_z))
    for i in range(segs):
        bm.faces.new((ring_a[(i + 1) % segs], ring_a[i], ca))
        bm.faces.new((ring_b[i], ring_b[(i + 1) % segs], cb))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _new_object("ArchCutter")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def cut_wheel_arches(block, spec, b):
    r = spec["wheel_radius"] + 0.05
    width = spec["tyre_width"] + 0.14
    lat = wheel_lateral_offset(spec)
    hubs = [(lat, b["x_front_axle"]), (-lat, b["x_front_axle"]),
            (lat, b["x_rear_axle"]), (-lat, b["x_rear_axle"])]
    for hub_x, x_axle in hubs:
        hub_y = blender_y(x_axle, b)
        cutter = _arch_cylinder(hub_x, hub_y, spec["wheel_radius"], r, width)
        block = boolean_op(block, cutter, 'DIFFERENCE')
    return block


def _rounded_box(cx, cy, cz, sx, sy, sz):
    bm = bmesh.new()
    v = [bm.verts.new(c) for c in (
        (cx - sx, cy - sy, cz - sz), (cx + sx, cy - sy, cz - sz),
        (cx + sx, cy + sy, cz - sz), (cx - sx, cy + sy, cz - sz),
        (cx - sx, cy - sy, cz + sz), (cx + sx, cy - sy, cz + sz),
        (cx + sx, cy + sy, cz + sz), (cx - sx, cy + sy, cz + sz))]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2),
             (2, 6, 7, 3), (3, 7, 4, 0)]
    for f in faces:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = _new_object("ArchBulge")
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def union_box_arches(block, spec, b):
    """GT3/box-arch cars: flare the fender 6cm wider than the body over
    each wheel before the arch is cut, so the arch reads as a boxy flare
    rather than a plain round hole in a flat panel."""
    if not spec.get("box_arches"):
        return block
    lat = wheel_lateral_offset(spec)
    r = spec["wheel_radius"]
    z_bottom, z_top = 0.02, r * 2.0 + 0.10  # stay clear of the ground plane
    for x_axle in (b["x_front_axle"], b["x_rear_axle"]):
        hub_y = blender_y(x_axle, b)
        bulge_half_w = lat + spec["tyre_width"] / 2.0 + 0.06
        bulge = _rounded_box(0.0, hub_y, (z_bottom + z_top) / 2, bulge_half_w, 0.34,
                              (z_top - z_bottom) / 2)
        bevel = bulge.modifiers.new("Bevel", 'BEVEL')
        bevel.width = 0.05
        bevel.segments = 3
        bpy.context.view_layer.objects.active = bulge
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        block = boolean_op(block, bulge, 'UNION')
    return block


def build_wheel_well_shells(spec, b):
    """A 3cm-inset cylinder shell (open both ends) behind each arch cut so
    the wheel well reads as having real depth instead of a knife-edge hole.
    Only built where the fender actually has generous overhead clearance
    (headroom >= r): the shell's top point is always at the true top of its
    150 deg sweep, so anything less than full clearance would still poke
    the shell's crown above the (lower, or open-wheel/absent) bodywork -
    skip it there rather than fake a wheel well that doesn't exist."""
    cv = get_curves(spec, b)
    lat = wheel_lateral_offset(spec)
    r = spec["wheel_radius"] + 0.05 - 0.03
    width = spec["tyre_width"] + 0.14 - 0.05
    max_deg = 150.0
    shells = []
    for hub_x, x_axle in ((lat, b["x_front_axle"]), (-lat, b["x_front_axle"]),
                           (lat, b["x_rear_axle"]), (-lat, b["x_rear_axle"])):
        local_top = cv["zt"](x_axle) - 0.02
        if local_top - spec["wheel_radius"] < r:
            continue
        hub_y = blender_y(x_axle, b)
        bm = bmesh.new()
        segs = 28
        ring_a, ring_b = [], []
        for i in range(segs):
            a = math.radians(-max_deg + 2 * max_deg * i / (segs - 1))
            y = hub_y + r * math.sin(a)
            z = spec["wheel_radius"] + r * math.cos(a)
            ring_a.append(bm.verts.new((hub_x - width / 2, y, z)))
            ring_b.append(bm.verts.new((hub_x + width / 2, y, z)))
        _bridge_rings(bm, ring_a, ring_b)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        obj = _new_object("WheelWell")
        bm.to_mesh(obj.data)
        bm.free()
        shells.append(obj)
    return shells


def finish_body(block, materials):
    bevel = block.modifiers.new("Bevel", 'BEVEL')
    bevel.width = 0.03
    bevel.segments = 2
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(35)
    bpy.context.view_layer.objects.active = block
    bpy.ops.object.modifier_apply(modifier=bevel.name)

    # Level 2 was tried against the 2cm/40-point control mesh but pushed a
    # simple car (sakura_86, no wing/vents) to 144k tris on its own - too
    # close to the 150k/car ceiling once wings, vents and box arches are
    # added on the heavier cars. Level 1 on this denser, creased control
    # mesh (measured 78.8k tris for sakura_86, see README) keeps every car
    # comfortably inside budget while still reading far crisper than the
    # original 4cm/28-point/level-1 mesh.
    subsurf = block.modifiers.new("Subdivision", 'SUBSURF')
    subsurf.levels = 1
    subsurf.render_levels = 1
    bpy.ops.object.modifier_apply(modifier=subsurf.name)

    _finalize_single_material(block, materials["Paint"])
    _shade_smooth(block)
    block.name = "Body"
    return block


def build_body(spec, b, materials):
    cv = get_curves(spec, b)
    block = build_lower_body_block(spec, b, cv)
    block = union_box_arches(block, spec, b)
    block = cut_wheel_arches(block, spec, b)
    return finish_body(block, materials)


# ----------------------------------------------------------- greenhouse --
def _greenhouse_grid(cv, b):
    xa, xc = cv["xa"], cv["xc"]
    stations_x = _stations(xa, xc, 0.04)
    bm = bmesh.new()
    grid = []
    for x in stations_x:
        base_w = cv["w"](x) * 0.86
        top_w = cv["w"](x) * 0.74
        base_z = cv["zt"](x) - 0.04
        top_z = cv["zr"](x)
        section = curvemod.rounded_trapezoid_section(
            base_w, top_w, base_z, top_z, rb=0.02, rt=0.20, edge_mid=False)
        grid.append(_to_verts(bm, section, x, b))
    for i in range(len(grid) - 1):
        _bridge_rings(bm, grid[i], grid[i + 1])
    for ring in (grid[0], grid[-1]):
        try:
            bm.faces.new(ring)
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def _classify_greenhouse_face(face, x, z, cv, b):
    """Which window (if any) this face belongs to, purely from its real,
    already-computed position/normal - not from which corner-arc index it
    came from, since the rake is what actually tilts a face forward/back."""
    n = face.normal
    belt, roof = cv["belt_z"], cv["H"]
    fwd25 = math.sin(math.radians(25))
    if abs(x - cv["xb"]) < 0.03:
        return None  # 6cm painted gap at the B-pillar
    if belt + 0.02 <= z <= roof - 0.03 and n.y > fwd25:
        return "windscreen"
    if belt + 0.02 <= z <= roof - 0.03 and n.y < -fwd25:
        return "rear_screen"
    if belt + 0.03 <= z <= roof - 0.06 and abs(n.x) > 0.7:
        return "side"
    return None


def build_greenhouse(spec, b, materials):
    """Returns (paint_shell, glass) - the whole loft is Paint (so A/B/C
    pillars and the roof are automatically solid sheet metal); Glass is a
    second, independent set of panels copied from the *same* faces that
    qualify as windscreen/rear-screen/side-window, pushed 0.5cm proud."""
    cv = get_curves(spec, b)
    bm = _greenhouse_grid(cv, b)

    glass_bm = bmesh.new()
    for f in list(bm.faces):
        center = f.calc_center_median()
        x = x_of(center.y, b)
        kind = _classify_greenhouse_face(f, x, center.z, cv, b)
        if kind is None:
            continue
        offset = f.normal * 0.005
        new_verts = [glass_bm.verts.new(v.co + offset) for v in f.verts]
        glass_bm.faces.new(new_verts)

    shell = _new_object("GreenhouseShell")
    bm.to_mesh(shell.data)
    bm.free()
    shell.data.materials.append(materials["Paint"])
    _shade_smooth(shell)

    bmesh.ops.recalc_face_normals(glass_bm, faces=glass_bm.faces)
    glass = _new_object("Glass")
    glass_bm.to_mesh(glass.data)
    glass_bm.free()
    glass.data.materials.append(materials["Glass"])
    _shade_smooth(glass)

    return shell, glass
