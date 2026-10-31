import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from backend.main import app


class ProviderResponse:
    status_code = 200

    def raise_for_status(self):
        return None

    def json(self):
        return {'features': [{'properties': {'summary': {'distance': 1000, 'duration': 120}, 'segments': []}, 'geometry': {'type': 'LineString', 'coordinates': [[72, 19], [73, 18]]}}]}


class ProviderClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def post(self, *args, **kwargs):
        return ProviderResponse()


class IntegrationTests(unittest.TestCase):
    def test_route_then_journey_preserves_contract(self):
        payload = {'origin': {'latitude': 19, 'longitude': 72}, 'destination': {'latitude': 18, 'longitude': 73}, 'mode': 'driving', 'departure': '2026-01-05T08:30:00+05:30'}
        weather = AsyncMock(return_value={'status': 'partially_available', 'values': {'temperature_2m': None}})
        with patch.dict('os.environ', {'HEIGIT_API_KEY': 'test-only-key'}), patch('backend.routing.httpx.AsyncClient', ProviderClient), patch('backend.journeys.weather', weather):
            client = TestClient(app)
            route = client.post('/api/v1/routes', json={key: value for key, value in payload.items() if key != 'departure'})
            journey = client.post('/api/v1/journeys/simulate', json=payload)
        self.assertEqual(route.status_code, 200)
        self.assertEqual(journey.status_code, 200)
        body = journey.json()
        self.assertEqual(body['route']['geometry']['type'], 'LineString')
        self.assertEqual(len(body['checkpoints']), 5)
        self.assertEqual(body['checkpoints'][0]['arrival'], '2026-01-05T08:30:00+05:30')
        self.assertEqual(body['checkpoints'][0]['weather']['status'], 'partially_available')

    def test_provider_failure_is_safe_for_route_and_journey(self):
        class BrokenClient(ProviderClient):
            async def post(self, *args, **kwargs):
                raise __import__('httpx').TimeoutException('provider timeout')

        payload = {'origin': {'latitude': 19, 'longitude': 72}, 'destination': {'latitude': 18, 'longitude': 73}, 'mode': 'driving', 'departure': '2026-01-05T08:30:00+05:30'}
        with patch.dict('os.environ', {'HEIGIT_API_KEY': 'test-only-key'}), patch('backend.routing.httpx.AsyncClient', BrokenClient):
            client = TestClient(app)
            self.assertEqual(client.post('/api/v1/routes', json={key: value for key, value in payload.items() if key != 'departure'}).status_code, 504)
            self.assertEqual(client.post('/api/v1/journeys/simulate', json=payload).status_code, 504)
