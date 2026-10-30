import unittest
from backend.search import normalize
from backend.main import app
from fastapi.testclient import TestClient

class SearchTests(unittest.TestCase):
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
