import asyncio
import copy
import math
import time
from collections import OrderedDict
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, BaseModel, Field, ConfigDict, model_validator
from typing import Literal
from backend.routing import RouteRequest, Point, route

router = APIRouter(prefix='/api/v1')
VARIABLES = 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code'
WEATHER_CACHE_TTL_SECONDS = 300
WEATHER_CACHE_MAX_ENTRIES = 256
WEATHER_CONCURRENCY = 5
_weather_cache: OrderedDict[tuple[float, float, str], tuple[float, dict]] = OrderedDict()
_weather_limit = asyncio.Semaphore(WEATHER_CONCURRENCY)

def clear_weather_cache():
    _weather_cache.clear()

def _weather_cache_key(latitude: float, longitude: float, stamp: datetime):
    return (round(latitude, 5), round(longitude, 5), stamp.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:00Z'))

def _cached_weather(key):
    cached = _weather_cache.get(key)
    if not cached:
        return None
    created, value = cached
    if time.monotonic() - created >= WEATHER_CACHE_TTL_SECONDS:
        _weather_cache.pop(key, None)
        return None
    _weather_cache.move_to_end(key)
    return copy.deepcopy(value)

def _store_weather(key, value):
    if value.get('status') not in {'available', 'partially_available'}:
        return
    _weather_cache[key] = (time.monotonic(), copy.deepcopy(value))
    _weather_cache.move_to_end(key)
    while len(_weather_cache) > WEATHER_CACHE_MAX_ENTRIES:
        _weather_cache.popitem(last=False)

@router.get('/weather/point')
async def weather(latitude: float, longitude: float, timestamp: AwareDatetime):
    point = Point(latitude=latitude, longitude=longitude)
    stamp = timestamp.astimezone(timezone.utc)
    cache_key = _weather_cache_key(point.latitude, point.longitude, stamp)
    cached = _cached_weather(cache_key)
    if cached is not None:
        return cached
    days = (stamp.date() - datetime.now(timezone.utc).date()).days
    if days > 15:
        return {'status': 'beyond_forecast_horizon', 'source': 'Open-Meteo'}
    if days < 0:
        return {'status': 'unavailable', 'reason': 'Historical weather is not configured.', 'source': 'Open-Meteo'}
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get('https://api.open-meteo.com/v1/forecast', params={'latitude': point.latitude, 'longitude': point.longitude, 'hourly': VARIABLES, 'forecast_days': 16, 'timezone': 'GMT'})
        r.raise_for_status()
        data = r.json()
        hourly = data.get('hourly')
        times = hourly.get('time') if isinstance(hourly, dict) else None
        if not isinstance(times, list):
            raise ValueError('Malformed hourly weather data')
        index = times.index(stamp.strftime('%Y-%m-%dT%H:00'))
        values = {}
        for key in VARIABLES.split(','):
            series = hourly.get(key)
            values[key] = series[index] if isinstance(series, list) and index < len(series) else None
        present = sum(value is not None for value in values.values())
        result = {'status': 'available' if present == len(values) else 'partially_available' if present else 'unavailable', 'kind': 'forecast', 'values': values, 'units': data.get('hourly_units', {}), 'timestamp': stamp.isoformat(), 'source': 'Open-Meteo', 'retrieved_at': datetime.now(timezone.utc).isoformat()}
        _store_weather(cache_key, result)
        return result
    except (httpx.HTTPError, AttributeError, KeyError, ValueError, IndexError, TypeError):
        return {'status': 'unavailable', 'source': 'Open-Meteo'}

class JourneyRequest(RouteRequest):
    departure: AwareDatetime
    checkpoint_count: int | None = Field(default=None, ge=2, le=25, strict=True)
    checkpoint_spacing_m: float | None = Field(default=None, ge=100, le=1_000_000, allow_inf_nan=False)

    @model_validator(mode='after')
    def checkpoint_options(self):
        if self.checkpoint_count is not None and self.checkpoint_spacing_m is not None:
            raise ValueError('Choose checkpoint_count or checkpoint_spacing_m, not both.')
        return self

def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    x = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(x)))

def checkpoints(geometry, duration, departure, count=5, spacing=None):
    coords = geometry['coordinates']
    if geometry.get('type') != 'LineString' or not isinstance(coords, list) or len(coords) < 2:
        raise ValueError('Route geometry must be a LineString with at least two coordinates')
    if any(not isinstance(coord, (list, tuple)) or len(coord) < 2 for coord in coords):
        raise ValueError('Route geometry contains invalid coordinates')
    if departure.tzinfo is None or departure.utcoffset() is None:
        raise ValueError('Departure requires a timezone')
    if not math.isfinite(duration) or duration < 0 or duration > 2_592_000:
        raise ValueError('Invalid route duration')
    cumulative = [0.0]
    for a, b in zip(coords, coords[1:]):
        cumulative.append(cumulative[-1] + distance(a, b))
    total = cumulative[-1]
    if total == 0:
        if spacing is not None:
            targets = [0.0]
        else:
            if not 2 <= count <= 25:
                raise ValueError('Checkpoint count must be between 2 and 25')
            targets = [0.0] * count
    elif spacing is not None:
        if not math.isfinite(spacing) or not 100 <= spacing <= 1_000_000:
            raise ValueError('Checkpoint spacing must be between 100 and 1,000,000 metres')
        number = math.ceil(total / spacing) + 1
        if number > 25:
            raise ValueError('Checkpoint spacing would exceed 25 checkpoints')
        targets = [i * spacing for i in range(number - 1)] + [total]
    else:
        if not 2 <= count <= 25:
            raise ValueError('Checkpoint count must be between 2 and 25')
        count = min(count, max(2, int(total) + 1))
        targets = [total * i / (count - 1) for i in range(count)]
    result = []
    for i, target in enumerate(targets):
        progress = target / total if total else 0.0
        j = next((j for j in range(1, len(coords)) if cumulative[j] >= target), len(coords)-1)
        span = cumulative[j] - cumulative[j-1]
        fraction = (target-cumulative[j-1])/span if span else 0
        if target == total:
            lon, lat = coords[-1][0], coords[-1][1]
        else:
            lon, lat = [coords[j-1][axis] + fraction*(coords[j][axis]-coords[j-1][axis]) for axis in [0, 1]]
        result.append({'index': i, 'coordinates': {'latitude': lat, 'longitude': lon}, 'progress': progress,
                       'distance_m': target, 'elapsed_seconds': duration * progress,
                       'arrival': (departure + timedelta(seconds=duration*progress)).isoformat()})
    return result


class WeatherResult(BaseModel):
    model_config = ConfigDict(extra='allow')
    status: str
    values: dict[str, float | int | None] = Field(default_factory=dict)
    reason: str | None = None
    timestamp: AwareDatetime | None = None
    forecast_timestamp: AwareDatetime | None = None


class Checkpoint(BaseModel):
    index: int
    coordinates: Point
    progress: float
    distance_m: float
    elapsed_seconds: float
    arrival: AwareDatetime
    weather: WeatherResult


class RouteGeometry(BaseModel):
    type: Literal['LineString']
    coordinates: list[list[float]] = Field(min_length=2)


class RouteData(BaseModel):
    geometry: RouteGeometry
    distance_m: float
    duration_seconds: float
    distance_km: float | None = None
    bbox: list[float] | None = None
    instructions: list = Field(default_factory=list)
    attribution: str | None = None
    accessibility: str | None = None
    limitations: str | None = None


class JourneyResponse(BaseModel):
    route: RouteData
    checkpoints: list[Checkpoint]
    limitations: str
    arrival: AwareDatetime | None = None
    departure: AwareDatetime | None = None
    duration_seconds: float | None = None
    timing_method: str = 'duration_proportional_to_geometry_distance'

@router.post('/journeys/simulate', response_model=JourneyResponse)
async def simulate(body: JourneyRequest):
    routing = await route(body)
    try:
        points = checkpoints(routing['geometry'], routing['duration_seconds'], body.departure,
                             body.checkpoint_count or 5, body.checkpoint_spacing_m)
    except (KeyError, TypeError, ValueError, ZeroDivisionError) as exc:
        raise HTTPException(502, 'Routing provider returned invalid route geometry.') from exc

    async def checkpoint_weather(point):
        try:
            async with _weather_limit:
                return await weather(**point['coordinates'], timestamp=datetime.fromisoformat(point['arrival']))
        except Exception:
            return {'status': 'unavailable', 'source': 'Open-Meteo'}

    weather_results = await asyncio.gather(*(checkpoint_weather(point) for point in points))
    for point, forecast in zip(points, weather_results):
        point['weather'] = forecast
    return {'route': routing, 'checkpoints': points,
            'departure': body.departure.isoformat(),
            'arrival': points[-1]['arrival'],
            'duration_seconds': routing['duration_seconds'],
            'limitations': 'Arrival estimates assume constant progress by distance; no traffic or stop durations included.',
            'timing_method': 'duration_proportional_to_geometry_distance'}
