import asyncio
import math
import os
import time
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
OVERPASS_TIMEOUT_SECONDS = 25
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
            if status_code in {429, 502, 503, 504}:
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

@router.get('/nearby')
async def nearby(latitude: float = Query(ge=-90, le=90), longitude: float = Query(ge=-180, le=180), categories: str = 'tourism', radius: int = Query(default=1500, ge=100, le=5000)):
    selected = sorted(set(categories.split(',')))
    if not selected or any(c not in CATEGORIES for c in selected):
        raise HTTPException(422, 'Choose supported place categories.')
    key = (latitude, longitude, tuple(selected), radius)
    if key in cache and cache[key][0] > time.monotonic():
        return cache[key][1]
    clauses = [f'nwr["{tag}"~"^({values})$"](around:{radius},{latitude},{longitude});' for category in selected for tag, values in CATEGORIES[category]]
    query = '[out:json][timeout:20];(' + ''.join(clauses) + ');out center tags 150;'
    try:
        data = await _overpass_json(query)
        if 'remark' in data or not isinstance(data.get('elements'), list):
            raise ValueError('Incomplete provider response')
        result = {'results': normalize(data['elements']), 'attribution': '© OpenStreetMap contributors', 'limit': 150}
    except HTTPException:
        raise
    except (AttributeError, ValueError, TypeError):
        raise HTTPException(502, 'Place discovery provider returned an invalid response.')
    if len(cache) >= CACHE_MAX_ENTRIES:
        cache.pop(next(iter(cache)))
    cache[key] = (time.monotonic() + 300, result)
    return result

class Corridor(BaseModel):
    points: list[Point] = Field(min_length=2, max_length=5)
    categories: str = 'tourism'
    radius: int = Field(default=500, ge=100, le=1000)

def _distance(a: Point, b: Point):
    lat1, lat2 = math.radians(a.latitude), math.radians(b.latitude)
    dlat = lat2 - lat1
    dlon = math.radians(b.longitude - a.longitude)
    value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(value)))

def _sample_route(points):
    samples = [points[0]]
    for start, end in zip(points, points[1:]):
        steps = max(1, math.ceil(_distance(start, end) / ROUTE_SAMPLE_SPACING_M))
        for step in range(1, steps + 1):
            fraction = step / steps
            samples.append(Point(latitude=start.latitude + (end.latitude - start.latitude) * fraction, longitude=start.longitude + (end.longitude - start.longitude) * fraction))
    if len(samples) <= MAX_ROUTE_SAMPLES:
        return samples
    indexes = [round(index * (len(samples) - 1) / (MAX_ROUTE_SAMPLES - 1)) for index in range(MAX_ROUTE_SAMPLES)]
    return [samples[index] for index in indexes]

@router.post('/along-route')
async def along_route(body: Corridor):
    if any(category not in CATEGORIES for category in body.categories.split(',')):
        raise HTTPException(422, 'Choose supported place categories.')
    async def sample(point):
        try:
            async with _provider_limit:
                return await nearby(point.latitude, point.longitude, body.categories, body.radius)
        except Exception:
            return None

    responses = await asyncio.gather(*[sample(point) for point in _sample_route(body.points)])
    places = []
    for response in responses:
        if isinstance(response, dict) and isinstance(response.get('results'), list):
            places.extend(response['results'])
    samples = len(responses)
    successful = sum(isinstance(response, dict) and isinstance(response.get('results'), list) for response in responses)
    failed = samples - successful
    if not successful:
        raise HTTPException(503, 'Place discovery is unavailable: every route sample failed. Try again later.')
    return {'status': 'partial' if failed else 'ok', 'successful_samples': successful, 'failed_samples': failed, 'results': _deduplicate(places), 'attribution': '© OpenStreetMap contributors', 'coverage': f'Sampled {samples} route points at up to {ROUTE_SAMPLE_SPACING_M // 1000} km spacing, capped at {MAX_ROUTE_SAMPLES}; not an exhaustive corridor search.', 'warning': f'{failed} route samples failed; results cover only successful samples.' if failed else None}
