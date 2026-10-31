import os
import math
from typing import Literal
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix='/api/v1')

class Point(BaseModel):
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)

class RouteRequest(BaseModel):
    origin: Point
    destination: Point
    stops: list[Point] = Field(default_factory=list, max_length=8)
    mode: Literal['driving', 'walking', 'cycling', 'wheelchair', 'transit'] = 'driving'
    maximum_incline: float = Field(default=6, ge=0, le=15)
    itinerary: dict | None = None

PROFILES = {'driving': 'driving-car', 'walking': 'foot-walking', 'cycling': 'cycling-regular', 'wheelchair': 'wheelchair'}
DEFAULT_HEIGIT_BASE_URL = 'https://api.heigit.org/openrouteservice'

def provider_url(base_url: str | None, profile: str) -> str:
    """Build the directions URL while accepting a host or service-root override."""
    base = (base_url or DEFAULT_HEIGIT_BASE_URL).strip().rstrip('/')
    if base.lower().endswith('/v2'):
        base = base[:-3].rstrip('/')
    return f'{base}/v2/directions/{profile}/geojson'

def routing_configuration() -> dict[str, bool]:
    return {'configured': bool(os.getenv('HEIGIT_API_KEY', '').strip())}

def provider_body(request):
    body = {'coordinates': [[p.longitude, p.latitude] for p in [request.origin, *request.stops, request.destination]]}
    if request.mode == 'wheelchair':
        body['options'] = {'avoid_features': ['steps'], 'profile_params': {'restrictions': {'maximum_incline': request.maximum_incline}}}
    return body

def normalize_geometry(geometry):
    if not isinstance(geometry, dict) or geometry.get('type') != 'LineString' or not isinstance(geometry.get('coordinates'), list) or len(geometry['coordinates']) < 2:
        raise ValueError('Invalid route geometry')
    coordinates = []
    for coordinate in geometry['coordinates']:
        if isinstance(coordinate, str):
            parts = coordinate.split()
            if len(parts) != 2:
                raise ValueError('Invalid route coordinate')
            coordinate = parts
        if not isinstance(coordinate, (list, tuple)) or len(coordinate) < 2:
            raise ValueError('Invalid route coordinate')
        longitude, latitude = float(coordinate[0]), float(coordinate[1])
        if not math.isfinite(longitude) or not math.isfinite(latitude) or not -180 <= longitude <= 180 or not -90 <= latitude <= 90:
            raise ValueError('Invalid route coordinate')
        coordinates.append([longitude, latitude])
    return {'type': 'LineString', 'coordinates': coordinates}

@router.post('/routes')
async def route(request: RouteRequest):
    if request.mode == 'transit':
        raise HTTPException(503, 'Transit routing is unavailable: no timetable provider is configured for this deployment.')
    key = os.getenv('HEIGIT_API_KEY', '').strip()
    if not key:
        raise HTTPException(503, 'Routing is not configured. Set HEIGIT_API_KEY in the backend environment.')
    url = provider_url(os.getenv('HEIGIT_BASE_URL'), PROFILES[request.mode])
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(url, json=provider_body(request), headers={'Authorization': key})
        if response.status_code == 429:
            raise HTTPException(429, 'Routing provider rate limit reached.')
        if response.status_code in (401, 403):
            raise HTTPException(502, 'Routing provider authentication failed. Check HEIGIT_API_KEY.')
        response.raise_for_status()
        data = response.json()
        feature = data['features'][0]
        summary = feature['properties']['summary']
        geometry = normalize_geometry(feature['geometry'])
        distance, duration = float(summary['distance']), float(summary['duration'])
        if isinstance(summary['distance'], bool) or isinstance(summary['duration'], bool) or not math.isfinite(distance) or not math.isfinite(duration) or distance < 0 or duration < 0:
            raise ValueError('Invalid route summary')
        return {'geometry': geometry, 'distance_m': distance, 'distance_km': distance / 1000, 'duration_seconds': duration, 'bbox': data.get('bbox'), 'instructions': feature['properties'].get('segments', []), 'attribution': 'openrouteservice by HeiGIT | © OpenStreetMap contributors', 'accessibility': 'unknown' if request.mode == 'wheelchair' else 'not_assessed', 'limitations': 'Estimated duration is not traffic-aware. Accessibility depends on mapped data and is not guaranteed.'}
    except httpx.TimeoutException:
        raise HTTPException(504, 'Routing provider timed out.')
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        raise HTTPException(502, 'No usable route returned by the routing provider.')
