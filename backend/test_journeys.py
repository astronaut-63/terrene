import asyncio
import copy
import httpx
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.main import app
from backend import journeys


class FakeResponse:
    def __init__(self, data=None, error=None):
        self.data = data
        self.error = error

    def raise_for_status(self):
        if self.error:
            raise self.error

    def json(self):
        return self.data


class FakeClient:
    response = None
    calls = 0

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, *args, **kwargs):
        type(self).calls += 1
        if isinstance(type(self).response, Exception):
            raise type(self).response
        return type(self).response


def forecast_payload(stamp, missing=()):
    hourly = {'time': [stamp.strftime('%Y-%m-%dT%H:00')]}
    for name in journeys.VARIABLES.split(','):
        if name not in missing:
            hourly[name] = [1]
    return {'hourly': hourly, 'hourly_units': {'temperature_2m': '°C'}}


class JourneyTests(unittest.TestCase):
    def setUp(self):
        journeys.clear_weather_cache()
        FakeClient.calls = 0

    def test_checkpoints_interpolate_progress_distance_and_timezone(self):
        departure = datetime(2026, 1, 2, 8, 30, tzinfo=timezone(timedelta(hours=5, minutes=30)))
        result = journeys.checkpoints({'type': 'LineString', 'coordinates': [[0, 0], [1, 0]]}, 100, departure)
        self.assertEqual([p['progress'] for p in result], [0, .25, .5, .75, 1])
        self.assertAlmostEqual(result[2]['coordinates']['longitude'], .5)
        self.assertAlmostEqual(result[-1]['distance_m'], journeys.distance([0, 0], [1, 0]))
        self.assertEqual(result[0]['arrival'], departure.isoformat())
        self.assertEqual(result[-1]['arrival'], (departure + timedelta(seconds=100)).isoformat())

    def test_checkpoints_reject_invalid_and_zero_length_geometry(self):
        with self.assertRaises(ValueError):
            journeys.checkpoints({'type': 'Point', 'coordinates': [[0, 0]]}, 10, datetime.now(timezone.utc))
        result = journeys.checkpoints({'type': 'LineString', 'coordinates': [[1, 2], [1, 2]]}, 10, datetime.now(timezone.utc))
        self.assertTrue(all(p['coordinates'] == {'latitude': 2, 'longitude': 1} for p in result))

    def test_weather_current_future_horizon_and_historical(self):
        client = TestClient(app)
        now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        FakeClient.response = FakeResponse(forecast_payload(now))
        with patch('backend.journeys.httpx.AsyncClient', FakeClient):
            current = client.get('/api/v1/weather/point', params={'latitude': 19, 'longitude': 72, 'timestamp': now.isoformat()})
            future = client.get('/api/v1/weather/point', params={'latitude': 19, 'longitude': 72, 'timestamp': (now + timedelta(days=16)).isoformat()})
            historical = client.get('/api/v1/weather/point', params={'latitude': 19, 'longitude': 72, 'timestamp': (now - timedelta(days=1)).isoformat()})
        self.assertEqual(current.json()['status'], 'available')
        self.assertEqual(future.json()['status'], 'beyond_forecast_horizon')
        self.assertEqual(historical.json()['status'], 'unavailable')
        self.assertIn('Historical', historical.json()['reason'])

    def test_weather_partial_data_is_returned_and_cached(self):
        client = TestClient(app)
        stamp = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        FakeClient.response = FakeResponse(forecast_payload(stamp, missing={'wind_speed_10m'}))
        with patch('backend.journeys.httpx.AsyncClient', FakeClient):
            first = client.get('/api/v1/weather/point', params={'latitude': 19, 'longitude': 72, 'timestamp': stamp.isoformat()})
            second = client.get('/api/v1/weather/point', params={'latitude': 19, 'longitude': 72, 'timestamp': stamp.isoformat()})
        self.assertEqual(first.json()['status'], 'partially_available')
        self.assertIsNone(first.json()['values']['wind_speed_10m'])
        self.assertEqual(second.json()['status'], 'partially_available')
        self.assertEqual(FakeClient.calls, 1)

    def test_weather_malformed_timeout_and_provider_failure_are_unavailable(self):
        client = TestClient(app)
        stamp = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
        cases = [FakeResponse([]), FakeResponse({'hourly': None}), httpx.TimeoutException('timeout'), FakeResponse(error=httpx.HTTPError('provider'))]
        with patch('backend.journeys.httpx.AsyncClient', FakeClient):
            for response in cases:
                journeys.clear_weather_cache()
                FakeClient.response = response
                result = client.get('/api/v1/weather/point', params={'latitude': 19, 'longitude': 72, 'timestamp': stamp.isoformat()})
                self.assertEqual(result.json()['status'], 'unavailable')

    def test_simulation_preserves_checkpoints_and_limits_weather_concurrency(self):
        route_result = {'geometry': {'type': 'LineString', 'coordinates': [[72, 19], [73, 18]]}, 'duration_seconds': 100, 'distance_m': 1000}
        active = 0
        maximum = 0

        async def fake_weather(**kwargs):
            nonlocal active, maximum
            active += 1
            maximum = max(maximum, active)
            await asyncio.sleep(0)
            active -= 1
            if kwargs['latitude'] > 18.5:
                raise RuntimeError('weather unavailable')
            return {'status': 'available', 'values': {'temperature_2m': 25}}

        payload = {'origin': {'latitude': 19, 'longitude': 72}, 'destination': {'latitude': 18, 'longitude': 73}, 'mode': 'driving', 'departure': '2026-01-02T08:30:00+05:30'}
        with patch('backend.journeys.route', new=AsyncMock(return_value=route_result)), patch('backend.journeys.weather', side_effect=fake_weather):
            response = TestClient(app).post('/api/v1/journeys/simulate', json=payload)
        self.assertEqual(response.status_code, 200)
        checkpoints = response.json()['checkpoints']
        self.assertEqual(len(checkpoints), 5)
        self.assertEqual(checkpoints[0]['weather']['status'], 'unavailable')
        self.assertEqual(checkpoints[-1]['weather']['status'], 'available')
        self.assertLessEqual(maximum, journeys.WEATHER_CONCURRENCY)
