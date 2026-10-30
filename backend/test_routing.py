import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from backend.main import app
from backend.routing import RouteRequest, provider_body

class RoutingTests(unittest.TestCase):
    def test_order_and_wheelchair(self):
        request = RouteRequest(origin={'latitude': 19, 'longitude': 72}, destination={'latitude': 18, 'longitude': 73}, mode='wheelchair')
        body = provider_body(request)
        self.assertEqual(body['coordinates'], [[72, 19], [73, 18]])
        self.assertEqual(body['options']['avoid_features'], ['steps'])

    def test_missing_key_transit_and_validation(self):
        client = TestClient(app)
        payload = {'origin': {'latitude': 19, 'longitude': 72}, 'destination': {'latitude': 18, 'longitude': 73}}
        with patch.dict(os.environ, {'HEIGIT_API_KEY': ''}):
            self.assertEqual(client.post('/api/v1/routes', json=payload).status_code, 503)
        self.assertEqual(client.post('/api/v1/routes', json={**payload, 'mode': 'transit'}).status_code, 503)
        self.assertEqual(client.post('/api/v1/routes', json={**payload, 'mode': 'flying'}).status_code, 422)
