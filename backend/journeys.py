import asyncio
import copy
import math
import time
from collections import OrderedDict
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime
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

def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    x = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(x)))

def checkpoints(geometry, duration, departure):
    coords = geometry['coordinates']
    if geometry.get('type') != 'LineString' or not isinstance(coords, list) or len(coords) < 2:
        raise ValueError('Route geometry must be a LineString with at least two coordinates')
    if any(not isinstance(coord, (list, tuple)) or len(coord) < 2 for coord in coords):
        raise ValueError('Route geometry contains invalid coordinates')
    cumulative = [0.0]
    for a, b in zip(coords, coords[1:]):
        cumulative.append(cumulative[-1] + distance(a, b))
    result = []
    for i in range(5):
        progress = i / 4
        target = cumulative[-1] * progress
        j = next((j for j in range(1, len(coords)) if cumulative[j] >= target), len(coords)-1)
        span = cumulative[j] - cumulative[j-1]
        fraction = (target-cumulative[j-1])/span if span else 0
        lon, lat = [coords[j-1][axis] + fraction*(coords[j][axis]-coords[j-1][axis]) for axis in [0, 1]]
        result.append({'coordinates': {'latitude': lat, 'longitude': lon}, 'progress': progress, 'distance_m': target, 'arrival': (departure + timedelta(seconds=duration*progress)).isoformat()})
    return result

@router.post('/journeys/simulate')
async def simulate(body: JourneyRequest):
    routing = await route(body)
    try:
        points = checkpoints(routing['geometry'], routing['duration_seconds'], body.departure)
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
    return {'route': routing, 'checkpoints': points, 'limitations': 'Arrival estimates assume constant progress by distance; no traffic or stop durations included.'}
