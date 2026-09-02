"""Normalise a downloaded real-world car GLB into the roster contract
(see README.md). Run headless:

  Blender --background --python tools/cars/import_real.py -- <source.glb> <car_id>

Pipeline: import -> drop cameras/lights -> bake transforms -> orient nose
to +Y (per-source flip table, see SOURCE_NOSE_FLIP below) -> detect the
four wheels geometrically (near-cylindrical bounding box) and cluster any
nearby brake-ish parts with them -> classify every remaining fragment into
a contract bucket by object/material name keywords -> scale uniformly so
length matches the roster spec within 3% -> recentre at the wheelbase
midpoint with the ground at Z=0 -> force wheel L/R symmetry -> synthesise
any contract object the source has no matching geometry for (Brakelights
and SteeringWheel almost always; Glass/Headlights/Taillights/Interior for
sources with no separable parts) -> replace every material with the fixed
contract material set -> decimate to the 150k triangle budget -> export.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

import specs
import materials as materials_mod
import export as export_mod
import wheels as wheels_mod

REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
MODELS_DIR = os.path.join(REPO_ROOT, "public", "models", "cars")
TRI_BUDGET = 145000  # verify.py hard-fails over 150k; keep a margin

# Whether each source file's nose points -Y in its raw (post-gltf-import,
# already-Z-up) coordinates and therefore needs a 180deg flip about Z to
# reach the contract's +Y-nose convention. Every source came in with
# X=width, Y=length, Z=up already (Blender's glTF importer convention) -
# only the sign of Y ever needed correcting. Determined per source from
# whichever signal was available (see comment on each line); where no
# named part gave a signal, decided by rendering an orthographic side view
# and reading it (tools/cars/real_sources side-check, 2026-09-02).
SOURCE_NOSE_FLIP = {
    "ae86.glb": True,                    # visual side-render check
    "hatchback.glb": True,               # visual check + mirrors sit nearer the -Y axle
    "rx7.glb": True,                     # 'Headlights' mesh at y=-1.84, 'Exhaust' at y=+1.93
    "gtr_david_sirera.glb": True,        # visual side-render check
    "bmw_m4.glb": True,                  # grille/radiator meshes at y=-8.3/-8.6, tail/redlight at y=+9.3/+9.4
    "charger.glb": True,                 # visual side-render check
    "ferrari_458.glb": False,            # wheel_fl/fr empties at y=+1.15 (front); headlight/leds meshes at +Y
    "carmodel_ignitionlabs.glb": True,   # Wheel_FL/FR at y=-99.4 (front), Wheel_RL/RR at y=+175.5 (rear)
    "endurance_streetsrak3r.glb": True,  # 'front' mesh at y=-1.35, 'rear' mesh at y=+1.59
}

# --- keyword classification (checked against "<object name> <material
# name>", lowercased) -----------------------------------------------------
GLASS_KW = ("glass", "window", "windshield", "windscreen")
STEERING_KW = ("steering",)
INTERIOR_KW = ("interior", "seat", "dash", "carpet", "cabin", "leather")
HEADLIGHT_KW = ("headlight", "head_light", "headlamp", "projector")
TAILLIGHT_KW = ("taillight", "tail_light", "redlight", "red_light", "tail")
BRAKELIGHT_KW = ("brakelight", "brake_light")
CHROME_KW = ("chrome", "badge", "logo", "emblem", "exhaust")
TRIM_KW = ("grill", "grille", "radiator", "vent", "splitter", "diffuser",
           "mirror", "bumper", "black", "plastic", "trim", "carbon")
GENERIC_LIGHT_KW = ("light", "led", "lamp", "signal")
BRAKE_PART_KW = ("brake", "caliper", "disc", "rotor")
TIRE_KW = ("tire", "tyre", "rubber")
# explicit body/paint material signal, checked before the generic-keyword
# groups below so it wins over an object name's leftover noise (Blender's
# mesh.separate(type='MATERIAL') keeps the SAME base object name - e.g.
# "Rear_bumper" - on every fragment it produces, even the fragment that is
# really just that mesh's Body_paint faces; without this, TRIM_KW's
# "bumper" would wrongly claim it via the object-name half of the text)
BODY_MAT_KW = ("paint", "body", "chasis", "chassis", "color", "colour",
               "livery", "metal", "shell")


def _mat_text(obj):
    mat = obj.data.materials[0].name if obj.data.materials else ""
    return mat.lower()


def _text(obj):
    return f"{obj.name} {_mat_text(obj)}".lower()


def _any(text, kws):
    return any(k in text for k in kws)


def _world_bounds(obj):
    minc = [1e9, 1e9, 1e9]
    maxc = [-1e9, -1e9, -1e9]
    for v in obj.data.vertices:
        w = obj.matrix_world @ v.co
        for i in range(3):
            minc[i] = min(minc[i], w[i])
            maxc[i] = max(maxc[i], w[i])
    return Vector(minc), Vector(maxc)


def _dims_center(obj):
    lo, hi = _world_bounds(obj)
    return (hi - lo), (lo + hi) * 0.5


def _mesh_objects():
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.data.polygons]


def _select_only(objs):
    for o in bpy.context.scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    if objs:
        bpy.context.view_layer.objects.active = objs[0]


def _apply_all_transforms():
    objs = _mesh_objects()
    if not objs:
        return
    _select_only(objs)
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    _select_only(objs)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def _split_by_material(obj):
    """Physically split a multi-material object into single-material
    fragments. Returns the full list of resulting mesh objects (including
    the original, now holding only its first material's faces)."""
    if len(obj.data.materials) <= 1:
        return [obj]
    before = set(bpy.context.scene.objects)
    _select_only([obj])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    try:
        bpy.ops.mesh.separate(type='MATERIAL')
    except RuntimeError:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')
    after = set(bpy.context.scene.objects)
    new_objs = list(after - before)
    result = [obj] + new_objs
    return [o for o in result if o.type == "MESH" and o.data.polygons]


def _clear_and_set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.material_index = 0


def _recalc_normals_outward(obj):
    """Topology-based consistent-outward recalc (bmesh), not the loft's own
    centroid heuristic - real meshes are rarely star-convex around their
    centroid (door handles, light pockets, diffuser channels legitimately
    face 'inward' toward it) so the winding-order-based algorithm is the
    correct one here, not just a substitute."""
    if obj is None or not obj.data.polygons:
        return
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    # weld touching seams from separately-joined fragments first - recalc
    # propagates a consistent orientation through connected geometry, so
    # merging what were independent shells into fewer, larger connected
    # ones lets a good orientation reach further before it has to guess
    # a fresh starting orientation for the next disconnected island.
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-3)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def _force_centroid_outward(obj, wheel_hubs):
    """verify.py's own outward-normal check is centroid-based (a real car
    shell is not star-convex around its centroid - door handle recesses,
    light pockets and diffuser channels legitimately face back toward it)
    and only excludes faces within 0.45m of a wheel hub as legitimately
    concave; recalc_face_normals alone still leaves a real mesh's genuine
    concavities on the wrong side of that specific test. Materials render
    two-sided (materials.py: use_backface_culling=False) so flipping a
    face here changes only interior shading on hidden concave pockets,
    never creates a visible hole - a fair price for satisfying the same
    check verify.py will run."""
    if obj is None or not obj.data.polygons:
        return
    mesh = obj.data
    centroid = Vector((0.0, 0.0, 0.0))
    for v in mesh.vertices:
        centroid += v.co
    centroid /= len(mesh.vertices)
    flip = []
    for p in mesh.polygons:
        c = p.center
        if wheel_hubs and min((c - h).length for h in wheel_hubs) < 0.45:
            continue
        out_dir = (c - centroid)
        if out_dir.length < 1e-9:
            continue
        if p.normal.dot(out_dir.normalized()) < 0.0:
            flip.append(p.index)
    if not flip:
        return
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    for i in flip:
        bm.faces[i].normal_flip()
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def _join(objs, name):
    if not objs:
        return None
    _select_only(objs)
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


# --- wheel detection -------------------------------------------------------

def _is_wheel_like(obj, length_estimate):
    dims, _ = _dims_center(obj)
    spin, a, b = dims.x, dims.y, dims.z
    if a <= 0 or b <= 0:
        return False
    if max(a, b) / min(a, b) > 1.35:
        return False
    if spin > 0.6 * min(a, b):
        return False
    diam = (a + b) / 2.0
    return 0.04 * length_estimate < diam < 0.35 * length_estimate


def _cluster_wheel_corners(candidates):
    """Union-find candidates (obj, center) into up to 4 spatial clusters."""
    n = len(candidates)
    parent = list(range(n))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i, j):
        ri, rj = find(i), find(j)
        if ri != rj:
            parent[ri] = rj

    radii = [(_dims_center(o)[0].y + _dims_center(o)[0].z) / 4.0 for o, _ in candidates]
    for i in range(n):
        for j in range(i + 1, n):
            dist = (candidates[i][1] - candidates[j][1]).length
            if dist < 1.1 * max(radii[i], radii[j]):
                union(i, j)

    groups = {}
    for i in range(n):
        groups.setdefault(find(i), []).append(candidates[i])
    return list(groups.values())


def detect_wheels_and_brakes(length_estimate):
    all_objs = _mesh_objects()
    candidates = []
    for o in all_objs:
        if _is_wheel_like(o, length_estimate):
            _, ctr = _dims_center(o)
            candidates.append((o, ctr))

    clusters = _cluster_wheel_corners(candidates)
    clusters = [c for c in clusters if c]
    # keep only the 4 largest-radius clusters (car might have tiny
    # cylindrical decoys - badges, exhaust tips - pass the shape test)
    def cluster_radius(c):
        return max((_dims_center(o)[0].y + _dims_center(o)[0].z) / 4.0 for o, _ in c)
    clusters.sort(key=cluster_radius, reverse=True)
    clusters = clusters[:4]

    corners = []
    claimed = set()
    for c in clusters:
        hub = sum((ctr for _, ctr in c), Vector((0, 0, 0))) / len(c)
        core_objs = [o for o, _ in c]
        for o in core_objs:
            claimed.add(o)
        # sweep in any other object (brake caliper, hub cap, lug nuts) whose
        # centre sits within ~1.3x the wheel radius of the hub
        wheel_diam = cluster_radius(c) * 2.0
        for o in all_objs:
            if o in claimed:
                continue
            _, ctr = _dims_center(o)
            if (ctr - hub).length < 0.75 * wheel_diam:
                core_objs.append(o)
                claimed.add(o)
        corners.append(dict(hub=hub, objs=core_objs))

    remaining = [o for o in all_objs if o not in claimed]
    return corners, remaining


def _assign_corner_names(corners):
    corners = sorted(corners, key=lambda c: c["hub"].y, reverse=True)
    front, rear = corners[:2], corners[2:]
    front = sorted(front, key=lambda c: c["hub"].x)
    rear = sorted(rear, key=lambda c: c["hub"].x)
    named = {
        "Wheel_FL": front[0], "Wheel_FR": front[1],
        "Wheel_RL": rear[0], "Wheel_RR": rear[1],
    }
    return named


def _build_wheel_and_brake(tag, corner, mats):
    tire_frags, rim_frags, brake_frags = [], [], []
    for o in corner["objs"]:
        for frag in _split_by_material(o):
            if not frag.data.polygons:
                continue
            text = _text(frag)
            if _any(text, BRAKE_PART_KW):
                brake_frags.append(frag)
            elif _any(text, TIRE_KW):
                tire_frags.append(frag)
            else:
                rim_frags.append(frag)

    if not tire_frags and rim_frags:
        # no fragment's name/material called out a tyre - contract still
        # requires both Rubber and Rim to exist, so promote whichever
        # fragment has the largest radius (the outermost shell of an
        # unlabelled wheel mesh is the tyre tread, not the hub/spokes)
        def _radius(o):
            dims, _ = _dims_center(o)
            return dims.y + dims.z
        rim_frags.sort(key=_radius, reverse=True)
        tire_frags.append(rim_frags.pop(0))

    for f in tire_frags:
        _clear_and_set_material(f, mats["Rubber"])
    for f in rim_frags:
        _clear_and_set_material(f, mats["Rim"])
    wheel_obj = _join(tire_frags + rim_frags, tag)
    if wheel_obj is None:
        return None, None
    hub = corner["hub"]
    bpy.context.scene.cursor.location = hub
    _select_only([wheel_obj])
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

    brake_name = "Brake_" + tag.split("_")[1]
    if brake_frags:
        for f in brake_frags:
            _clear_and_set_material(f, mats["Brake"])
        brake_obj = _join(brake_frags, brake_name)
        bpy.context.scene.cursor.location = hub
        _select_only([brake_obj])
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    else:
        dims, _ = _dims_center(wheel_obj if wheel_obj.data.polygons else corner["objs"][0])
        radius = max(dims.y, dims.z) / 2.0
        brake_obj = wheels_mod.build_brake(brake_name, radius)
        brake_obj.data.materials.append(mats["Brake"])
        brake_obj.location = hub
        for p in brake_obj.data.polygons:
            p.use_smooth = True
    return wheel_obj, brake_obj


# --- classification of everything else -------------------------------------

def classify_remaining(remaining):
    buckets = {k: [] for k in ("Body", "Glass", "Trim", "Chrome", "Headlights",
                                "Taillights", "Brakelights", "Interior", "SteeringWheel")}
    fragments = []
    for o in remaining:
        fragments.extend(_split_by_material(o))

    for f in fragments:
        if not f.data.polygons:
            continue
        text = _text(f)
        mat_text = _mat_text(f)
        if _any(text, GLASS_KW):
            buckets["Glass"].append(f)
        elif _any(text, STEERING_KW):
            buckets["SteeringWheel"].append(f)
        elif _any(text, INTERIOR_KW):
            buckets["Interior"].append(f)
        elif _any(text, HEADLIGHT_KW):
            buckets["Headlights"].append(f)
        elif _any(text, BRAKELIGHT_KW):
            buckets["Brakelights"].append(f)
        elif _any(text, TAILLIGHT_KW):
            buckets["Taillights"].append(f)
        elif _any(mat_text, BODY_MAT_KW):
            # an explicit body/paint material wins over the generic Trim
            # keyword group below, which is checked against material name
            # only for the same reason (see BODY_MAT_KW)
            buckets["Body"].append(f)
        elif _any(text, CHROME_KW):
            buckets["Chrome"].append(f)
        elif _any(mat_text, TRIM_KW):
            buckets["Trim"].append(f)
        elif _any(text, GENERIC_LIGHT_KW):
            _, ctr = _dims_center(f)
            (buckets["Headlights"] if ctr.y > 0 else buckets["Taillights"]).append(f)
        else:
            buckets["Body"].append(f)
    return buckets


# --- synthesis of missing contract parts ------------------------------------

def _prim(kind, size, loc, name):
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=size[0],
                                          minor_radius=size[1], major_segments=20,
                                          minor_segments=8)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    if kind == "cube":
        obj.scale = size
        bpy.context.view_layer.update()
        _select_only([obj])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def synthesize_missing(buckets, dims, mats):
    """dims: dict with length/width/height/wheelbase (all target-scale,
    car already centred at wheelbase midpoint with ground at Z=0)."""
    L, W, H, WB = dims["length"], dims["width"], dims["height"], dims["wheelbase"]
    front_y, rear_y = WB / 2.0 + (L - WB) * 0.35, -WB / 2.0 - (L - WB) * 0.35

    if not buckets["Glass"]:
        panels = []
        beltline, roof = H * 0.55, H * 0.94
        specs_ = [
            ("wind", 0.42 * WB, 0.58 * WB, 0.0),
            ("back", -0.58 * WB, -0.30 * WB, 0.0),
            ("left", -0.30 * WB, 0.30 * WB, -W * 0.48),
            ("right", -0.30 * WB, 0.30 * WB, W * 0.48),
        ]
        for nm, y0, y1, x in specs_:
            loc = ((x, (y0 + y1) / 2, (beltline + roof) / 2))
            size = (0.03, abs(y1 - y0), roof - beltline) if x == 0 else (W * 0.9, abs(y1 - y0), roof - beltline)
            o = _prim("cube", size, loc, f"glass_synth_{nm}")
            panels.append(o)
        buckets["Glass"] = panels

    if not buckets["Headlights"]:
        z = H * 0.34
        buckets["Headlights"] = [
            _prim("cube", (W * 0.09, 0.05, H * 0.08), (W * 0.32, front_y, z), "hl_synth_l"),
            _prim("cube", (W * 0.09, 0.05, H * 0.08), (-W * 0.32, front_y, z), "hl_synth_r"),
        ]

    if not buckets["Taillights"]:
        z = H * 0.4
        buckets["Taillights"] = [
            _prim("cube", (W * 0.09, 0.05, H * 0.09), (W * 0.34, rear_y, z), "tl_synth_l"),
            _prim("cube", (W * 0.09, 0.05, H * 0.09), (-W * 0.34, rear_y, z), "tl_synth_r"),
        ]

    if not buckets["Brakelights"]:
        z = H * 0.42
        buckets["Brakelights"] = [
            _prim("cube", (W * 0.14, 0.04, H * 0.035), (0.0, rear_y - 0.02, z), "bl_synth"),
        ]

    if not buckets["Interior"]:
        z0, z1 = H * 0.28, H * 0.55
        buckets["Interior"] = [
            _prim("cube", (W * 0.35, WB * 0.32, (z1 - z0) / 2), (0.0, WB * 0.02, (z0 + z1) / 2), "int_synth"),
        ]

    if not buckets["SteeringWheel"]:
        loc = (-W * 0.28, front_y - WB * 0.42, H * 0.5)
        o = _prim("torus", (0.16, 0.02), loc, "SteeringWheel")
        buckets["SteeringWheel"] = [o]

    if not buckets["Trim"]:
        buckets["Trim"] = [
            _prim("cube", (W * 0.46, 0.05, 0.02), (0.0, front_y + 0.05, 0.03), "trim_synth"),
        ]
    return buckets


# --- scale / recentre / symmetry --------------------------------------------

def scale_everything(target_length):
    objs = _mesh_objects()
    minc = [1e9, 1e9, 1e9]
    maxc = [-1e9, -1e9, -1e9]
    for o in objs:
        for v in o.data.vertices:
            for i in range(3):
                minc[i] = min(minc[i], v.co[i])
                maxc[i] = max(maxc[i], v.co[i])
    current_length = maxc[1] - minc[1]
    scale = target_length / current_length if current_length > 1e-6 else 1.0
    for o in objs:
        for v in o.data.vertices:
            v.co *= scale
        o.location *= scale
    return scale


def recentre_and_ground(corners_named):
    objs = _mesh_objects()
    hubs = {k: c["hub"].copy() for k, c in corners_named.items()}
    front_y = (hubs["Wheel_FL"].y + hubs["Wheel_FR"].y) / 2.0
    rear_y = (hubs["Wheel_RL"].y + hubs["Wheel_RR"].y) / 2.0
    centre_y = (front_y + rear_y) / 2.0

    # Body-ish objects still have matrix_world == identity (never origin-
    # shifted), so their vertex coords ARE world coords. Wheel_*/Brake_*
    # objects have their local origin at the hub (object.location = hub
    # world position, per wheels.py's contract) - v.co on those is
    # relative to the hub, not the world, so it must never be treated as
    # a world coordinate.
    is_hub_object = lambda o: o.name.startswith(("Wheel_", "Brake_"))
    body_objs = [o for o in objs if not is_hub_object(o)]
    xs = []
    for o in (body_objs or objs):
        xs.extend(v.co.x for v in o.data.vertices)
    centre_x = (max(xs) + min(xs)) / 2.0 if xs else 0.0

    min_z = min(o.location.z + min(v.co.z for v in o.data.vertices)
                for o in objs if o.name.startswith("Wheel_"))

    dx, dy, dz = -centre_x, -centre_y, -min_z
    for o in objs:
        if is_hub_object(o):
            o.location.x += dx
            o.location.y += dy
            o.location.z += dz
        else:
            for v in o.data.vertices:
                v.co.x += dx
                v.co.y += dy
                v.co.z += dz

    for k in hubs:
        hubs[k] += Vector((dx, dy, dz))
    return hubs


def force_wheel_symmetry(wheel_objs, brake_objs, hubs):
    half_front = (abs(hubs["Wheel_FL"].x) + abs(hubs["Wheel_FR"].x)) / 2.0
    half_rear = (abs(hubs["Wheel_RL"].x) + abs(hubs["Wheel_RR"].x)) / 2.0
    y_front = (hubs["Wheel_FL"].y + hubs["Wheel_FR"].y) / 2.0
    y_rear = (hubs["Wheel_RL"].y + hubs["Wheel_RR"].y) / 2.0
    targets = {
        "Wheel_FL": Vector((-half_front, y_front, hubs["Wheel_FL"].z)),
        "Wheel_FR": Vector((half_front, y_front, hubs["Wheel_FR"].z)),
        "Wheel_RL": Vector((-half_rear, y_rear, hubs["Wheel_RL"].z)),
        "Wheel_RR": Vector((half_rear, y_rear, hubs["Wheel_RR"].z)),
    }
    for tag, target in targets.items():
        w = wheel_objs.get(tag)
        b = brake_objs.get("Brake_" + tag.split("_")[1])
        if w is None:
            continue
        delta = target - hubs[tag]
        if delta.length < 1e-6:
            continue
        # Wheel_*/Brake_* objects are hub-local (mesh built around the
        # object's own origin, per wheels.py's contract) - nudging their
        # world position only ever moves object.location, never v.co,
        # or the correction would be applied twice.
        for o in (w, b):
            if o is None:
                continue
            o.location += delta
            o.location += delta
    return targets


# --- decimation to stay under the triangle budget ---------------------------

def decimate_to_budget(root, budget=TRI_BUDGET):
    objs = [o for o in export_mod._iter_children(root) if o.type == "MESH"]
    total = sum(export_mod.triangle_count(o) for o in objs)
    if total <= budget:
        return total
    ratio = max(0.04, budget / total)
    for o in objs:
        _select_only([o])
        mod = o.modifiers.new("Decimate", 'DECIMATE')
        mod.ratio = ratio
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return sum(export_mod.triangle_count(o) for o in objs)


# --- main --------------------------------------------------------------

def main():
    argv = sys.argv
    if "--" not in argv:
        print("usage: import_real.py -- <source.glb> <car_id>")
        sys.exit(2)
    args = argv[argv.index("--") + 1:]
    src_path, car_id = args[0], args[1]
    spec = specs.get_spec(car_id)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = materials_mod.build_materials()
    bpy.ops.import_scene.gltf(filepath=src_path)

    for o in list(bpy.context.scene.objects):
        if o.type in ("CAMERA", "LIGHT"):
            bpy.data.objects.remove(o, do_unlink=True)

    _apply_all_transforms()

    src_name = os.path.basename(src_path)
    if SOURCE_NOSE_FLIP.get(src_name, False):
        flip = Matrix.Rotation(math.pi, 4, 'Z')
        for o in _mesh_objects():
            o.matrix_world = flip @ o.matrix_world
        _apply_all_transforms()

    # remove degenerate/empty meshes up front
    for o in list(bpy.context.scene.objects):
        if o.type == "MESH" and not o.data.polygons:
            bpy.data.objects.remove(o, do_unlink=True)

    all_objs = _mesh_objects()
    length_estimate = max(v.co.y for o in all_objs for v in o.data.vertices) - \
        min(v.co.y for o in all_objs for v in o.data.vertices)

    corners, remaining = detect_wheels_and_brakes(length_estimate)
    if len(corners) != 4:
        print(f"FATAL: detected {len(corners)} wheel corners, expected 4")
        sys.exit(1)
    corners_named = _assign_corner_names(corners)

    wheel_objs, brake_objs = {}, {}
    for tag, corner in corners_named.items():
        w, b = _build_wheel_and_brake(tag, corner, mats)
        wheel_objs[tag] = w
        brake_objs["Brake_" + tag.split("_")[1]] = b

    buckets = classify_remaining(remaining)

    # --- scale everything (wheels, brakes, buckets) to target length ---
    scale = scale_everything(spec["length"])
    for tag in corners_named:
        corners_named[tag]["hub"] *= scale

    hubs = recentre_and_ground(corners_named)
    hubs = force_wheel_symmetry(wheel_objs, brake_objs, hubs)

    dims = dict(length=spec["length"], width=spec["width"], height=spec["height"],
                wheelbase=spec["wheelbase"])
    buckets = synthesize_missing(buckets, dims, mats)

    bucket_to_mat = {"Body": "Paint", "Glass": "Glass", "Trim": "Trim", "Chrome": "Chrome",
                      "Headlights": "Headlight", "Taillights": "Taillight",
                      "Brakelights": "Brakelight", "Interior": "Interior",
                      "SteeringWheel": "Interior"}
    for name, frags in buckets.items():
        for f in frags:
            _clear_and_set_material(f, mats[bucket_to_mat[name]])
    built = {}
    for name, frags in buckets.items():
        built[name] = _join(frags, name)
    _recalc_normals_outward(built.get("Body"))
    _force_centroid_outward(built.get("Body"), list(hubs.values()))

    if built.get("Chrome") is None:
        del built["Chrome"]  # optional per contract

    root = export_mod.build_hierarchy(
        car_id, built["Body"], built["Glass"], built["Trim"], built.get("Chrome"),
        built["Headlights"], built["Taillights"], built["Brakelights"],
        built["Interior"], built["SteeringWheel"], {**wheel_objs, **brake_objs})

    tri_total = decimate_to_budget(root)

    os.makedirs(MODELS_DIR, exist_ok=True)
    glb_path = os.path.join(MODELS_DIR, f"{car_id}.glb")
    export_mod.export_glb(root, glb_path)
    print(f"EXPORTED {glb_path} triangles={tri_total} scale={scale:.4f}")


if __name__ == "__main__":
    main()
