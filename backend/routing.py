import os
from typing import Literal
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

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

PROFILES = {'driving': 'driving-car', 'walking': 'foot-walking', 'cycling': 'cycling-regular', 'wheelchair': 'wheelchair'}

class RouteGeometry(BaseModel):
    type: Literal['LineString'] = 'LineString'
    coordinates: list[tuple[float, float]] = Field(min_length=2, max_length=100000)

    @field_validator('coordinates')
    @classmethod
    def valid_coordinates(cls, coordinates):
        for lon, lat in coordinates:
            Point(latitude=lat, longitude=lon)
        return coordinates


class RouteData(BaseModel):
    """Reusable route object; never infer duration from an invented speed."""
    geometry: RouteGeometry
    distance_m: float = Field(ge=0, le=40000000, allow_inf_nan=False)
    duration_seconds: float = Field(ge=0, le=2592000, allow_inf_nan=False)
    distance_km: float = 0
    bbox: list[float] | None = None
    instructions: list = Field(default_factory=list)
    attribution: str = 'openrouteservice | © OpenStreetMap contributors'
    accessibility: str = 'not_assessed'
    limitations: str = 'Estimated duration is not traffic-aware. Accessibility is not guaranteed.'

    @model_validator(mode='after')
    def usable_duration(self):
        moving = any(p != self.geometry.coordinates[0] for p in self.geometry.coordinates[1:])
        if moving and (self.duration_seconds <= 0 or self.distance_m <= 0):
            raise ValueError('A moving route needs positive distance and duration.')
        if not moving and (self.duration_seconds != 0 or self.distance_m != 0):
            raise ValueError('A zero-length route needs zero distance and duration.')
        self.distance_km = self.distance_m / 1000
        return self

def provider_body(request):
    body = {'coordinates': [[p.longitude, p.latitude] for p in [request.origin, *request.stops, request.destination]]}
    if request.mode == 'wheelchair':
        body['options'] = {'avoid_features': ['steps'], 'profile_params': {'restrictions': {'maximum_incline': request.maximum_incline}}}
    return body

@router.post('/routes')
async def route(request: RouteRequest):
    if request.mode == 'transit':
        raise HTTPException(503, 'Transit routing is unavailable: no timetable provider is configured for this deployment.')
    key = os.getenv('HEIGIT_API_KEY')
    if not key:
        raise HTTPException(503, 'Routing is not configured. Set HEIGIT_API_KEY on the backend.')
    base = os.getenv('HEIGIT_BASE_URL', 'https://api.openrouteservice.org').rstrip('/')
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(f'{base}/v2/directions/{PROFILES[request.mode]}/geojson', json=provider_body(request), headers={'Authorization': key})
        if response.status_code == 429:
            raise HTTPException(429, 'Routing provider rate limit reached.')
        response.raise_for_status()
        data = response.json()
        feature = data['features'][0]
        summary = feature['properties']['summary']
        geometry = feature['geometry']
        if geometry['type'] != 'LineString' or len(geometry['coordinates']) < 2:
            raise ValueError('Invalid route')
        return RouteData(geometry=geometry, distance_m=summary['distance'], duration_seconds=summary['duration'], bbox=data.get('bbox'), instructions=feature['properties'].get('segments', []), accessibility='unknown' if request.mode == 'wheelchair' else 'not_assessed').model_dump(mode='json')
    except httpx.TimeoutException:
        raise HTTPException(504, 'Routing provider timed out.')
    except (httpx.HTTPError, KeyError, IndexError, ValueError, TypeError):
        raise HTTPException(502, 'No usable route returned by the routing provider.')
