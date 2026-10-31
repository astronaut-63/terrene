"""Distance-sampled journeys and the shared Open-Meteo forecast adapter."""
import asyncio
import bisect
import math
import time
from collections import OrderedDict
from datetime import datetime, timezone, timedelta
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import AwareDatetime, BaseModel, Field, model_validator, field_validator
from backend.routing import RouteRequest, RouteData, RouteGeometry, Point, route

router = APIRouter(prefix='/api/v1')
VARIABLES = 'temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code'
UNITS = dict(zip(VARIABLES.split(','), ['°C', '°C', 'mm', '%', 'km/h', '°', '%', 'wmo code']))
LIMITATIONS = ('Arrival estimates distribute total duration by geometry distance; no traffic, closures or stop durations included. '
               'Weather is an hourly forecast, not guaranteed conditions. Supplied routes are not independently verified as traversable.')


def utcnow():
    return datetime.now(timezone.utc)


class WeatherResult(BaseModel):
    status: Literal['available', 'partially_available', 'beyond_forecast_horizon', 'historical_data_unavailable', 'provider_error', 'no_data']
    reason: str | None = None
    source: str = 'Open-Meteo'
    kind: str = 'forecast'
    values: dict[str, float | None] = Field(default_factory=lambda: dict.fromkeys(VARIABLES.split(',')))
    units: dict[str, str] = Field(default_factory=lambda: UNITS.copy())
    timestamp: AwareDatetime
    forecast_timestamp: AwareDatetime | None = None
    retrieved_at: AwareDatetime | None = None


class WeatherService:
    """App-scoped pool, three concurrent batches, bounded ten-minute LRU cache.

    Exact coordinates and UTC day identify cached hourly products. Failures and
    all-null products are never cached. No retries or historical extrapolation.
    """
    def __init__(self, client):
        self.client = client
        self.slots = asyncio.Semaphore(3)
        self.cache = OrderedDict()

    @staticmethod
    def parse(data):
        if not isinstance(data, dict) or not isinstance(data.get('hourly'), dict):
            raise ValueError('Missing hourly data')
        hourly = data['hourly']
        times = hourly.get('time')
        if not isinstance(times, list) or not times or len(times) > 400:
            raise ValueError('Invalid hourly timestamps')
        parsed = []
        for value in times:
            stamp = datetime.fromisoformat(value)
            if stamp.tzinfo is not None or stamp.minute or stamp.second or stamp.microsecond:
                raise ValueError('Expected provider GMT whole-hour timestamps')
            parsed.append(stamp.replace(tzinfo=timezone.utc))
        if parsed != sorted(set(parsed)):
            raise ValueError('Unordered hourly timestamps')
        rows = {}
        for i, stamp in enumerate(parsed):
            values = {}
            for name in VARIABLES.split(','):
                column = hourly.get(name)
                value = column[i] if isinstance(column, list) and i < len(column) else None
                values[name] = value if type(value) in (int, float) and math.isfinite(value) else None
            rows[stamp] = values
        return rows

    async def forecasts(self, points):
        now = utcnow()
        results = [None] * len(points)
        pending = {}
        products = {}
        for i, (point, stamp) in enumerate(points):
            stamp = stamp.astimezone(timezone.utc)
            days = (stamp.date() - now.date()).days
            if days < 0:
                results[i] = WeatherResult(status='historical_data_unavailable', reason='Historical weather is not configured.', timestamp=stamp)
            elif days > 15:
                results[i] = WeatherResult(status='beyond_forecast_horizon', reason='Outside the requested 16-day UTC forecast window.', timestamp=stamp)
            else:
                key = (point.latitude, point.longitude, now.date())
                entry = self.cache.get(key)
                if entry and entry[0] > time.monotonic():
                    self.cache.move_to_end(key)
                    products[key] = entry[1:]
                else:
                    self.cache.pop(key, None)
                    pending[key] = point
        # A single multi-location request consolidates all misses (at most 25).
        if pending:
            keys = list(pending)
            async with self.slots:
                try:
                    response = await self.client.get('https://api.open-meteo.com/v1/forecast', params={
                        'latitude': ','.join(str(pending[k].latitude) for k in keys),
                        'longitude': ','.join(str(pending[k].longitude) for k in keys),
                        'hourly': VARIABLES, 'forecast_days': 16, 'timezone': 'GMT',
                        'temperature_unit': 'celsius', 'wind_speed_unit': 'kmh', 'precipitation_unit': 'mm'})
                    response.raise_for_status()
                    data = response.json()
                    items = data if isinstance(data, list) else [data]
                    if len(items) != len(keys):
                        raise ValueError('Mismatched location count')
                    retrieved = utcnow()
                    for key, item in zip(keys, items):
                        try:
                            rows = self.parse(item)
                            products[key] = (rows, retrieved)
                            if any(v is not None for row in rows.values() for v in row.values()):
                                self.cache[key] = (time.monotonic() + 600, rows, retrieved)
                                while len(self.cache) > 128:
                                    self.cache.popitem(last=False)
                        except (ValueError, TypeError, OverflowError):
                            pass  # Only this location failed schema validation.
                except (httpx.HTTPError, ValueError, TypeError):
                    pass  # A valid route survives a provider outage.
        for i, (point, stamp) in enumerate(points):
            if results[i] is not None:
                continue
            stamp = stamp.astimezone(timezone.utc)
            product = products.get((point.latitude, point.longitude, now.date()))
            if product is None:
                results[i] = WeatherResult(status='provider_error', reason='Forecast provider failed or returned malformed data.', timestamp=stamp)
                continue
            rows, retrieved = product
            hour = stamp.replace(minute=0, second=0, microsecond=0)
            if hour not in rows:
                outside = hour < min(rows) or hour > max(rows)
                results[i] = WeatherResult(status='beyond_forecast_horizon' if outside else 'no_data', reason='Requested hour is not in the returned forecast.', timestamp=stamp, retrieved_at=retrieved)
                continue
            values = rows[hour]
            present = sum(v is not None for v in values.values())
            results[i] = WeatherResult(status='available' if present == len(values) else 'partially_available' if present else 'no_data',
                reason=None if present == len(values) else 'Some or all requested measurements are missing.',
                timestamp=stamp, forecast_timestamp=hour, retrieved_at=retrieved, values=values)
        return results


def weather_service(request: Request):
    return request.app.state.weather_service


@router.get('/weather/point', response_model=WeatherResult)
async def weather(timestamp: AwareDatetime, latitude: float = Query(ge=-90, le=90, allow_inf_nan=False),
                  longitude: float = Query(ge=-180, le=180, allow_inf_nan=False), service: WeatherService = Depends(weather_service)):
    try:
        timestamp = timestamp.astimezone(timezone.utc)
    except (ValueError, OverflowError):
        raise HTTPException(422, 'Timestamp cannot be represented in UTC.')
    return (await service.forecasts([(Point(latitude=latitude, longitude=longitude), timestamp)]))[0]


class JourneyRequest(RouteRequest):
    departure: AwareDatetime
    route: RouteData | None = None
    checkpoint_count: int | None = Field(default=None, ge=2, le=25, strict=True)
    checkpoint_spacing_m: float | None = Field(default=None, ge=100, le=1000000, allow_inf_nan=False)

    @field_validator('departure')
    @classmethod
    def utc_departure(cls, stamp):
        try:
            return stamp.astimezone(timezone.utc)
        except (ValueError, OverflowError):
            raise ValueError('Departure cannot be represented in UTC.')

    @model_validator(mode='after')
    def options(self):
        if self.checkpoint_count is not None and self.checkpoint_spacing_m is not None:
            raise ValueError('Choose checkpoint_count or checkpoint_spacing_m, not both.')
        if self.route:
            coords = self.route.geometry.coordinates
            for point, coord in [(self.origin, coords[0]), (self.destination, coords[-1])]:
                if distance((point.longitude, point.latitude), coord) > 1000:
                    raise ValueError('Supplied route endpoints must be within 1 km of requested endpoints.')
            if self.stops:
                raise ValueError('Stops are already represented by a supplied route; omit stops when reusing it.')
        return self


def distance(a, b):
    lat1, lat2 = math.radians(a[1]), math.radians(b[1])
    x = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(math.radians(b[0]-a[0])/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(max(0, x))))


def interpolate(a, b, fraction):
    """Spherical interpolation follows the short geodesic, including dateline crossings."""
    if fraction <= 0:
        return a
    if fraction >= 1:
        return b
    def vector(p):
        lon, lat = map(math.radians, p)
        return (math.cos(lat)*math.cos(lon), math.cos(lat)*math.sin(lon), math.sin(lat))
    va, vb = vector(a), vector(b)
    angle = distance(a, b) / 6371000
    if angle < 1e-12:
        return a
    if math.pi - angle < 1e-8:
        raise ValueError('Antipodal route segment is ambiguous.')
    left, right = math.sin((1-fraction)*angle)/math.sin(angle), math.sin(fraction*angle)/math.sin(angle)
    x, y, z = [left*u + right*v for u, v in zip(va, vb)]
    return (math.degrees(math.atan2(y, x)), math.degrees(math.atan2(z, math.hypot(x, y))))


def checkpoints(geometry, duration, departure, count=5, spacing=None):
    coords = RouteGeometry.model_validate(geometry).coordinates
    if not math.isfinite(duration) or not 0 <= duration <= 2592000:
        raise ValueError('Invalid route duration.')
    if departure.tzinfo is None or departure.utcoffset() is None:
        raise ValueError('Departure requires a timezone.')
    departure = departure.astimezone(timezone.utc)
    cumulative = [0.0]
    for a, b in zip(coords, coords[1:]):
        segment = distance(a, b)
        if segment / 6371000 > math.pi - 1e-8:
            raise ValueError('Antipodal route segment is ambiguous.')
        cumulative.append(cumulative[-1] + segment)
    total = cumulative[-1]
    if total > 40000000:
        raise ValueError('Route exceeds 40,000 km workload limit.')
    if (total == 0) != (duration == 0):
        raise ValueError('Route length and duration must both be zero or both positive.')
    if spacing is not None:
        if not math.isfinite(spacing) or not 100 <= spacing <= 1000000:
            raise ValueError('Checkpoint spacing must be 100 to 1,000,000 metres.')
        count = math.ceil(total / spacing) + 1
        if count > 25:
            raise ValueError('Spacing would exceed 25 checkpoints; increase spacing.')
        targets = [i * spacing for i in range(max(0, count-1))] + [total]
    else:
        if not 2 <= count <= 25:
            raise ValueError('Checkpoint count must be 2 to 25.')
        # Keep distinct endpoints but avoid densely duplicating tiny routes.
        count = min(count, max(2, int(total) + 1))
        targets = [total * i / (count-1) for i in range(count)]
    if total == 0:
        targets = [0.0]
    result = []
    for i, target in enumerate(targets):
        progress = target / total if total else 0.0
        j = min(bisect.bisect_right(cumulative, target), len(coords)-1)
        span = cumulative[j] - cumulative[j-1]
        lon, lat = coords[-1] if target == total else interpolate(coords[j-1], coords[j], (target-cumulative[j-1])/span if span else 0)
        elapsed = duration * progress
        result.append({'index': i, 'coordinates': {'latitude': lat, 'longitude': lon}, 'progress': progress,
                       'distance_m': target, 'elapsed_seconds': elapsed, 'arrival': departure + timedelta(seconds=elapsed)})
    return result


class Checkpoint(BaseModel):
    index: int
    coordinates: Point
    progress: float
    distance_m: float
    elapsed_seconds: float
    arrival: AwareDatetime
    weather: WeatherResult


class JourneyResponse(BaseModel):
    route: RouteData
    origin: Point
    destination: Point
    mode: str
    departure: AwareDatetime
    arrival: AwareDatetime
    geometry_distance_m: float
    duration_seconds: float
    route_source: Literal['provider', 'supplied']
    checkpoints: list[Checkpoint]
    limitations: str = LIMITATIONS
    timing_method: str = 'duration_proportional_to_geometry_distance'
    coordinate_order: str = 'GeoJSON: longitude, latitude; checkpoints: named latitude/longitude'
    timezone: str = 'UTC; display in the browser timezone'


@router.post('/journeys/simulate', response_model=JourneyResponse)
async def simulate(body: JourneyRequest, service: WeatherService = Depends(weather_service)):
    if body.mode == 'transit':
        raise HTTPException(503, 'Transit routing is unavailable: no timetable provider is configured.')
    raw = body.route.model_dump(mode='json') if body.route else await route(body)
    try:
        routing = RouteData.model_validate(raw)
    except (ValueError, TypeError):
        raise HTTPException(502, 'No usable route returned by the routing provider.')
    try:
        points = checkpoints(routing.geometry.model_dump(), routing.duration_seconds, body.departure,
                             body.checkpoint_count or 5, body.checkpoint_spacing_m)
    except (ValueError, OverflowError):
        raise HTTPException(422, 'Route or checkpoint settings cannot be simulated. Check duration, geometry, spacing and departure range.')
    forecasts = await service.forecasts([(Point(**p['coordinates']), p['arrival']) for p in points])
    for point, forecast in zip(points, forecasts):
        point['weather'] = forecast
    return JourneyResponse(route=routing, origin=body.origin, destination=body.destination, mode=body.mode,
        departure=body.departure.astimezone(timezone.utc), arrival=points[-1]['arrival'],
        geometry_distance_m=points[-1]['distance_m'], duration_seconds=routing.duration_seconds,
        route_source='supplied' if body.route else 'provider', checkpoints=points)
