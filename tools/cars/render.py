"""Studio-lit EEVEE preview renders: front three-quarter, rear three-quarter,
and side, each 900x600, neutral grey world + sun + ground plane."""
import math
import bpy


def setup_studio(spec):
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 600
    scene.render.film_transparent = False

    world = bpy.data.worlds.new("Studio")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.62, 0.62, 0.64, 1.0)
    bg.inputs[1].default_value = 1.1
    scene.world = world

    sun_data = bpy.data.lights.new("Sun", 'SUN')
    sun_data.energy = 3.2
    sun_data.angle = math.radians(2.0)
    sun = bpy.data.objects.new("Sun", sun_data)
    bpy.context.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(55), 0, math.radians(35))

    fill_data = bpy.data.lights.new("Fill", 'SUN')
    fill_data.energy = 1.1
    fill = bpy.data.objects.new("Fill", fill_data)
    bpy.context.collection.objects.link(fill)
    fill.rotation_euler = (math.radians(60), 0, math.radians(-140))

    ground_mesh = bpy.data.meshes.new("Ground")
    ground = bpy.data.objects.new("Ground", ground_mesh)
    bpy.context.collection.objects.link(ground)
    size = max(6.0, spec["length"] * 2.2)
    verts = [(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)]
    ground_mesh.from_pydata(verts, [], [[0, 1, 2, 3]])
    ground_mesh.update()
    ground_mat = bpy.data.materials.new("GroundMat")
    ground_mat.use_nodes = True
    ground_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (
        0.5, 0.5, 0.52, 1.0)
    ground_mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.8
    ground_mesh.materials.append(ground_mat)
    return ground


def _add_camera(name, location, target):
    cam_data = bpy.data.cameras.new(name)
    cam_data.lens = 42
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = location
    direction = (target - cam.location)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    return cam


def render_views(spec, out_dir, car_id):
    from mathutils import Vector
    L, H = spec["length"], spec["height"]
    centre = Vector((0, 0, H * 0.45))
    dist = L * 1.25
    eye_z = 1.2  # human eye height, not scaled by car height - a ground
    # -level "photo" reads far less toy-like than a high overhead camera.
    az = math.radians(30)

    # nose points +Y, so the front three-quarter camera must sit on the +Y
    # side (in front of the car, looking back at the nose), 30 deg off the
    # nose-on axis.
    views = {
        "front34": Vector((dist * math.sin(az), dist * math.cos(az), eye_z)),
        "rear34": Vector((dist * math.sin(az), -dist * math.cos(az), eye_z)),
        "side": Vector((dist * 1.05, 0.0, eye_z)),
    }
    scene = bpy.context.scene
    paths = {}
    for view_name, loc in views.items():
        cam = _add_camera(f"Cam_{view_name}", loc, centre)
        scene.camera = cam
        out_path = f"{out_dir}/{car_id}_{view_name}.png"
        scene.render.filepath = out_path
        bpy.ops.render.render(write_still=True)
        paths[view_name] = out_path
        bpy.data.objects.remove(cam, do_unlink=True)
    return paths
