import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.main import app


class SavedPlaceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(self.engine)
        self.payload = {'id': 'delhi', 'name': 'Delhi', 'displayName': 'Delhi, India', 'coordinates': {'latitude': 28.6139, 'longitude': 77.209}}

    def tearDown(self):
        self.engine.dispose()

    def test_crud_deduplicates_and_persists_for_guest(self):
        with patch('backend.saved_places.Session', self.session):
            client = TestClient(app)
            created = client.post('/api/v1/places/saved', json=self.payload)
            duplicate = client.post('/api/v1/places/saved', json={**self.payload, 'name': 'New Delhi'})
            self.assertEqual(created.status_code, 200)
            self.assertEqual(duplicate.json()['name'], 'New Delhi')
            self.assertEqual(client.get('/api/v1/places/saved').json()['results'], [{**self.payload, 'name': 'New Delhi'}])
            self.assertEqual(client.delete('/api/v1/places/saved/delhi').status_code, 200)
            self.assertEqual(client.get('/api/v1/places/saved').json()['results'], [])

    def test_guest_isolation_and_missing_delete(self):
        with patch('backend.saved_places.Session', self.session):
            owner, stranger = TestClient(app), TestClient(app)
            owner.post('/api/v1/places/saved', json=self.payload)
            self.assertEqual(stranger.get('/api/v1/places/saved').json()['results'], [])
            self.assertEqual(stranger.delete('/api/v1/places/saved/delhi').status_code, 404)
            self.assertEqual(owner.get('/api/v1/places/saved').json()['results'][0]['id'], 'delhi')

    def test_validation_rejects_bad_coordinates_and_oversized_fields(self):
        with patch('backend.saved_places.Session', self.session):
            client = TestClient(app)
            self.assertEqual(client.post('/api/v1/places/saved', json={**self.payload, 'coordinates': {'latitude': 100, 'longitude': 77}}).status_code, 422)
            self.assertEqual(client.post('/api/v1/places/saved', json={**self.payload, 'name': 'x' * 121}).status_code, 422)
            self.assertEqual(client.post('/api/v1/places/saved', json={**self.payload, 'id': 'x' * 257}).status_code, 422)
