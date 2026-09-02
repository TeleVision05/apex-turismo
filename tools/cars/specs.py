"""CarSpec definitions for the roster of 9 procedurally generated cars.

Coordinate system (Blender space, before glTF export):
  +Y = nose direction (front of car)
  +Z = up (roof)
  +X = driver's right / car's right side
  Origin = centre of wheelbase, on the ground plane (Z=0)

All original fictional names/liveries - no real brand names anywhere.
"""

# body_style values: "notchback", "fastback", "hatch", "wedge", "gt_race", "prototype"
# wing values: "none", "lip", "gt3" (with uprights + swan neck variant via wing_swanneck)

CAR_SPECS = {
    "sakura_86": {
        "name": "Sakura Levin 86 '85",
        "length": 4.18, "width": 1.63, "height": 1.34, "wheelbase": 2.40,
        "track_front": 1.42, "track_rear": 1.40,
        "wheel_radius": 0.29, "tyre_width": 0.185,
        "ground_clearance": 0.135,
        "body_style": "notchback",
        "hood_length_ratio": 0.40,
        "roof_height": 1.18, "roof_start": 0.42, "roof_end": 0.72,
        "cabin_taper": 0.10, "rear_deck_height": 0.78,
        "wing": "none", "splitter": False, "diffuser": False,
        "wide_arches": False, "mirror_style": "stalk", "exhaust_count": 1,
        "shoulder_height_ratio": 0.42, "belt_height_ratio": 0.62,
        "front_overhang_ratio": 0.40,
        "headlight_style": "flat_pop",
    },
    "hakone_type_r": {
        "name": "Hakone Civic Type R",
        "length": 4.56, "width": 1.88, "height": 1.41, "wheelbase": 2.73,
        "track_front": 1.62, "track_rear": 1.60,
        "wheel_radius": 0.34, "tyre_width": 0.245,
        "ground_clearance": 0.115,
        "body_style": "hatch",
        "hood_length_ratio": 0.34,
        "roof_height": 1.28, "roof_start": 0.40, "roof_end": 0.78,
        "cabin_taper": 0.14, "rear_deck_height": 0.90,
        "wing": "gt3", "wing_swanneck": False, "splitter": True, "diffuser": True,
        "wide_arches": True, "mirror_style": "door", "exhaust_count": 3,
        "shoulder_height_ratio": 0.46, "belt_height_ratio": 0.64,
        "front_overhang_ratio": 0.36,
        "headlight_style": "wedge",
    },
    "kaizen_rx7": {
        "name": "Kaizen RX-7 Spirit R",
        "length": 4.28, "width": 1.76, "height": 1.23, "wheelbase": 2.43,
        "track_front": 1.46, "track_rear": 1.48,
        "wheel_radius": 0.32, "tyre_width": 0.225,
        "ground_clearance": 0.110,
        "body_style": "fastback",
        "hood_length_ratio": 0.38,
        "roof_height": 1.08, "roof_start": 0.44, "roof_end": 0.66,
        "cabin_taper": 0.16, "rear_deck_height": 0.74,
        "wing": "lip", "splitter": False, "diffuser": True,
        "wide_arches": True, "mirror_style": "door", "exhaust_count": 2,
        "shoulder_height_ratio": 0.44, "belt_height_ratio": 0.62,
        "front_overhang_ratio": 0.38,
        "headlight_style": "wedge",
    },
    "shinsei_gtr": {
        "name": "Shinsei GT-R Nismo",
        "length": 4.69, "width": 1.90, "height": 1.37, "wheelbase": 2.78,
        "track_front": 1.60, "track_rear": 1.62,
        "wheel_radius": 0.36, "tyre_width": 0.255,
        "ground_clearance": 0.120,
        "body_style": "fastback",
        "hood_length_ratio": 0.36,
        "roof_height": 1.20, "roof_start": 0.42, "roof_end": 0.72,
        "cabin_taper": 0.13, "rear_deck_height": 0.82,
        "wing": "gt3", "wing_swanneck": False, "splitter": True, "diffuser": True,
        "wide_arches": True, "mirror_style": "door", "exhaust_count": 4,
        "shoulder_height_ratio": 0.46, "belt_height_ratio": 0.64,
        "front_overhang_ratio": 0.34,
        "headlight_style": "quad_round",
    },
    "bavaria_m4": {
        "name": "Bavaria M4 Competition",
        "length": 4.79, "width": 1.89, "height": 1.39, "wheelbase": 2.86,
        "track_front": 1.61, "track_rear": 1.63,
        "wheel_radius": 0.35, "tyre_width": 0.245,
        "ground_clearance": 0.125,
        "body_style": "notchback",
        "hood_length_ratio": 0.42,
        "roof_height": 1.24, "roof_start": 0.44, "roof_end": 0.76,
        "cabin_taper": 0.11, "rear_deck_height": 0.86,
        "wing": "lip", "splitter": True, "diffuser": False,
        "wide_arches": False, "mirror_style": "door", "exhaust_count": 2,
        "shoulder_height_ratio": 0.44, "belt_height_ratio": 0.63,
        "front_overhang_ratio": 0.38,
        "headlight_style": "angular",
        "tall_grille": True,
    },
    "stallion_gt": {
        "name": "Stallion GT500",
        "length": 4.79, "width": 1.92, "height": 1.38, "wheelbase": 2.72,
        "track_front": 1.62, "track_rear": 1.64,
        "wheel_radius": 0.35, "tyre_width": 0.255,
        "ground_clearance": 0.130,
        "body_style": "fastback",
        "hood_length_ratio": 0.46,
        "roof_height": 1.20, "roof_start": 0.52, "roof_end": 0.76,
        "cabin_taper": 0.12, "rear_deck_height": 0.80,
        "wing": "lip", "splitter": True, "diffuser": True,
        "wide_arches": True, "mirror_style": "door", "exhaust_count": 4,
        "shoulder_height_ratio": 0.46, "belt_height_ratio": 0.64,
        "front_overhang_ratio": 0.42,
        "headlight_style": "angular",
        "hood_bulge": True,
    },
    "vantage_sf": {
        "name": "Vantage SF Stradale",
        "length": 4.60, "width": 1.98, "height": 1.19, "wheelbase": 2.65,
        "track_front": 1.66, "track_rear": 1.68,
        "wheel_radius": 0.35, "tyre_width": 0.265,
        "ground_clearance": 0.100,
        "body_style": "wedge",
        "hood_length_ratio": 0.22,
        "roof_height": 1.02, "roof_start": 0.34, "roof_end": 0.56,
        "cabin_taper": 0.20, "rear_deck_height": 0.68,
        "wing": "none", "splitter": True, "diffuser": True,
        "wide_arches": True, "mirror_style": "door", "exhaust_count": 2,
        "shoulder_height_ratio": 0.42, "belt_height_ratio": 0.60,
        "front_overhang_ratio": 0.30,
        "headlight_style": "slit",
        "mid_engine": True,
    },
    "aurelia_gt3": {
        "name": "Aurelia GT3",
        "length": 4.62, "width": 2.05, "height": 1.28, "wheelbase": 2.46,
        "track_front": 1.62, "track_rear": 1.64,
        "wheel_radius": 0.35, "tyre_width": 0.30,
        "ground_clearance": 0.085,
        "body_style": "gt_race",
        "hood_length_ratio": 0.30,
        "roof_height": 1.10, "roof_start": 0.40, "roof_end": 0.62,
        "cabin_taper": 0.10, "rear_deck_height": 0.72,
        "wing": "gt3", "wing_swanneck": True, "splitter": True, "diffuser": True,
        "wide_arches": True, "mirror_style": "door", "exhaust_count": 1,
        "shoulder_height_ratio": 0.40, "belt_height_ratio": 0.58,
        "front_overhang_ratio": 0.30,
        "headlight_style": "quad_round",
        "rear_engine": True,
        "box_arches": True,
    },
    "lyon_lmp": {
        "name": "Lyon LMP1 Hybrid",
        "length": 4.65, "width": 1.90, "height": 1.05, "wheelbase": 3.00,
        "track_front": 1.60, "track_rear": 1.58,
        "wheel_radius": 0.35, "tyre_width": 0.30,
        "ground_clearance": 0.075,
        "body_style": "prototype",
        "hood_length_ratio": 0.36,
        "roof_height": 0.86, "roof_start": 0.40, "roof_end": 0.56,
        "cabin_taper": 0.24, "rear_deck_height": 0.62,
        "wing": "gt3", "wing_swanneck": False, "splitter": True, "diffuser": True,
        "wide_arches": False, "mirror_style": "none", "exhaust_count": 1,
        "shoulder_height_ratio": 0.36, "belt_height_ratio": 0.50,
        "front_overhang_ratio": 0.28,
        "headlight_style": "slit",
        "closed_cockpit": True, "fin": True, "fender_bulges": True,
    },
}

ROSTER_ORDER = [
    "sakura_86", "hakone_type_r", "kaizen_rx7", "shinsei_gtr", "bavaria_m4",
    "stallion_gt", "vantage_sf", "aurelia_gt3", "lyon_lmp",
]


def get_spec(car_id):
    spec = dict(CAR_SPECS[car_id])
    spec["id"] = car_id
    spec.setdefault("wing_swanneck", False)
    spec.setdefault("tall_grille", False)
    spec.setdefault("hood_bulge", False)
    spec.setdefault("mid_engine", False)
    spec.setdefault("rear_engine", False)
    spec.setdefault("box_arches", False)
    spec.setdefault("closed_cockpit", False)
    spec.setdefault("fin", False)
    spec.setdefault("fender_bulges", False)
    return spec


# --- deterministic body-loft profile keypoints (see body.py) -------------
# Every value is metres; x fractions are measured from the NOSE (x=0) to
# the TAIL (x=L). Kept here, driven by the existing per-car fields, so the
# shape stays tunable without touching body.py.
STYLE_RAKE = {
    # (screen_run, back_run) - how many metres the windscreen/backlight
    # take to go from the belt up to the roof (and back down)
    "wedge": (0.78, 0.42), "prototype": (0.70, 0.46), "gt_race": (0.55, 0.42),
    "hatch": (0.52, 0.58), "fastback": (0.52, 0.68), "notchback": (0.46, 0.50),
}
STYLE_XA = {  # A-pillar-base (cowl) fraction of length from the nose
    "wedge": 0.53, "prototype": 0.50, "gt_race": 0.40,
    "hatch": 0.34, "fastback": 0.38, "notchback": 0.40,
}
STYLE_XC = {  # C-pillar-base (backlight base) fraction of length from nose
    "wedge": 0.80, "prototype": 0.80, "gt_race": 0.76,
    "hatch": 0.86, "fastback": 0.90, "notchback": 0.80,
}


def get_profile(spec):
    """Keypoint tables for the deterministic loft in body.py: w (plan
    half-width), zf (floor), zt (lower-body top / belt line), each a list
    of (x_fraction_from_nose, value_metres); plus the greenhouse span."""
    L = spec["length"]
    hw = spec["width"] / 2.0
    gc = spec["ground_clearance"]
    H = spec["roof_height"]
    shoulder_z = H * 0.0 + spec["height"] * spec["shoulder_height_ratio"]
    belt_z = spec["height"] * spec["belt_height_ratio"]
    rear_deck_z = spec["rear_deck_height"]
    style = spec["body_style"]

    frac03 = min(0.30, L * 0.35) / L

    w = [
        (0.0, hw * 0.72), (0.10, hw * 0.90), (0.18, hw), (0.50, hw),
        (0.92, hw), (1.0, hw * 0.78),
    ]
    zf = [
        (0.0, gc + 0.13), (frac03, gc), (1 - frac03, gc), (1.0, gc + 0.13),
    ]

    xa = STYLE_XA.get(style, 0.40)
    xc = STYLE_XC.get(style, 0.80)
    xb = (xa + xc) / 2.0
    screen_run, back_run = STYLE_RAKE.get(style, (0.5, 0.5))

    nose_bump = shoulder_z * 0.80
    tail_bump = shoulder_z * 0.78
    zt = [
        (0.0, nose_bump), (0.12, shoulder_z), (xa - 0.03, belt_z * 0.98),
        (xa, belt_z), (xb, belt_z), (xc, belt_z * 1.03),
        (min(1.0, xc + 0.06), rear_deck_z), (1.0, tail_bump),
    ]
    rt = [(0.0, 0.30), (0.18, 0.14), (0.5, 0.12), (0.82, 0.14), (1.0, 0.25)]

    return dict(w=w, zf=zf, zt=zt, rt=rt, xa=xa, xb=xb, xc=xc,
                screen_run=screen_run, back_run=back_run, H=H, belt_z=belt_z)
