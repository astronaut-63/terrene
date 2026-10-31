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

    def test_utc_local_date_boundary(self):
        coordinates = {'latitude': 19.076, 'longitude': 72.8777}
        before = AvailabilityRequest(coordinates=coordinates, timestamp=datetime(2026, 1, 4, 18, 29, tzinfo=timezone.utc), schedule='Mo 00:00-01:00')
        after = AvailabilityRequest(coordinates=coordinates, timestamp=datetime(2026, 1, 4, 18, 30, tzinfo=timezone.utc), schedule='Mo 00:00-01:00')
        self.assertEqual(availability(before)['status'], 'closed')
        self.assertEqual(availability(after)['status'], 'open')

    def test_daylight_saving_transition_uses_location_timezone(self):
        coordinates = {'latitude': 40.7128, 'longitude': -74.006}
        before_jump = AvailabilityRequest(coordinates=coordinates, timestamp=datetime(2026, 3, 8, 6, 30, tzinfo=timezone.utc), schedule='Su 01:00-03:00')
        after_jump = AvailabilityRequest(coordinates=coordinates, timestamp=datetime(2026, 3, 8, 7, 30, tzinfo=timezone.utc), schedule='Su 01:00-03:00')
        self.assertEqual(availability(before_jump)['status'], 'open')
        self.assertEqual(availability(after_jump)['status'], 'closed')

    def test_invalid_and_missing_schedules_are_safe_and_not_operational_claims(self):
        body = AvailabilityRequest(coordinates={'latitude':19,'longitude':72}, timestamp=datetime(2026,1,5,12,tzinfo=timezone.utc), schedule='not a valid schedule')
        result = availability(body)
        self.assertEqual(result['status'], 'unknown')
        self.assertIn('Published schedule', result['basis'])
        self.assertEqual(availability(body.model_copy(update={'schedule': None}))['status'], 'not_provided')
