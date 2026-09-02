# apex-turismo track-data pipeline

Fetches real race-circuit centerlines from OpenStreetMap, stitches the raw
`highway=raceway` ways into a single closed loop, adds elevation from
Open-Meteo, and emits per-track JSON consumed by the game.

## Setup

```bash
cd tools/tracks
python3 -m venv .venv
.venv/bin/pip install numpy scipy matplotlib requests
```

## Run

```bash
# build every track in the TRACKS table
.venv/bin/python build_tracks.py

# build a subset
.venv/bin/python build_tracks.py suzuka monza spa laguna_seca
```

Raw Overpass and Open-Meteo responses are cached under `cache/` (and
`cache/elevation/`) — delete the relevant cache file(s) to force a re-fetch.
Output JSON goes to `public/tracks/<id>.json` and `public/tracks/index.json`.
Preview PNGs (top-down loop + elevation profile) go to `previews/<id>.png`.
A run-summary table (points, length vs. real length, max grade, elevation
range, corner count, max heading kink) is printed at the end.

## Pipeline (see each module)

- `overpass.py` — Overpass API fetch + disk cache, with a fallback mirror.
- `stitch.py` — filters ways, builds a directed node graph, walks the main
  loop (greedy heading/tag-preference walk, falling back to a depth-limited
  DFS over branch choices when the greedy walk misses the known real lap
  length by more than 15%), and extracts corner-name way midpoints.
- `geometry.py` — equirectangular lat/lon projection, periodic cubic-spline
  resampling to 4 m spacing, periodic Gaussian smoothing, signed-area
  (direction) and heading-kink checks.
- `elevation.py` — batched (100 coords/request) Open-Meteo lookups with
  retry/backoff on rate limiting, periodic smoothing (sigma = 25 m) and
  grade clamping to 12%. `fetch_elevations_strided` (the default path) only
  queries ~120 evenly-spaced points per track and periodically interpolates
  the rest, rather than every resampled point — a deliberate deviation from
  querying every 4 m sample: the source DEM is ~90 m resolution, so 4 m
  sampling is heavy oversampling of the same pixels, and Open-Meteo's free
  tier has a per-hour request cap that a dozen ~1400-point tracks blows
  through fast. `fetch_elevations` (dense, every point) is still there and
  used when a track's elevation is already fully cached from an earlier run.
- `bulk_fetch.py` — one-off helper to fetch several tracks' raceway ways in
  a single combined Overpass query (union of `around` filters) and split
  the result into normal per-track cache files, for when public Overpass
  mirrors are rate-limiting per-request rather than per-payload.
- `pitlane.py` — optional pit-lane polyline extraction (elevation borrowed
  from the nearest main-loop point); set to `null` when the pit lane geometry
  looks too messy or too far from the loop.
- `plotting.py` — matplotlib preview PNGs (north-up, start/finish arrow,
  corner labels, elevation subplot).
- `build_tracks.py` — orchestrates the above per track, per the `TRACKS`
  table, and writes `index.json` + the summary table. Per-track hacks that
  couldn't be avoided live in one `OVERRIDES` dict at the top, each with a
  comment explaining why.

## Output format (`public/tracks/<id>.json`)

```json
{
  "id": "suzuka",
  "name": "Suzuka Circuit",
  "country": "Japan",
  "lengthM": 5807.4,
  "direction": "clockwise",
  "sampleSpacingM": 4,
  "points": [[x, y, z], ...],
  "widths": [12, 12, ...],
  "startIndex": 0,
  "corners": [{"name": "First Turn", "number": 1, "index": 123}, ...],
  "pitLane": null,
  "origin": {"lat": 34.84, "lon": 136.54},
  "source": "OpenStreetMap contributors, ODbL; elevation Open-Meteo"
}
```

Coordinates are local meters (equirectangular projection centered on the
loop): `+x` east, `+z` south, `y` = elevation above the track's lowest point.
`public/tracks/index.json` is a flat list of `{id, name, country, lengthM,
direction, corners, elevationRangeM}` for every track that built successfully
— it is rebuilt from every `<id>.json` actually present in `public/tracks/`
each run (`rebuild_index()`), not just the tracks built in that particular
invocation, so building a subset never drops previously-built tracks from it.

## Status (last full run)

10 of 12 tracks in the spec's table built cleanly: suzuka, monza, spa,
laguna_seca, brands_hatch, tsukuba, fuji, interlagos, red_bull_ring,
silverstone. Two were skipped:

- **nurburgring_gp** — the GP-Strecke's OSM ways are topologically entangled
  with the adjacent Sprintstrecke and Mullenbachschleife (they share
  physical tarmac tagged only under the other circuit's name at the
  junction). Every radius/name-exclusion combination tried either broke
  loop connectivity or reproduced the same wrong ~4587 m loop through
  "Nurburgring Sprintstrecke" + "Rallycross circuit" ways. See the comment
  above `OVERRIDES` in `build_tracks.py` for the full list of what was tried.
- **bathurst** — the `highway~tertiary|secondary|...` road fallback query
  (public Overpass mirrors were flapping between connection-refused, 500s
  and 403s for long stretches of this session, so it took several attempts
  to even get a response) returns real Bathurst road names (Panorama
  Avenue, Mountain Straight, Conrod Straight, Pit Straight, Forrest's
  Elbow, McPhillamy Park, Brocks Skyline, Sulman Park), but the public
  street graph doesn't stitch end-to-end from just those named ways --
  the walk closes on an 894 m loop, 86% short of the real 6213 m lap,
  because the unnamed connecting street segments between them (minor
  links, roundabouts) aren't part of the name-filtered fetch. Per the
  spec's own note that Bathurst may not be worth stitching, this was
  skipped rather than widening the name regex indefinitely.

Known limitation: **silverstone** has one ~40 m stretch (Chapel
Curve → Hangar Straight) where the resampled centerline shows a spurious
~130 deg heading spike from a spline-evaluation artifact (a long, sparsely
digitized 146 m OSM chord sitting right next to a real corner). Confirmed
it is not a stitching/topology bug — every node through that stretch has
exactly one outgoing graph edge, so the walk had no alternative branch to
take. `geometry._densify()` mitigates it (worse before: ~143 deg) but
doesn't fully remove it.
