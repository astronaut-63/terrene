import asyncio
import math
import time
from fastapi import HTTPException
from backend.cities import CITIES, resolve_city_id
from backend.city_attraction_catalog import curated_attractions
from backend.places import _overpass_json, normalize, _provider_limit

CACHE = {}
LOCK = asyncio.Lock()
DURATIONS = {'museum': 90, 'park': 60, 'viewpoint': 20, 'heritage': 45, 'attraction': 45}

def classify(tags):
    if tags.get('tourism') == 'museum': return 'museum'
    if tags.get('historic') or tags.get('heritage'): return 'heritage'
    if tags.get('tourism') == 'viewpoint': return 'viewpoint'
    if tags.get('leisure') == 'park': return 'park'
    return 'attraction'

def normalize_attractions(elements, city):
    output, seen = [], set()
    south, north, west, east = city['bbox']
    for place in normalize(elements):
        tags = {k: v for k, v in place['metadata'].items() if isinstance(k, str) and isinstance(v, str)}
        place['metadata'] = tags
        point = place['coordinates']
        if not tags.get('name', '').strip() or not south <= point['latitude'] <= north or not west <= point['longitude'] <= east: continue
        if not (tags.get('tourism') in {'museum', 'attraction', 'viewpoint'} or tags.get('historic') or tags.get('heritage') or tags.get('leisure') == 'park' and (tags.get('wikidata') or tags.get('wikipedia'))): continue
        identity = tags.get('wikidata') or (place['name'].casefold(), round(point['latitude'], 4), round(point['longitude'], 4))
        if identity in seen: continue
        seen.add(identity)
        category = classify(tags)
        output.append({**place, 'category': category, 'visit_minutes': DURATIONS[category], 'duration_basis': 'Editable category estimate, not an official visit duration', 'source': 'OpenStreetMap', 'source_url': 'https://www.openstreetmap.org', 'attribution': '© OpenStreetMap contributors', 'editorial_priority': 99, 'priority_explanation': 'Live mapped result; no curated editorial priority'})
    return output


def _distance_m(a, b):
    lat1, lat2 = math.radians(a['latitude']), math.radians(b['latitude'])
    dlat = lat2 - lat1
    dlon = math.radians(b['longitude'] - a['longitude'])
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(value)))


def _same_attraction(curated, live):
    if curated.get('metadata', {}).get('wikidata') and curated['metadata']['wikidata'] == live.get('metadata', {}).get('wikidata'):
        return True
    names = {' '.join(curated['name'].casefold().split()), ' '.join(live['name'].casefold().split())}
    if len(names) == 1:
        return True
    return _distance_m(curated['coordinates'], live['coordinates']) <= 150 and (curated['name'].casefold() in live['name'].casefold() or live['name'].casefold() in curated['name'].casefold())


def merge_attractions(curated, live):
    """Keep curated records as the baseline and add non-duplicate live records."""
    merged = list(curated)
    for place in live:
        if not any(_same_attraction(item, place) for item in merged):
            merged.append(place)
    return merged

async def attractions(city_id):
    canonical_id = resolve_city_id(city_id)
    city = CITIES.get(canonical_id) if canonical_id else None
    if not city: raise HTTPException(404, 'City Guide is not available for this city yet.')
    async with LOCK:
        cached = CACHE.get(canonical_id)
        if cached and cached[0] > time.monotonic(): return cached[1]
        curated = curated_attractions(canonical_id)
        s, n, w, e = city['bbox']; box = f'{s},{w},{n},{e}'
        query = f'[out:json][timeout:20];(nwr["tourism"~"^(museum|attraction|viewpoint)$"]({box});nwr["historic"]({box});nwr["heritage"]({box});nwr["leisure"="park"]["wikidata"]({box}););out center tags 500;'
        warning = None
        live = []
        status = 'ok'
        try:
            async with asyncio.timeout(55):
                async with _provider_limit: data = await _overpass_json(query)
            if not isinstance(data, dict) or not isinstance(data.get('elements'), list):
                raise ValueError('invalid response')
            live = normalize_attractions(data['elements'], city)
            if data.get('remark'):
                status, warning = 'partial', 'Live map coverage was incomplete; curated attractions are still shown.'
        except (TimeoutError, HTTPException, ValueError, TypeError):
            status, warning = 'partial', 'Live map enrichment was unavailable; showing the curated catalogue.'
        result = {'results': merge_attractions(curated, live), 'status': status, 'warning': warning, 'attribution': '© OpenStreetMap contributors; curated sources are listed per attraction', 'limit': 500}
        CACHE[canonical_id] = (time.monotonic() + 600, result)
        return result
