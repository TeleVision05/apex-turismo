"""Overpass API fetching with on-disk caching."""
import json
import time
from pathlib import Path

import requests

PRIMARY_URL = "https://overpass-api.de/api/interpreter"
FALLBACK_URL = "https://overpass.kumi.systems/api/interpreter"
# Second fallback: overpass-api.de and kumi.systems were both unreachable
# (connection refused / 500) during a build session on 2026-09-01, likely a
# temporary rate-limit ban after fetching many large-radius queries back to
# back. openstreetmap.fr's full-planet mirror was reachable and returned
# correct data, so it's kept as a last resort.
FALLBACK_URL_2 = "https://overpass.openstreetmap.fr/api/interpreter"

CACHE_DIR = Path(__file__).parent / "cache"


def _post(url, query, timeout=90):
    resp = requests.post(url, data={"data": query}, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def fetch_overpass(track_id, query, cache_suffix=""):
    """Fetch an Overpass query, caching the raw JSON response to
    cache/<track_id><cache_suffix>.json. Never re-fetches if the cache file
    already exists. Falls back to the kumi.systems mirror on failure."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = CACHE_DIR / f"{track_id}{cache_suffix}.json"
    if cache_path.exists():
        return json.loads(cache_path.read_text())

    last_err = None
    for url in (PRIMARY_URL, FALLBACK_URL, FALLBACK_URL_2):
        for attempt in range(2):
            try:
                data = _post(url, query)
                if not data.get("elements"):
                    raise RuntimeError("empty result set")
                cache_path.write_text(json.dumps(data))
                return data
            except Exception as e:  # noqa: BLE001
                last_err = e
                time.sleep(3)
    raise RuntimeError(f"Overpass fetch failed for {track_id}: {last_err}")


def raceway_query(lat, lon, radius_m):
    return (
        f'[out:json][timeout:80];way["highway"="raceway"]'
        f"(around:{radius_m},{lat},{lon});out geom;"
    )


def road_fallback_query(lat, lon, radius_m, name_regex):
    return (
        f'[out:json][timeout:80];way["highway"~"tertiary|secondary|unclassified|residential"]'
        f'["name"~"{name_regex}",i](around:{radius_m},{lat},{lon});out geom;'
    )
