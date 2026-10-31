import asyncio
import time
from fastapi import HTTPException
from backend.cities import CITIES
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
        output.append({**place, 'category': category, 'visit_minutes': DURATIONS[category], 'duration_basis': 'Editable category estimate, not an official visit duration', 'source': 'OpenStreetMap', 'attribution': '© OpenStreetMap contributors'})
    return output

async def attractions(city_id):
    city = CITIES.get(city_id)
    if not city: raise HTTPException(404, 'City Guide is not available for this city yet.')
    async with LOCK:
        cached = CACHE.get(city_id)
        if cached and cached[0] > time.monotonic(): return cached[1]
        s, n, w, e = city['bbox']; box = f'{s},{w},{n},{e}'
        query = f'[out:json][timeout:20];(nwr["tourism"~"^(museum|attraction|viewpoint)$"]({box});nwr["historic"]({box});nwr["heritage"]({box});nwr["leisure"="park"]["wikidata"]({box}););out center tags 500;'
        try:
            async with asyncio.timeout(55):
                async with _provider_limit: data = await _overpass_json(query)
        except TimeoutError:
            raise HTTPException(504, 'City attraction lookup timed out. Try again later.')
        if not isinstance(data, dict) or not isinstance(data.get('elements'), list): raise HTTPException(502, 'Attraction provider returned invalid data.')
        result = {'results': normalize_attractions(data['elements'], city), 'status': 'partial' if data.get('remark') else 'ok', 'warning': 'Provider returned incomplete coverage.' if data.get('remark') else None, 'attribution': '© OpenStreetMap contributors', 'limit': 500}
        if data.get('remark') and not result['results']: raise HTTPException(503, 'Attraction provider could not complete the city query.')
        CACHE[city_id] = (time.monotonic() + 600, result)
        return result
