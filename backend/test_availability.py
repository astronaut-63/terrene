import unittest
from datetime import datetime, timezone
from backend.availability import availability, AvailabilityRequest

class AvailabilityTests(unittest.TestCase):
    def test_states(self):
        for schedule, expected in [(None,'not_provided'),('24/7','open'),('off','closed'),('nonsense','unknown')]:
            body=AvailabilityRequest(coordinates={'latitude':19,'longitude':72},timestamp=datetime(2026,1,5,12,tzinfo=timezone.utc),schedule=schedule)
            self.assertEqual(availability(body)['status'],expected)

    def test_timezone(self):
        body=AvailabilityRequest(coordinates={'latitude':19.076,'longitude':72.8777},timestamp=datetime(2026,1,5,5,tzinfo=timezone.utc),schedule='Mo 10:00-11:00')
        self.assertEqual(availability(body)['status'],'open')
