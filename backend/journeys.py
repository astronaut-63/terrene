import math
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime
from backend.routing import RouteRequest, Point, route

router = APIRouter(prefix='/api/v1')
VARIABLES = 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code'

@router.get('/weather/point')
async def weather(latitude: float, longitude: float, timestamp: AwareDatetime):
    point = Point(latitude=latitude, longitude=longitude)
    stamp = timestamp.astimezone(timezone.utc)
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
        index = data['hourly']['time'].index(stamp.strftime('%Y-%m-%dT%H:00'))
        values = {key: data['hourly'].get(key, [None] * (index + 1))[index] for key in VARIABLES.split(',')}
        present = sum(value is not None for value in values.values())
        return {'status': 'available' if present == len(values) else 'partially_available' if present else 'unavailable', 'kind': 'forecast', 'values': values, 'units': data.get('hourly_units', {}), 'timestamp': stamp.isoformat(), 'source': 'Open-Meteo', 'retrieved_at': datetime.now(timezone.utc).isoformat()}
    except (httpx.HTTPError, KeyError, ValueError, IndexError, TypeError):
        return {'status': 'unavailable', 'source': 'Open-Meteo'}

class JourneyRequest(RouteRequest):
    departure: AwareDatetime

def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    x = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(x)))

def checkpoints(geometry, duration, departure):
    coords = geometry['coordinates']
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
    points = checkpoints(routing['geometry'], routing['duration_seconds'], body.departure)
    for point in points:
        point['weather'] = await weather(**point['coordinates'], timestamp=datetime.fromisoformat(point['arrival']))
    return {'route': routing, 'checkpoints': points, 'limitations': 'Arrival estimates assume constant progress by distance; no traffic or stop durations included.'}
