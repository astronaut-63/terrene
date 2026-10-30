import unittest

from fastapi.testclient import TestClient
from backend.solar_api import app

client = TestClient(app)


class SolarApiTests(unittest.TestCase):
    def test_health(self):
        response = client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['ok'])

    def test_mid_latitude_result_is_sensible(self):
        body = client.get('/api/solar?lat=19.076&lon=72.878&date=2026-11-01').json()
        self.assertTrue(body['sunrise_sunset_defined'])
        self.assertTrue(body['sunrise_utc'].endswith('Z'))
        self.assertTrue(0 < body['day_length_seconds'] < 86400)
        self.assertTrue(0 <= body['solar_azimuth_degrees'] <= 360)

    def test_invalid_inputs(self):
        self.assertEqual(client.get('/api/solar?lat=91&lon=0&date=2026-11-01').status_code, 400)
        self.assertEqual(client.get('/api/solar?lat=0&lon=0&date=2026-02-30').status_code, 400)

    def test_polar_day_has_no_fabricated_sunrise(self):
        body = client.get('/api/solar?lat=89&lon=0&date=2026-06-21').json()
        self.assertEqual(body['condition'], 'polar-day')
        self.assertIsNone(body['sunrise_utc'])
        self.assertIsNone(body['sunset_utc'])


if __name__ == '__main__':
    unittest.main()
