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
  grade clamping to 12%.
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
direction, corners, elevationRangeM}` for every track that built successfully.
