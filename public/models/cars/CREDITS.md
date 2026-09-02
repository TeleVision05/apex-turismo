# Real-model credits

Nine of the roster's cars ship a normalised real-world source model instead
of (or alongside, see `tools/cars/previews/` vs `tools/cars/previews_real/`)
the procedural build. Every source below was downloaded without any login,
under a licence that permits reuse (CC0 or CC-BY); the CC-BY entries need
the credit line kept somewhere reachable (this file) per their licence.
Original downloads are kept in `tools/cars/real_sources/` (git-ignored).

| roster id | source | author | licence | notes |
|---|---|---|---|---|
| `sakura_86` | [Toyota AE86](https://poly.pizza/m/ZEFWmOPSgh) - Poly Pizza | IvOfficial | CC-BY 3.0 | Toyota Corolla AE86 Trueno |
| `hakone_type_r` | [Sports Hatchback](https://poly.pizza/m/DobtD8JyoW) - Poly Pizza | ReppenThe303 | CC-BY 3.0 | generic hot hatch, close stand-in for a Civic Type R |
| `kaizen_rx7` | [Mazda RX-7](https://poly.pizza/m/SnIoWlh7S2) - Poly Pizza | IvOfficial | CC-BY 3.0 | FD-generation RX-7 |
| `shinsei_gtr` | [Nissan GTR](https://poly.pizza/m/a_HKCtYAv2W) - Poly Pizza | David Sirera | CC-BY 3.0 | R34-generation GT-R |
| `bavaria_m4` | ["BMW M4 Competition M Package"](https://skfb.ly/oyM8P) via [GitHub mirror](https://github.com/coopercodes/bmwGLB) | 𝙎𝙍𝙏 𝙋𝙚𝙧𝙛𝙤𝙧𝙢𝙖𝙣𝙘𝙚™ | CC-BY 4.0 | original on Sketchfab, GLB vendored on GitHub |
| `stallion_gt` | [Dodge Charger](https://poly.pizza/m/4b80hRVxqvv) - Poly Pizza | David Sirera | CC-BY 3.0 | classic muscle-car stand-in for an American GT |
| `vantage_sf` | [Ferrari 458 Italia](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/ferrari.glb) - vendored in the three.js repo (`examples/webgl_materials_car.html`) | vicent091036 | CC-BY (Sketchfab) | close stand-in for the Vantage SF; by far the highest-detail source used (51 named parts, ~360k source tris, decimated to fit budget) |
| `aurelia_gt3` | [Lamborghini Aventador ("CAR Model")](https://poly.pizza/m/5zUWP5UsLg-) - Poly Pizza | Ignition Labs | CC-BY 3.0 | supercar stand-in for a GT3-flavoured car; source already used contract-shaped names (`Wheel_FL` etc) |
| `lyon_lmp` | [Endurance Race Car](https://poly.pizza/m/O2ctIKoLrr) - Poly Pizza | Streetsrak3r | CC-BY 3.0 | genuine Le Mans Hypercar/LMP-style prototype shape |

All nine are CC-BY (attribution required, reproduced above) - none are CC0.
No source needed a login or account to download (three.js's raw GitHub URL
and every poly.pizza `static.poly.pizza/<id>.glb` link are public).

## Skipped candidates

- Sketchfab search results in general - Sketchfab's own download flow
  requires a login/account, so nothing was pulled directly from Sketchfab
  (the Ferrari and BMW M4 above are both *vendored elsewhere* under their
  original Sketchfab licence, not downloaded from Sketchfab itself).
- `github.com/Kaseral/3d_Models` (`porsche_911_gt3.glb`) - no LICENSE file
  and no credit/source noted in the repo, so licence status is unclear;
  skipped per the "skip anything with unclear licensing" instruction.
- Quaternius/Kenney low-poly car packs (poly.pizza "Cars Bundle", CC0) -
  kept as a documented fallback option but never needed; every roster slot
  got a real, higher-detail model instead.
