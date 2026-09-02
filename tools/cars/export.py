"""Hierarchy assembly + GLB export."""
import math
import bmesh
import bpy


def shade_smooth_auto(obj, angle_deg=30):
    for p in obj.data.polygons:
        p.use_smooth = True
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle_deg))
    except Exception:
        pass


def add_uvs(obj):
    if obj.data.uv_layers:
        return
    obj.data.uv_layers.new(name="UVMap")
    bpy.context.view_layer.objects.active = obj
    for o in bpy.context.selected_objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    bm = bmesh.from_edit_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.update_edit_mesh(obj.data)
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode='OBJECT')


def join_group(objects, name):
    """Join a list of small part-objects into a single object with `name`."""
    if not objects:
        return None
    if len(objects) == 1:
        objects[0].name = name
        return objects[0]
    bpy.context.view_layer.objects.active = objects[0]
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objects:
        o.select_set(True)
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    return joined


def build_hierarchy(car_id, body, glass, trim, chrome, headlights, taillights,
                     brakelights, interior, steering_wheel, wheels_and_brakes):
    root = bpy.data.objects.new("Car", None)
    bpy.context.collection.objects.link(root)
    root.empty_display_size = 0.1

    top_level = [o for o in (body, glass, trim, chrome, headlights, taillights,
                              brakelights, interior, steering_wheel) if o is not None]
    top_level.extend(wheels_and_brakes.values())

    for obj in top_level:
        add_uvs(obj)
        shade_smooth_auto(obj)
        obj.parent = root
        obj.matrix_parent_inverse = root.matrix_world.inverted()
    return root


def triangle_count(obj):
    total = 0
    for p in obj.data.polygons:
        total += max(0, len(p.vertices) - 2)
    return total


def measure_dimensions(body_obj, glass_obj, wheels):
    """Real dimensions off the generated geometry (not the input spec), for
    index.json. Body/Glass vertices are already in car-root space."""
    xs, ys, zs = [], [], []
    for obj in (body_obj, glass_obj):
        if obj is None:
            continue
        for v in obj.data.vertices:
            w = obj.matrix_world @ v.co
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
    length = max(ys) - min(ys)
    width = max(xs) - min(xs)
    height = max(zs)  # ground (tyre contact) is Z=0, not the body's own low point

    fl, fr = wheels["Wheel_FL"], wheels["Wheel_FR"]
    rl, rr = wheels["Wheel_RL"], wheels["Wheel_RR"]
    wheelbase = abs(fl.location.y - rl.location.y)
    track_front = abs(fl.location.x - fr.location.x)
    track_rear = abs(rl.location.x - rr.location.x)

    wv = fl.data.vertices
    wheel_radius = max((v.co.y ** 2 + v.co.z ** 2) ** 0.5 for v in wv)
    tyre_width = max(v.co.x for v in wv) - min(v.co.x for v in wv)

    return dict(length=length, width=width, height=height, wheelbase=wheelbase,
                trackFront=track_front, trackRear=track_rear,
                wheelRadius=wheel_radius, tyreWidth=tyre_width)


def export_glb(root, filepath):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    objs = [root] + list(_iter_children(root))
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=filepath,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )


def _iter_children(obj):
    for c in obj.children:
        yield c
        yield from _iter_children(c)
