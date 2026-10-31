import unittest
import os
from unittest.mock import patch
from backend.search import normalize
from backend.main import app
from fastapi.testclient import TestClient

class SearchTests(unittest.TestCase):
    def test_autocomplete_only_for_an_explicitly_permitted_deployment(self):
        client = TestClient(app)
        for endpoint, flag, expected in [
            ('https://nominatim.openstreetmap.org/search', 'true', False),
            ('https://NOMINATIM.openstreetmap.org/search', 'true', False),
            ('https://nominatim.openstreetmap.org./search', 'true', False),
            ('', 'true', False),
            ('https://maps.example.test/search', 'false', False),
            ('https://maps.example.test/search', 'true', True),
        ]:
            with patch.dict(os.environ, {'NOMINATIM_SEARCH_URL': endpoint, 'NOMINATIM_AUTOCOMPLETE': flag}):
                self.assertEqual(client.get('/api/v1/locations/config').json(), {'autocomplete': expected})

    def test_normalization(self):
        for name in ['Mumbai', 'Bengaluru', 'Delhi', 'Ooty', 'London']:
            result = normalize([{'place_id': 1, 'lat': '19.076', 'lon': '72.8777', 'display_name': name + ', Country'}])
            self.assertEqual(result['results'][0]['name'], name)
            self.assertEqual(result['results'][0]['coordinates']['longitude'], 72.8777)
        self.assertEqual(normalize([{'lat': 'nan', 'lon': '0', 'display_name': 'Bad'}])['results'], [])

    def test_endpoints(self):
        client = TestClient(app)
        self.assertEqual(client.get('/api/v1/health').status_code, 200)
        self.assertEqual(client.get('/api/v1/locations/search?q=').status_code, 422)
        self.assertEqual(client.get('/api/v1/solar?lat=19&lon=72&date=2026-01-01').status_code, 200)
