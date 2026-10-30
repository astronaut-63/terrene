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

def normalize(elements):
    places = []
    for item in elements:
        tags = item.get('tags', {})
        center = item.get('center', item)
        try:
            point = Point(latitude=center['lat'], longitude=center['lon'])
        except (ValueError, KeyError, TypeError):
            continue
        places.append({'id': f"osm-{item['type']}-{item['id']}", 'name': tags.get('name', 'Unnamed mapped place'), 'coordinates': point.model_dump(), 'metadata': tags, 'accessibility': {'yes': 'accessible', 'limited': 'limited', 'no': 'not_accessible'}.get(tags.get('wheelchair'), 'unknown')})
    return places

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
        async with httpx.AsyncClient(timeout=25) as client:
            response = await client.post('https://overpass-api.de/api/interpreter', data={'data': query})
        response.raise_for_status()
        data = response.json()
        if 'remark' in data or not isinstance(data.get('elements'), list):
            raise ValueError('Incomplete provider response')
        result = {'results': normalize(data['elements']), 'attribution': '© OpenStreetMap contributors', 'limit': 150}
    except (httpx.HTTPError, ValueError, TypeError):
        raise HTTPException(502, 'Place discovery provider is unavailable; try a smaller area later.')
    if len(cache) >= 100:
        cache.pop(next(iter(cache)))
    cache[key] = (time.monotonic() + 300, result)
    return result

class Corridor(BaseModel):
    points: list[Point] = Field(min_length=2, max_length=5)
    categories: str = 'tourism'
    radius: int = Field(default=500, ge=100, le=1000)

@router.post('/along-route')
async def along_route(body: Corridor):
    results = {}
    for point in body.points:
        data = await nearby(point.latitude, point.longitude, body.categories, body.radius)
        results.update({place['id']: place for place in data['results']})
    return {'results': list(results.values()), 'attribution': '© OpenStreetMap contributors', 'coverage': 'Sampled route points; not an exhaustive corridor search.'}
