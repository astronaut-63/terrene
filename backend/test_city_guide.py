import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from backend.cities import CITIES
from backend.attractions import normalize_attractions
from backend.city_guide import GuideRequest, ranked, plan
from backend.attractions import attractions, CACHE

def attraction(index, heritage=False):
    return {'id': str(index), 'name': f'Test {index}', 'coordinates': CITIES['mumbai']['center'], 'metadata': {'heritage': '1'} if heritage else {}, 'category': 'museum', 'visit_minutes': 60}

class GuideTests(unittest.IsolatedAsyncioTestCase):
    async def test_discovery_empty_partial_and_failure_are_distinct(self):
        CACHE.clear()
        with patch('backend.attractions._overpass_json', AsyncMock(return_value={'elements': []})):
            self.assertEqual((await attractions('mumbai'))['results'], [])
        CACHE.clear()
        row = {'type': 'node', 'id': 1, 'lat': 19.05, 'lon': 72.87, 'tags': {'name': 'Fixture museum', 'tourism': 'museum'}}
        with patch('backend.attractions._overpass_json', AsyncMock(return_value={'elements': [row], 'remark': 'partial'})):
            self.assertEqual((await attractions('mumbai'))['status'], 'partial')
        CACHE.clear()
        with patch('backend.attractions._overpass_json', AsyncMock(side_effect=HTTPException(504, 'Timed out'))):
            with self.assertRaises(HTTPException): await attractions('mumbai')
        with patch('backend.attractions._overpass_json', AsyncMock(return_value={'html': 'invalid'})):
            with self.assertRaises(HTTPException): await attractions('mumbai')

    def test_normalization_filters_invalid_and_deduplicates(self):
        row = {'type': 'node', 'id': 1, 'lat': 19.05, 'lon': 72.87, 'tags': {'name': 'Test', 'tourism': 'museum', 'wikidata': 'Q1'}}
        data = normalize_attractions([row, {**row, 'id': 2}, {**row, 'id': 3, 'lat': 99}, {**row, 'id': 4, 'tags': {}}], CITIES['mumbai'])
        self.assertEqual(len(data), 1)

    def test_importance_is_stable_and_not_proximity_only(self):
        rows = ranked([attraction(2), attraction(1, True)], [])
        self.assertEqual(rows[0]['id'], '1')
        self.assertIn('Mapped heritage designation', rows[0]['reasons'])

    async def test_budget_changes_set_and_counts_travel_and_buffer(self):
        leg = {'duration_seconds': 600, 'geometry': {'coordinates': [[72.87, 19.05], [72.88, 19.06]]}}
        sizes = []
        with patch('backend.city_guide.route', AsyncMock(return_value=leg)):
            for budget in [120, 240, 360, 600]:
                result = await plan(GuideRequest(city_id='mumbai', available_minutes=budget, departure='2026-11-01T09:00:00+05:30'), [attraction(i) for i in range(8)])
                self.assertLessEqual(result['total_minutes'], budget)
                self.assertEqual(result['total_minutes'], result['travel_minutes'] + result['visit_minutes'] + result['buffer_minutes'])
                sizes.append(len(result['selected']))
        self.assertEqual(sizes, [1, 3, 5, 8])

    async def test_closed_and_unavailable_never_claim_to_fit(self):
        body = GuideRequest(city_id='mumbai', available_minutes=120, departure='2026-11-01T09:00:00Z')
        with patch('backend.city_guide.route', AsyncMock(side_effect=HTTPException(503, 'Unavailable'))):
            result = await plan(body, [attraction(1)])
            self.assertFalse(result['selected'])
            self.assertEqual(result['recommendations'][0]['feasibility'], 'travel_unavailable')
        with patch('backend.city_guide.route', AsyncMock(return_value={'duration_seconds': 60, 'geometry': {'coordinates': []}})), patch('backend.city_guide.availability', return_value={'status': 'closed'}):
            self.assertFalse((await plan(body, [attraction(1)]))['selected'])

    async def test_unsupported_city_is_not_substituted(self):
        with self.assertRaises(HTTPException):
            await plan(GuideRequest(city_id='unknown', available_minutes=120, departure='2026-11-01T09:00:00Z'), [])
