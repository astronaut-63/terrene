import unittest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from backend.database import Base
from backend.main import app

class OwnershipTests(unittest.TestCase):
    def test_guest_crud_and_isolation(self):
        engine = create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        payload = {'name':'Test', 'plan':{'origin':{'latitude':19,'longitude':72}, 'destination':{'latitude':18,'longitude':73}}}
        with patch('backend.trips.Session', sessionmaker(engine)):
            owner, stranger = TestClient(app), TestClient(app)
            created = owner.post('/api/v1/trips', json=payload)
            self.assertEqual(created.status_code,200)
            self.assertIn('HttpOnly', created.headers['set-cookie'])
            url = '/api/v1/trips/'+created.json()['id']
            self.assertEqual(stranger.get(url).status_code,404)
            self.assertEqual(stranger.put(url,json=payload).status_code,404)
            self.assertEqual(stranger.delete(url).status_code,404)
            self.assertEqual(stranger.get('/api/v1/trips').json()['trips'],[])
            self.assertEqual(owner.get(url).status_code,200)
            self.assertEqual(owner.put(url,json={**payload,'name':'Updated'}).json()['name'],'Updated')
            self.assertEqual(owner.delete(url).status_code,200)
            self.assertEqual(owner.get(url).status_code,404)
        engine.dispose()
