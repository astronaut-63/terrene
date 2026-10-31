import asyncio
import math
import os
import time
import logging
import uuid
from datetime import datetime, timezone
from typing import Literal
import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, AwareDatetime
from backend.routing import Point

router = APIRouter(prefix='/api/v1/places')
CATEGORIES = {
    'tourism': [('tourism', 'attraction|museum|viewpoint'), ('historic', '.*')],
    'nature': [('leisure', 'park|nature_reserve')],
    'education': [('amenity', 'college|university|library'), ('shop', 'books|stationery'), ('tourism', 'hostel')],
    'health': [('amenity', 'hospital|clinic|pharmacy'), ('healthcare', 'laboratory|doctor'), ('leisure', 'fitness_centre')],
    'food': [('amenity', 'restaurant|cafe')],
    'hotels': [('tourism', 'hotel|guest_house')],
    'public': [('amenity', 'toilets|bench|drinking_water|bus_station'), ('public_transport', 'platform|station')],
    'accessibility': [('wheelchair', 'yes|limited'), ('highway', 'elevator'), ('ramp', 'yes')],
}
cache = {}
CACHE_TTL_SECONDS = 300
CACHE_MAX_ENTRIES = 100
MAX_ROUTE_SAMPLES = 12
ROUTE_SAMPLE_SPACING_M = 5000
PROVIDER_CONCURRENCY = 3
OVERPASS_DEFAULT_URL = 'https://overpass-api.de/api/interpreter'
OVERPASS_TIMEOUT_SECONDS = 8
DISCOVERY_BUDGET_SECONDS = 18
STALE_TTL_SECONDS = 1800
_inflight = {}
log = logging.getLogger(__name__)
OVERPASS_MAX_ATTEMPTS = 2
OVERPASS_HEADERS = {'User-Agent': 'Terrene/0.1 (OpenStreetMap POI discovery)', 'Accept': 'application/json'}
_provider_limit = asyncio.Semaphore(PROVIDER_CONCURRENCY)

def _deduplicate(places):
    unique = {}
    for place in places:
        if place.get('id'):
            unique.setdefault(place['id'], place)
    return list(unique.values())

def normalize(elements):
    places = []
    for item in elements:
        if not isinstance(item, dict) or not item.get('type') or item.get('id') is None:
            continue
        tags = item.get('tags', {})
        if not isinstance(tags, dict):
            tags = {}
        tags = {k: v for k, v in tags.items() if isinstance(k, str) and isinstance(v, str)}
        center = item.get('center', item)
        try:
            point = Point(latitude=center['lat'], longitude=center['lon'])
        except (ValueError, KeyError, TypeError):
            continue
        places.append({'id': f"osm-{item['type']}-{item['id']}", 'name': tags.get('name', 'Unnamed mapped place'), 'coordinates': point.model_dump(), 'metadata': tags, 'accessibility': {'yes': 'accessible', 'limited': 'limited', 'no': 'not_accessible'}.get(tags.get('wheelchair'), 'unknown')})
    return _deduplicate(places)

async def _overpass_json(query):
    endpoint = os.getenv('OVERPASS_API_URL', OVERPASS_DEFAULT_URL).strip() or OVERPASS_DEFAULT_URL
    async with httpx.AsyncClient(timeout=OVERPASS_TIMEOUT_SECONDS) as client:
        for attempt in range(OVERPASS_MAX_ATTEMPTS):
            try:
                response = await client.post(endpoint, data={'data': query}, headers=OVERPASS_HEADERS)
            except httpx.TimeoutException as error:
                if attempt + 1 < OVERPASS_MAX_ATTEMPTS:
                    await asyncio.sleep(0.2 * (attempt + 1))
                    continue
                raise HTTPException(504, 'Place discovery provider timed out; try a smaller area later.') from error
            except httpx.HTTPError as error:
                raise HTTPException(503, 'Place discovery provider is unavailable; try again later.') from error
            try:
                status_code = response.status_code
            except AttributeError as error:
                raise HTTPException(502, 'Place discovery provider returned an invalid response.') from error
            if status_code == 429:
                retry_after = getattr(response, 'headers', {}).get('Retry-After', '60')
                raise HTTPException(429, 'Place discovery provider rate limit reached; try again later.', headers={'Retry-After': retry_after})
            if status_code in {502, 503, 504}:
                if attempt + 1 < OVERPASS_MAX_ATTEMPTS:
                    await asyncio.sleep(0.2 * (attempt + 1))
                    continue
                if status_code == 429:
                    raise HTTPException(429, 'Place discovery provider rate limit reached; try again later.')
                raise HTTPException(503, 'Place discovery provider is unavailable; try again later.')
            if 400 <= status_code < 500:
                raise HTTPException(502, 'Place discovery provider rejected the request; try again later.')
            try:
                response.raise_for_status()
                return response.json()
            except (httpx.HTTPError, ValueError, TypeError, AttributeError) as error:
                raise HTTPException(502, 'Place discovery provider returned an invalid response.') from error
    raise HTTPException(503, 'Place discovery provider is unavailable; try again later.')

def _categories(categories):
    selected = sorted(set(categories.split(',')))
    if not selected or any(c not in CATEGORIES for c in selected):
        raise HTTPException(422, 'Choose supported place categories.')
    return selected


async def _lookup(points, categories, radius):
    selected = _categories(categories)
    endpoint = os.getenv('OVERPASS_API_URL', OVERPASS_DEFAULT_URL).strip() or OVERPASS_DEFAULT_URL
    key = (endpoint, tuple(sorted(set((p.latitude, p.longitude) for p in points))), tuple(selected), radius)
    now = time.monotonic()
    entry = cache.get(key)
    def cached(stale=False):
        return {**entry[1], 'cache': 'stale' if stale else 'fresh',
                'age_seconds': round(max(0, time.monotonic() - entry[0])),
                'warning': 'Provider unavailable; showing an earlier successful search.' if stale else None}
    if entry and now - entry[0] < CACHE_TTL_SECONDS:
        return cached()
    async def load():
        started = time.monotonic()
        operation = uuid.uuid4().hex
        try:
            clauses = [f'nwr["{tag}"~"^({values})$"](around:{radius},{lat},{lon});'
                       for lat, lon in key[1] for category in selected for tag, values in CATEGORIES[category]]
            query = '[out:json][timeout:7];(' + ''.join(clauses) + ');out center tags 150;'
            async def fetch():
                async with _provider_limit:
                    return await _overpass_json(query)
            data = await asyncio.wait_for(fetch(), timeout=DISCOVERY_BUDGET_SECONDS)
            if not isinstance(data, dict) or 'remark' in data or not isinstance(data.get('elements'), list):
                raise HTTPException(502, 'Place discovery provider returned an invalid response.')
            result = {'status': 'ok', 'results': normalize(data['elements']), 'attribution': '© OpenStreetMap contributors · Overpass', 'limit': 150}
            if len(cache) >= CACHE_MAX_ENTRIES:
                cache.pop(next(iter(cache)))
            cache[key] = (time.monotonic(), result)
            log.info('provider=overpass operation=discover id=%s duration=%.3f outcome=ok', operation, time.monotonic()-started)
            return {**result, 'cache': 'live', 'age_seconds': 0}
        except (HTTPException, TimeoutError) as error:
            log.warning('provider=overpass operation=discover id=%s duration=%.3f outcome=%s', operation, time.monotonic()-started, getattr(error, 'status_code', 'timeout'))
            if entry and time.monotonic() - entry[0] <= STALE_TTL_SECONDS:
                return cached(True)
            if isinstance(error, TimeoutError):
                raise HTTPException(504, 'Place discovery timed out; please retry.') from error
            raise
    task = _inflight.get(key)
    if task is None:
        task = asyncio.create_task(load())
        _inflight[key] = task
        def finished(done):
            _inflight.pop(key, None)
            if not done.cancelled():
                done.exception()  # Consume failure even when every HTTP caller cancelled.
        task.add_done_callback(finished)
    return await asyncio.shield(task)


@router.get('/nearby')
async def nearby(latitude: float = Query(ge=-90, le=90, allow_inf_nan=False), longitude: float = Query(ge=-180, le=180, allow_inf_nan=False), categories: str = 'tourism', radius: int = Query(default=1500, ge=100, le=5000)):
    return await _lookup([Point(latitude=latitude, longitude=longitude)], categories, radius)

class Corridor(BaseModel):
    points: list[Point] = Field(min_length=2, max_length=100000)
    categories: str = 'tourism'
    radius: int = Field(default=500, ge=100, le=1000)

def _distance(a: Point, b: Point):
    lat1, lat2 = math.radians(a.latitude), math.radians(b.latitude)
    dlat = lat2 - lat1
    dlon = math.radians(b.longitude - a.longitude)
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(value)))

def _sample_route(points):
    import bisect
    cumulative = [0.0]
    for start, end in zip(points, points[1:]):
        cumulative.append(cumulative[-1] + _distance(start, end))
    total = cumulative[-1]
    if total == 0:
        return [points[0]]
    count = min(MAX_ROUTE_SAMPLES, max(2, math.ceil(total / ROUTE_SAMPLE_SPACING_M) + 1))
    samples = []
    for i in range(count):
        target = total * i / (count - 1)
        j = min(bisect.bisect_right(cumulative, target), len(points) - 1)
        start, end = points[j-1], points[j]
        span = cumulative[j] - cumulative[j-1]
        fraction = (target - cumulative[j-1]) / span if span else 0
        samples.append(Point(latitude=start.latitude + (end.latitude-start.latitude)*fraction,
                             longitude=(start.longitude + ((end.longitude-start.longitude+180)%360-180)*fraction+180)%360-180))
    samples[0], samples[-1] = points[0], points[-1]
    return samples

@router.post('/along-route')
async def along_route(body: Corridor):
    if any(category not in CATEGORIES for category in body.categories.split(',')):
        raise HTTPException(422, 'Choose supported place categories.')
    async def sample(points):
        try:
            return await _lookup(points, body.categories, body.radius)
        except HTTPException:
            return None
    points = _sample_route(body.points)
    # Four circles per union query: at most three concurrent requests, not twelve.
    groups = [points[i:i+4] for i in range(0, len(points), 4)]
    responses = await asyncio.gather(*(sample(group) for group in groups))
    places = []
    for response in responses:
        if response is not None:
            places.extend(response['results'])
    successful = sum(len(group) for group, response in zip(groups, responses) if response is not None)
    failed = len(points) - successful
    if not successful:
        raise HTTPException(503, 'Place discovery is unavailable: every route sample failed. Try again later.')
    stale = [response for response in responses if response and response.get('cache') == 'stale']
    return {'status': 'partial' if failed else 'ok', 'successful_samples': successful, 'failed_samples': failed,
            'results': _deduplicate(places), 'attribution': '© OpenStreetMap contributors · Overpass',
            'cache': 'stale' if stale else 'fresh' if all(r and r.get('cache') == 'fresh' for r in responses) else 'live',
            'age_seconds': max((r.get('age_seconds', 0) for r in responses if r), default=0),
            'coverage': f'Sampled {len(points)} route points, capped at {MAX_ROUTE_SAMPLES}; gaps can exceed 5 km on long routes. not an exhaustive corridor search. Up to 150 matches per batch.',
            'warning': ' '.join(filter(None, [f'{failed} route samples failed; results cover only successful samples.' if failed else None,
                                             'Provider unavailable; some results are from an earlier successful search.' if stale else None])) or None}
