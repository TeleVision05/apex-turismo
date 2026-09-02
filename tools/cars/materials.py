"""Material factory. Every material name/property here is part of the GLB
contract consumed by the game - do not rename.
"""
import bpy


def _make(name, base_color, metallic, roughness, alpha=1.0, emission=None,
          emission_strength=0.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*base_color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = alpha
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        mat.blend_method = 'BLEND'
        mat.show_transparent_back = False
    mat.use_backface_culling = False
    return mat


def build_materials():
    """Create (or fetch) every material the contract requires. Returns a dict
    name -> bpy.types.Material."""
    mats = {}
    mats["Paint"] = _make("Paint", (1.0, 1.0, 1.0), 0.0, 0.35)
    mats["Glass"] = _make("Glass", (0.02, 0.02, 0.02), 0.0, 0.05, alpha=0.5)
    mats["Trim"] = _make("Trim", (0.02, 0.02, 0.02), 0.0, 0.6)
    mats["Chrome"] = _make("Chrome", (0.8, 0.8, 0.82), 1.0, 0.15)
    mats["Headlight"] = _make("Headlight", (0.9, 0.95, 1.0), 0.0, 0.2,
                               emission=(0.9, 0.95, 1.0), emission_strength=2.0)
    mats["Taillight"] = _make("Taillight", (1.0, 0.05, 0.02), 0.0, 0.2,
                               emission=(1.0, 0.05, 0.02), emission_strength=1.5)
    mats["Brakelight"] = _make("Brakelight", (0.6, 0.0, 0.0), 0.0, 0.3,
                                emission=(0.6, 0.0, 0.0), emission_strength=0.0)
    mats["Interior"] = _make("Interior", (0.05, 0.05, 0.06), 0.0, 0.55)
    mats["Rubber"] = _make("Rubber", (0.02, 0.02, 0.02), 0.0, 0.9)
    mats["Rim"] = _make("Rim", (0.6, 0.6, 0.62), 1.0, 0.35)
    mats["Brake"] = _make("Brake", (0.35, 0.32, 0.3), 0.6, 0.4)
    return mats
