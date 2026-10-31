import unittest
from unittest.mock import patch
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import Base

class ReadinessTests(unittest.TestCase):
    def test_missing_schema_is_not_ready_but_live(self):
        engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
        with patch('backend.main.engine', engine):
            client = TestClient(app)
            self.assertEqual(client.get('/api/v1/health').status_code, 200)
            self.assertEqual(client.get('/api/v1/ready').status_code, 503)
        engine.dispose()

    def test_expected_schema_ready_without_external_requests(self):
        engine = create_engine('sqlite://', poolclass=StaticPool, connect_args={'check_same_thread': False})
        Base.metadata.create_all(engine)
        with patch('backend.main.engine', engine):
            result = TestClient(app).get('/api/v1/ready')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['database'], 'ready')
        self.assertIn('capabilities', result.json())
        engine.dispose()
