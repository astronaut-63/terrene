import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.main import app


def leg(distance=1000, duration=600):
    return {'geometry': {'type': 'LineString', 'coordinates': [[72, 19], [73, 18]]}, 'distance_m': distance, 'duration_seconds': duration}


class ItineraryTests(unittest.TestCase):
    def setUp(self):
        self.payload = {'origin': {'latitude': 19, 'longitude': 72}, 'destination': {'latitude': 18, 'longitude': 73}, 'mode': 'driving', 'departure': '2026-01-05T08:30:00+05:30', 'available_minutes': 120, 'break_minutes': 10, 'break_after_stop': 1, 'stops': [{'id': 'museum', 'name': 'Museum', 'coordinates': {'latitude': 19.1, 'longitude': 72.1}, 'visit_minutes': 30, 'opening_hours': 'Mo 09:00-17:00'}, {'id': 'park', 'name': 'Park', 'coordinates': {'latitude': 19.2, 'longitude': 72.2}, 'visit_minutes': 20}]}

    def test_generate_orders_stops_and_accounts_for_travel_visits_breaks(self):
        hours = {'status': 'not_provided', 'schedule': None, 'timestamp': 'x', 'basis': 'Published schedule'}
        with patch('backend.itineraries.route', new=AsyncMock(side_effect=[leg(duration=600), leg(duration=900), leg(duration=1200)])), patch('backend.itineraries.availability', return_value=hours):
            response = TestClient(app).post('/api/v1/itineraries/generate', json=self.payload)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'ok')
        self.assertEqual([item['id'] for item in body['stops'] if item.get('type') != 'break'], ['museum', 'park'])
        self.assertEqual(body['stops'][1]['type'], 'break')
        self.assertGreater(body['total_duration_minutes'], 60)
        self.assertIn('published information', body['limitations'])

    def test_partial_route_failure_omits_one_stop_and_keeps_other_results(self):
        failure = HTTPException(504, 'provider timed out')
        with patch('backend.itineraries.route', new=AsyncMock(side_effect=[leg(), failure, leg()])):
            response = TestClient(app).post('/api/v1/itineraries/generate', json=self.payload)
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['status'], 'partial')
        self.assertEqual(body['omitted_stops'][0]['id'], 'park')
        self.assertEqual(body['stops'][0]['id'], 'museum')

    def test_hours_conflict_and_unknown_are_warnings(self):
        hours = {'status': 'closed', 'schedule': 'Mo 09:00-10:00', 'timestamp': 'x', 'basis': 'Published schedule'}
        with patch('backend.itineraries.route', new=AsyncMock(return_value=leg())), patch('backend.itineraries.availability', return_value=hours):
            response = TestClient(app).post('/api/v1/itineraries/generate', json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['warnings'])

    def test_invalid_input_and_no_routable_stops(self):
        client = TestClient(app)
        self.assertEqual(client.post('/api/v1/itineraries/generate', json={**self.payload, 'stops': []}).status_code, 422)
        with patch('backend.itineraries.route', new=AsyncMock(side_effect=HTTPException(502, 'provider'))):
            self.assertEqual(client.post('/api/v1/itineraries/generate', json=self.payload).status_code, 503)
