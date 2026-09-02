"""Open-Meteo elevation lookups with disk caching, batched 100 coords/request."""
import hashlib
import json
import time
from pathlib import Path

import numpy as np
import requests

from geometry import periodic_gaussian_smooth

CACHE_DIR = Path(__file__).parent / "cache" / "elevation"
URL = "https://api.open-meteo.com/v1/elevation"


def _batch_key(lats, lons):
    h = hashlib.sha1()
    for a, b in zip(lats, lons):
        h.update(f"{a:.5f},{b:.5f};".encode())
    return h.hexdigest()[:16]


def _fetch_batch(track_id, lats, lons):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    key = _batch_key(lats, lons)
    cache_path = CACHE_DIR / f"{track_id}_{key}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text())["elevation"]
    params = {"latitude": ",".join(f"{v:.6f}" for v in lats), "longitude": ",".join(f"{v:.6f}" for v in lons)}
    last_err = None
    for attempt in range(10):
        try:
            resp = requests.get(URL, params=params, timeout=60)
            if resp.status_code == 429:
                raise requests.HTTPError("429 rate limited")
            resp.raise_for_status()
            data = resp.json()
            cache_path.write_text(json.dumps(data))
            return data["elevation"]
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(min(3 * (1.6 ** attempt), 45))
    raise RuntimeError(f"elevation fetch failed after retries: {last_err}")


def fetch_elevations(track_id, lats, lons, batch_size=100):
    """Fetch elevations for all lat/lon pairs, batched at batch_size per request."""
    elevs = []
    for i in range(0, len(lats), batch_size):
        elevs.extend(_fetch_batch(track_id, lats[i : i + batch_size], lons[i : i + batch_size]))
        time.sleep(2.5)
    return np.array(elevs, dtype=float)


def process_elevation(raw_elevs, spacing_m=4.0, sigma_m=25.0, max_grade=0.12):
    """Smooth raw (noisy) elevations along the loop and clamp grade to
    max_grade, then subtract the minimum so the lowest point is y=0."""
    sigma_samples = max(sigma_m / spacing_m, 1.0)
    smoothed = periodic_gaussian_smooth(raw_elevs, sigma_samples)

    for _ in range(20):
        grade = np.diff(np.concatenate([smoothed, smoothed[:1]])) / spacing_m
        if np.max(np.abs(grade)) <= max_grade:
            break
        smoothed = periodic_gaussian_smooth(smoothed, sigma_samples)

    smoothed -= smoothed.min()
    return smoothed
