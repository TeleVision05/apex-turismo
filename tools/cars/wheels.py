"""Wheel + brake generation.

Each wheel is a single object (tyre + rim in one mesh, two material slots)
whose LOCAL origin is the hub centre and whose local X axis is the spin
axis - the mesh geometry is built entirely in local space (tyre width runs
along local X, the tyre radius sweeps the local Y-Z plane) and the hub
world position is applied only as `object.location`, never baked into the
vertices. This is what lets the game rotate the wheel about its own local
X without any extra bookkeeping.

Brakes (disc + caliper) are separate small objects at the same hub
position but parented to the car root, not the wheel, so they do not spin.
"""
import math
import bmesh
import bpy


def _new_object(name):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def _ring(bm, x, radius, segments=24):
    verts = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        verts.append(bm.verts.new((x, radius * math.cos(a), radius * math.sin(a))))
    return verts


def _bridge_rings(bm, ring_a, ring_b, mat_index):
    faces = []
    n = len(ring_a)
    for i in range(n):
        v1, v2 = ring_a[i], ring_a[(i + 1) % n]
        v3, v4 = ring_b[(i + 1) % n], ring_b[i]
        f = bm.faces.new((v1, v2, v3, v4))
        f.material_index = mat_index
        faces.append(f)
    return faces


def _cap_annulus(bm, ring_outer, ring_inner, mat_index, flip=False):
    n = len(ring_outer)
    for i in range(n):
        o1, o2 = ring_outer[i], ring_outer[(i + 1) % n]
        i1, i2 = ring_inner[(i + 1) % n], ring_inner[i]
        verts = (o1, o2, i1, i2) if not flip else (o2, o1, i2, i1)
        f = bm.faces.new(verts)
        f.material_index = mat_index


def build_wheel(name, radius, tyre_width, spoke_count=7):
    """Build one Wheel_* object: tyre (mat 0 = Rubber) + rim (mat 1 = Rim).
    The rim is a genuinely open face - a hub + thin spokes reaching to a
    slim outer lip, with real gaps between spokes - so the brake disc/
    caliper (a separate static object at the same hub) is visible through
    it, per the brief. An earlier version closed that gap with a full
    360 deg barrel at the spoke tips, which hid the brake entirely; that
    barrel is gone; only a slim outer lip band (flush with the tyre bead,
    much narrower than the old barrel) remains for a finished edge."""
    bm = bmesh.new()
    hw = tyre_width / 2.0
    inner_r = radius * 0.60  # rim seat radius (also the tyre's open hole)
    segs = 32

    # --- tyre: 3 rings (rounded shoulder + sidewall bevel) + 2 annulus caps
    ring_l = _ring(bm, -hw, radius * 0.94, segs)
    ring_m = _ring(bm, 0.0, radius, segs)
    ring_r = _ring(bm, hw, radius * 0.94, segs)
    _bridge_rings(bm, ring_l, ring_m, 0)
    _bridge_rings(bm, ring_m, ring_r, 0)
    hole_l = _ring(bm, -hw, inner_r, segs)
    hole_r = _ring(bm, hw, inner_r, segs)
    _cap_annulus(bm, ring_l, hole_l, 0, flip=True)
    _cap_annulus(bm, ring_r, hole_r, 0, flip=False)
    # sidewall bevel: a slim extra ring just inside the tyre shoulder on
    # each face so the sidewall isn't a single flat annulus
    bevel_l = _ring(bm, -hw * 0.7, inner_r * 1.06, segs)
    bevel_r = _ring(bm, hw * 0.7, inner_r * 1.06, segs)
    _bridge_rings(bm, hole_l, bevel_l, 0)
    _bridge_rings(bm, hole_r, bevel_r, 0)

    # --- rim: hub barrel + N thin spokes + slim outer lip (mat 1 = Rim) ---
    rim_w = hw * 0.85
    hub_r = radius * 0.16
    hub_l = _ring(bm, -rim_w * 0.5, hub_r, 16)
    hub_r_ring = _ring(bm, rim_w * 0.5, hub_r, 16)
    _bridge_rings(bm, hub_l, hub_r_ring, 1)
    # hub cap (disc) at the outboard face so the centre doesn't look hollow
    hub_cap_centre = bm.verts.new((rim_w * 0.5, 0.0, 0.0))
    n = len(hub_r_ring)
    for i in range(n):
        v1, v2 = hub_r_ring[i], hub_r_ring[(i + 1) % n]
        f = bm.faces.new((v1, v2, hub_cap_centre))
        f.material_index = 1

    lip_r = inner_r * 0.98
    half_ang = math.pi / spoke_count * 0.30  # narrower spokes, wider gaps
    for s in range(spoke_count):
        a = 2 * math.pi * s / spoke_count
        ca1, sa1 = math.cos(a - half_ang), math.sin(a - half_ang)
        ca2, sa2 = math.cos(a + half_ang), math.sin(a + half_ang)
        x0, x1 = -rim_w * 0.5, rim_w * 0.5
        hp = hub_r * 0.96
        bp = lip_r
        v = [
            bm.verts.new((x0, hp * ca1, hp * sa1)),
            bm.verts.new((x0, hp * ca2, hp * sa2)),
            bm.verts.new((x0, bp * ca2, bp * sa2)),
            bm.verts.new((x0, bp * ca1, bp * sa1)),
            bm.verts.new((x1, hp * ca1, hp * sa1)),
            bm.verts.new((x1, hp * ca2, hp * sa2)),
            bm.verts.new((x1, bp * ca2, bp * sa2)),
            bm.verts.new((x1, bp * ca1, bp * sa1)),
        ]
        quads = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2),
                 (2, 6, 7, 3), (3, 7, 4, 0)]
        for q in quads:
            f = bm.faces.new([v[i] for i in q])
            f.material_index = 1
    # slim outer lip band (structural rim flange at the tyre bead) - much
    # narrower than a full barrel so it doesn't curtain off the spoke gaps
    lip_l = _ring(bm, -rim_w * 0.5, lip_r, segs)
    lip_r_ring = _ring(bm, -rim_w * 0.5 + rim_w * 0.06, lip_r, segs)
    _bridge_rings(bm, lip_l, lip_r_ring, 1)
    lip_l2 = _ring(bm, rim_w * 0.5 - rim_w * 0.06, lip_r, segs)
    lip_r2 = _ring(bm, rim_w * 0.5, lip_r, segs)
    _bridge_rings(bm, lip_l2, lip_r2, 1)

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    obj = _new_object(name)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def build_brake(name, radius):
    """Disc + caliper, static (does not spin), same hub-centred local space."""
    bm = bmesh.new()
    disc_r = radius * 0.56
    disc_w = radius * 0.10
    ring_l = _ring(bm, -disc_w / 2, disc_r, 20)
    ring_r = _ring(bm, disc_w / 2, disc_r, 20)
    _bridge_rings(bm, ring_l, ring_r, 0)
    hub_l = _ring(bm, -disc_w / 2, disc_r * 0.35, 20)
    hub_r = _ring(bm, disc_w / 2, disc_r * 0.35, 20)
    _cap_annulus(bm, ring_l, hub_l, 0, flip=True)
    _cap_annulus(bm, ring_r, hub_r, 0, flip=False)

    # caliper: a small box straddling the disc at the trailing-top edge
    cw, ch, cd = disc_w * 2.2, disc_r * 0.55, disc_r * 0.42
    cx0, cx1 = -cw / 2, cw / 2
    cy0, cy1 = disc_r * 0.35, disc_r * 0.35 + cd
    cz0, cz1 = -ch / 2, ch / 2
    box_verts = [
        bm.verts.new((cx0, cy0, cz0)), bm.verts.new((cx1, cy0, cz0)),
        bm.verts.new((cx1, cy1, cz0)), bm.verts.new((cx0, cy1, cz0)),
        bm.verts.new((cx0, cy0, cz1)), bm.verts.new((cx1, cy0, cz1)),
        bm.verts.new((cx1, cy1, cz1)), bm.verts.new((cx0, cy1, cz1)),
    ]
    box_faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2),
                 (2, 6, 7, 3), (3, 7, 4, 0)]
    for f in box_faces:
        bm.faces.new([box_verts[i] for i in f])

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)

    obj = _new_object(name)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def build_all_wheels(spec, materials):
    """Return dict name -> object for the 4 wheels and 4 brakes, positioned
    at their hub world locations (not parented yet). The lateral offset
    matches body.wheel_lateral_offset() exactly - the wheel arch is cut
    around this same y - so the wheel is always centred in its arch."""
    import body
    r = spec["wheel_radius"]
    tw = spec["tyre_width"]
    wb = spec["wheelbase"]
    lat = body.wheel_lateral_offset(spec)
    y_front = wb / 2.0
    y_rear = -wb / 2.0

    positions = {
        "Wheel_FL": (-lat, y_front, r),
        "Wheel_FR": (lat, y_front, r),
        "Wheel_RL": (-lat, y_rear, r),
        "Wheel_RR": (lat, y_rear, r),
    }
    result = {}
    for name, pos in positions.items():
        obj = build_wheel(name, r, tw)
        obj.data.materials.append(materials["Rubber"])
        obj.data.materials.append(materials["Rim"])
        obj.location = pos
        for p in obj.data.polygons:
            p.use_smooth = True
        result[name] = obj

        brake_name = "Brake_" + name.split("_")[1]
        b = build_brake(brake_name, r)
        b.data.materials.append(materials["Brake"])
        b.location = pos
        for p in b.data.polygons:
            p.use_smooth = True
        result[brake_name] = b
    return result
