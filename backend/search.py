"""Bounded, cached geocoding adapter with the existing frontend contract."""
import asyncio
import math
import time
import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
cache = {}
lock = asyncio.Lock()
last_request = 0.0

def normalize(payload):
    if not isinstance(payload, list):
        raise HTTPException(502, 'Geocoding provider returned an unexpected response.')
    results = []
    for row in payload:
        try:
            lat, lon = float(row['lat']), float(row['lon'])
            name = row['display_name']
            if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180 and isinstance(name, str) and name.strip()):
                continue
            results.append({'id': str(row.get('place_id', f'{lat}:{lon}')), 'name': name.split(',')[0], 'displayName': name, 'coordinates': {'latitude': lat, 'longitude': lon}})
        except (KeyError, TypeError, ValueError):
            continue
    return {'results': results, 'attribution': '© OpenStreetMap contributors'}

@router.get('/api/locations/search')
@router.get('/api/v1/locations/search')
async def search(q: str = Query(min_length=1, max_length=256)):
    global last_request
    q = q.strip()
    if not q:
        raise HTTPException(400, 'Enter a location to search.')
    async with lock:
        entry = cache.get(q.lower())
        if entry and entry[0] > time.monotonic():
            return entry[1]
        await asyncio.sleep(max(0, 1.1 - (time.monotonic() - last_request)))
        last_request = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get('https://nominatim.openstreetmap.org/search', params={'q': q, 'format': 'jsonv2', 'limit': 8}, headers={'User-Agent': 'Terrene/0.1 (geographical exploration demo)', 'Accept': 'application/json'})
            if response.status_code == 429:
                raise HTTPException(429, 'Location search is rate-limited; try again shortly.')
            response.raise_for_status()
            result = normalize(response.json())
        except httpx.TimeoutException:
            raise HTTPException(504, 'Location search timed out.')
        except (httpx.HTTPError, ValueError):
            raise HTTPException(502, 'Location search provider is unavailable.')
        if len(cache) >= 100:
            cache.pop(next(iter(cache)))
        cache[q.lower()] = (time.monotonic() + 300, result)
        return result
