import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.routing import RouteRequest, provider_body, provider_url, normalize_geometry

PAYLOAD = {'origin': {'latitude': 19, 'longitude': 72}, 'destination': {'latitude': 18, 'longitude': 73}}

class FakeResponse:
    def __init__(self, status_code, data=None):
        self.status_code = status_code
        self._data = data or {}
    def raise_for_status(self):
        if self.status_code >= 400:
            raise __import__('httpx').HTTPStatusError('provider error', request=None, response=self)
    def json(self):
        return self._data

class FakeClient:
    response = FakeResponse(200, {'features': [{'properties': {'summary': {'distance': 1000, 'duration': 60}, 'segments': []}, 'geometry': {'type': 'LineString', 'coordinates': [[72, 19], [73, 18]]}}]})
    last_url = None
    last_headers = None
    def __init__(self, *args, **kwargs): pass
    async def __aenter__(self): return self
    async def __aexit__(self, *args): return None
    async def post(self, url, **kwargs):
        type(self).last_url = url
        type(self).last_headers = kwargs.get('headers')
        return type(self).response

class RoutingTests(unittest.TestCase):
    def test_order_and_wheelchair(self):
        request = RouteRequest(origin={'latitude': 19, 'longitude': 72}, destination={'latitude': 18, 'longitude': 73}, mode='wheelchair')
        body = provider_body(request)
        self.assertEqual(body['coordinates'], [[72, 19], [73, 18]])
        self.assertEqual(body['options']['avoid_features'], ['steps'])

    def test_missing_key_transit_and_validation(self):
        client = TestClient(app)
        payload = PAYLOAD
        with patch.dict(os.environ, {'HEIGIT_API_KEY': ''}):
            response = client.post('/api/v1/routes', json=payload)
            self.assertEqual(response.status_code, 503)
            self.assertNotIn('secret', response.text)
        self.assertEqual(client.post('/api/v1/routes', json={**payload, 'mode': 'transit'}).status_code, 503)
        self.assertEqual(client.post('/api/v1/routes', json={**payload, 'mode': 'flying'}).status_code, 422)

    def test_provider_url_defaults_and_override(self):
        self.assertEqual(provider_url(None, 'driving-car'), 'https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson')
        self.assertEqual(provider_url('https://example.test/custom/', 'foot-walking'), 'https://example.test/custom/v2/directions/foot-walking/geojson')
        self.assertEqual(provider_url('https://example.test/custom/v2/', 'cycling-regular'), 'https://example.test/custom/v2/directions/cycling-regular/geojson')

    def test_provider_string_coordinates_are_normalized_for_consumers(self):
        geometry = normalize_geometry({'type': 'LineString', 'coordinates': ['72.5 19.5', '73.0 19.0']})
        self.assertEqual(geometry['coordinates'], [[72.5, 19.5], [73.0, 19.0]])

    def test_success_uses_configured_provider_without_leaking_key(self):
        client = TestClient(app)
        FakeClient.response = FakeResponse(200, {'features': [{'properties': {'summary': {'distance': 1000, 'duration': 60}, 'segments': []}, 'geometry': {'type': 'LineString', 'coordinates': [[72, 19], [73, 18]]}}]})
        with patch.dict(os.environ, {'HEIGIT_API_KEY': 'secret-test-key', 'HEIGIT_BASE_URL': 'https://router.test/openrouteservice'}), patch('backend.routing.httpx.AsyncClient', FakeClient):
            response = client.post('/api/v1/routes', json=PAYLOAD)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(FakeClient.last_url, 'https://router.test/openrouteservice/v2/directions/driving-car/geojson')
        self.assertEqual(FakeClient.last_headers['Authorization'], 'secret-test-key')
        self.assertNotIn('secret-test-key', response.text)

    def test_authentication_and_rate_limit_are_safe(self):
        client = TestClient(app)
        with patch.dict(os.environ, {'HEIGIT_API_KEY': 'secret-test-key'}), patch('backend.routing.httpx.AsyncClient', FakeClient):
            for status, expected in ((401, 502), (403, 502), (429, 429)):
                FakeClient.response = FakeResponse(status)
                response = client.post('/api/v1/routes', json=PAYLOAD)
                self.assertEqual(response.status_code, expected)
                self.assertNotIn('secret-test-key', response.text)

    def test_ready_reports_provider_configuration_separately(self):
        client = TestClient(app)
        with patch.dict(os.environ, {'HEIGIT_API_KEY': ''}):
            response = client.get('/api/v1/ready')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['routing_provider']['configured'])

    def test_invalid_geographic_coordinates_are_rejected(self):
        for coordinates in [[[181, 0], [0, 0]], [[0, 91], [0, 0]], [['NaN', 1], [0, 0]]]:
            with self.assertRaises(ValueError):
                normalize_geometry({'type': 'LineString', 'coordinates': coordinates})

    def test_invalid_provider_summary_cannot_be_displayed_as_a_route(self):
        client = TestClient(app)
        with patch.dict(os.environ, {'HEIGIT_API_KEY': 'test-key'}), patch('backend.routing.httpx.AsyncClient', FakeClient):
            for summary in [{'distance': -1, 'duration': 60}, {'distance': 10, 'duration': 'nan'}, {'distance': True, 'duration': 60}]:
                FakeClient.response = FakeResponse(200, {'features': [{'properties': {'summary': summary}, 'geometry': {'type': 'LineString', 'coordinates': [[72, 19], [73, 18]]}}]})
                response = client.post('/api/v1/routes', json=PAYLOAD)
                self.assertEqual(response.status_code, 502)
                self.assertNotIn('test-key', response.text)
