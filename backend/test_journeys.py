import asyncio
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import httpx
from fastapi.testclient import TestClient
from backend.main import app
from backend.journeys import (checkpoints, distance, WeatherService, VARIABLES,
                              weather_service, WeatherResult)
from backend.routing import RouteData

NOW = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
GEOMETRY = {'type': 'LineString', 'coordinates': [[0, 0], [1, 0], [1, 1]]}
ROUTE = {'geometry': GEOMETRY, 'distance_m': 222390, 'duration_seconds': 7200}
PAYLOAD = {'origin': {'latitude': 0, 'longitude': 0}, 'destination': {'latitude': 1, 'longitude': 1}, 'departure': NOW.isoformat(), 'route': ROUTE}


def product(hours=range(16 * 24)):
    times = [(NOW.replace(hour=0) + timedelta(hours=i)).strftime('%Y-%m-%dT%H:00') for i in hours]
    return {'hourly': {'time': times, **{name: [5] * len(times) for name in VARIABLES.split(',')}}}


class GeometryTests(unittest.TestCase):
    def test_multisegment_distances_timing_endpoints(self):
        result = checkpoints(GEOMETRY, 7200, NOW)
        self.assertEqual(len(result), 5)
        self.assertEqual(result[0]['coordinates'], {'latitude': 0, 'longitude': 0})
        self.assertEqual(result[-1]['coordinates'], {'latitude': 1, 'longitude': 1})
        self.assertAlmostEqual(result[2]['coordinates']['longitude'], 1)
        self.assertAlmostEqual(result[2]['coordinates']['latitude'], 0)
        self.assertAlmostEqual(result[-1]['distance_m'], 222390, delta=1)
        self.assertEqual(result[-1]['arrival'], NOW + timedelta(hours=2))
        self.assertTrue(all(a['arrival'] < b['arrival'] and a['distance_m'] < b['distance_m'] for a, b in zip(result, result[1:])))

    def test_repeated_short_zero_and_spacing(self):
        g = {'type': 'LineString', 'coordinates': [[0, 0], [0, 0], [0.000001, 0], [0.000001, 0]]}
        result = checkpoints(g, 1, NOW)
        self.assertEqual(len(result), 2)
        self.assertNotEqual(result[0]['coordinates'], result[1]['coordinates'])
        zero = checkpoints({'coordinates': [[0, 0], [0, 0]]}, 0, NOW)
        self.assertEqual(len(zero), 1)
        self.assertEqual(zero[0]['arrival'], NOW)
        result = checkpoints(GEOMETRY, 7200, NOW, spacing=100000)
        self.assertEqual([p['distance_m'] for p in result[:-1]], [0, 100000, 200000])
        for kwargs in [{'count': 26}, {'count': 1}, {'spacing': 99}, {'spacing': 100}]:
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                checkpoints(GEOMETRY, 7200, NOW, **kwargs)

    def test_invalid_geometry_and_duration(self):
        for coords in [[], [[0, 0]], [[181, 0], [0, 0]], [[0, 91], [0, 0]], [[0, 0, 1], [1, 1]], [[float('nan'), 0], [1, 1]]]:
            with self.subTest(coords=coords), self.assertRaises(ValueError):
                checkpoints({'coordinates': coords}, 1, NOW)
        for duration in [-1, float('inf'), float('nan'), 0, 2592001]:
            with self.subTest(duration=duration), self.assertRaises(ValueError):
                checkpoints(GEOMETRY, duration, NOW)
        with self.assertRaises(ValueError):
            RouteData.model_validate({k: v for k, v in ROUTE.items() if k != 'duration_seconds'})

    def test_dateline_and_timezone_transition(self):
        result = checkpoints({'coordinates': [[179, 10], [-179, 10]]}, 3600, NOW, count=3)
        self.assertAlmostEqual(abs(result[1]['coordinates']['longitude']), 180)
        from zoneinfo import ZoneInfo
        departure = datetime(2026, 3, 8, 1, 30, tzinfo=ZoneInfo('America/New_York'))
        arrival = checkpoints(GEOMETRY, 7200, departure)[-1]['arrival']
        self.assertEqual(arrival.astimezone(ZoneInfo('America/New_York')).hour, 4)
        with self.assertRaises(ValueError):
            checkpoints(GEOMETRY, 7200, NOW.replace(tzinfo=None))


class WeatherTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.clock = patch('backend.journeys.utcnow', return_value=NOW)
        self.clock.start()
        self.addCleanup(self.clock.stop)
        from backend.routing import Point
        self.point = Point(latitude=0, longitude=0)

    async def fetch(self, handler, points=None):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            service = WeatherService(client)
            return await service.forecasts(points or [(self.point, NOW)])

    async def test_all_variables_batch_cache(self):
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(200, json=product())
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            service = WeatherService(client)
            first = await service.forecasts([(self.point, NOW), (self.point, NOW + timedelta(minutes=30))])
            second = await service.forecasts([(self.point, NOW)])
            self.assertEqual(len(calls), 1)
            self.assertEqual(first[0].status, 'available')
            self.assertEqual(first[1].forecast_timestamp, NOW)
            self.assertEqual(first[0].values, second[0].values)
            self.assertEqual(len(first[0].values), 8)
            self.assertEqual(calls[0].url.params['forecast_days'], '16')
            key = next(iter(service.cache))
            service.cache[key] = (0, *service.cache[key][1:])
            await service.forecasts([(self.point, NOW)])
            self.assertEqual(len(calls), 2)

    async def test_partial_null_nonfinite_and_missing_hour(self):
        data = product()
        data['hourly']['temperature_2m'] = []
        data['hourly']['cloud_cover'][12] = 'bad'
        result = await self.fetch(lambda r: httpx.Response(200, json=data))
        self.assertEqual(result[0].status, 'partially_available')
        self.assertIsNone(result[0].values['temperature_2m'])
        for hours, status in [(range(3), 'beyond_forecast_horizon'), ([11, 13], 'no_data')]:
            result = await self.fetch(lambda r: httpx.Response(200, json=product(hours)))
            self.assertEqual(result[0].status, status)
        result = await self.fetch(lambda r: httpx.Response(200, json={'hourly': {'time': ['2026-10-31T12:00']}}))
        self.assertEqual(result[0].status, 'no_data')

    async def test_horizon_and_history_no_requests(self):
        def handler(r):
            self.fail('Out-of-window requests must not call provider')
        results = await self.fetch(handler, [(self.point, NOW-timedelta(days=1)), (self.point, NOW+timedelta(days=16))])
        self.assertEqual([p.status for p in results], ['historical_data_unavailable', 'beyond_forecast_horizon'])

    async def test_failures_not_cached(self):
        def timeout(request):
            raise httpx.ReadTimeout('timeout', request=request)
        handlers = [timeout, lambda r: httpx.Response(429), lambda r: httpx.Response(500),
                    lambda r: httpx.Response(200, text='{'), lambda r: httpx.Response(200, json=[]),
                    lambda r: httpx.Response(200, json={'hourly': {'time': [None]}})]
        for handler in handlers:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                service = WeatherService(client)
                result = await service.forecasts([(self.point, NOW)])
                self.assertEqual(result[0].status, 'provider_error')
                self.assertEqual(len(service.cache), 0)

    async def test_partial_location_failure_and_concurrency(self):
        from backend.routing import Point
        points = [(self.point, NOW), (Point(latitude=1, longitude=1), NOW)]
        results = await self.fetch(lambda r: httpx.Response(200, json=[product(), {}]), points)
        self.assertEqual([p.status for p in results], ['available', 'provider_error'])
        active = peak = 0
        async def handler(request):
            nonlocal active, peak
            active += 1
            peak = max(active, peak)
            await asyncio.sleep(0.01)
            active -= 1
            return httpx.Response(200, json=product())
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            service = WeatherService(client)
            await asyncio.gather(*(service.forecasts([(Point(latitude=i, longitude=0), NOW)]) for i in range(10)))
        self.assertEqual(peak, 3)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.service = AsyncMock()
        async def forecasts(points):
            return [WeatherResult(status='provider_error', timestamp=stamp) for p, stamp in points]
        self.service.forecasts.side_effect = forecasts
        app.dependency_overrides[weather_service] = lambda: self.service
        self.addCleanup(app.dependency_overrides.clear)
        self.client = TestClient(app)

    def test_legacy_and_reused_route(self):
        with patch('backend.journeys.route', AsyncMock(return_value=ROUTE)) as provider:
            response = self.client.post('/api/v1/journeys/simulate', json=PAYLOAD)
            self.assertEqual(response.status_code, 200, response.text)
            provider.assert_not_awaited()
            body = response.json()
            self.assertEqual(body['route_source'], 'supplied')
            self.assertEqual(len(body['checkpoints']), 5)
            self.assertTrue(all(p['weather']['status'] == 'provider_error' for p in body['checkpoints']))
            self.assertEqual(body['arrival'], body['checkpoints'][-1]['arrival'])
            old = {k: v for k, v in PAYLOAD.items() if k != 'route'}
            self.assertEqual(self.client.post('/api/v1/journeys/simulate', json=old).status_code, 200)
            provider.assert_awaited_once()

    def test_invalid_requests(self):
        for change in [{'departure': 'bad'}, {'departure': '2026-10-31T12:00'}, {'mode': 'flying'},
                       {'origin': {'latitude': 91, 'longitude': 0}}, {'checkpoint_count': 26},
                       {'checkpoint_count': 2, 'checkpoint_spacing_m': 1000}, {'checkpoint_spacing_m': 100},
                       {'route': {**ROUTE, 'duration_seconds': -1}}, {'route': {**ROUTE, 'geometry': {'type': 'Point', 'coordinates': [0, 0]}}},
                       {'destination': {'latitude': 50, 'longitude': 50}}, {'departure': '9999-12-31T23:59:59Z'}]:
            with self.subTest(change=change):
                response = self.client.post('/api/v1/journeys/simulate', json={**PAYLOAD, **change})
                self.assertEqual(response.status_code, 422, response.text)
        self.assertEqual(self.client.post('/api/v1/journeys/simulate', json={**PAYLOAD, 'mode': 'transit'}).status_code, 503)

    def test_provider_failure_and_bad_route(self):
        from fastapi import HTTPException
        payload = {k: v for k, v in PAYLOAD.items() if k != 'route'}
        for outcome, status in [(HTTPException(504, 'Timed out'), 504), ({}, 502)]:
            mock = AsyncMock(side_effect=outcome) if isinstance(outcome, Exception) else AsyncMock(return_value=outcome)
            with patch('backend.journeys.route', mock):
                self.assertEqual(self.client.post('/api/v1/journeys/simulate', json=payload).status_code, status)

    def test_point_validation_and_openapi(self):
        response = self.client.get('/api/v1/weather/point', params={'latitude': 100, 'longitude': 0, 'timestamp': NOW.isoformat()})
        self.assertEqual(response.status_code, 422)
        response = self.client.get('/api/v1/weather/point', params={'latitude': 0, 'longitude': 0, 'timestamp': NOW.isoformat()})
        self.assertEqual(response.status_code, 200)
        schema = self.client.get('/openapi.json').json()
        self.assertIn('JourneyResponse', schema['components']['schemas'])

class RoutingProviderTests(unittest.IsolatedAsyncioTestCase):
    async def test_provider_schema_and_failures(self):
        import os
        from backend.routing import route, RouteRequest
        from fastapi import HTTPException
        request = RouteRequest(origin=PAYLOAD['origin'], destination=PAYLOAD['destination'])
        good = {'features': [{'geometry': GEOMETRY, 'properties': {'summary': {'distance': 222390, 'duration': 7200}}}]}
        cases = [(200, good, None), (200, {}, 502), (429, {}, 429), (500, {}, 502),
                 (200, {'features': [{'geometry': {'type': 'LineString', 'coordinates': [[0, 0], [200, 0]]}, 'properties': {'summary': {'distance': 1, 'duration': 1}}}]}, 502)]
        for code, data, expected in cases:
            response = httpx.Response(code, json=data, request=httpx.Request('POST', 'https://example.test'))
            client = AsyncMock()
            client.post.return_value = response
            client.__aenter__.return_value = client
            with patch.dict(os.environ, {'HEIGIT_API_KEY': 'test-key'}), patch('backend.routing.httpx.AsyncClient', return_value=client):
                if expected:
                    with self.assertRaises(HTTPException) as raised:
                        await route(request)
                    self.assertEqual(raised.exception.status_code, expected)
                else:
                    result = await route(request)
                    self.assertEqual(result['duration_seconds'], 7200)
                    self.assertEqual(result['geometry']['coordinates'], GEOMETRY['coordinates'])
        for error, expected in [(httpx.ReadTimeout('timeout'), 504), (ValueError('bad JSON'), 502)]:
            client = AsyncMock()
            client.post.side_effect = error
            client.__aenter__.return_value = client
            with patch.dict(os.environ, {'HEIGIT_API_KEY': 'test-key'}), patch('backend.routing.httpx.AsyncClient', return_value=client):
                with self.assertRaises(HTTPException) as raised:
                    await route(request)
                self.assertEqual(raised.exception.status_code, expected)


class LifespanTests(unittest.TestCase):
    def test_pool_initialization_and_actual_weather_adapter(self):
        with TestClient(app) as client, patch('backend.journeys.utcnow', return_value=NOW):
            service = app.state.weather_service
            async def get(url, params):
                count = len(params['latitude'].split(','))
                return httpx.Response(200, json=[product()] * count, request=httpx.Request('GET', url))
            with patch.object(service.client, 'get', side_effect=get) as provider:
                response = client.post('/api/v1/journeys/simulate', json=PAYLOAD)
                self.assertEqual(response.status_code, 200, response.text)
                self.assertTrue(all(p['weather']['status'] == 'available' for p in response.json()['checkpoints']))
                self.assertEqual(provider.call_count, 1)
                response = client.post('/api/v1/journeys/simulate', json=PAYLOAD)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(provider.call_count, 1)
        self.assertTrue(service.client.is_closed)
