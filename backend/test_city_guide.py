import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from backend.cities import CITIES, resolve_city_id
from backend.attractions import normalize_attractions, merge_attractions
from backend.city_attraction_catalog import curated_attractions
from backend.city_guide import GuideRequest, ranked, plan
from backend.attractions import attractions, CACHE

def attraction(index, heritage=False):
    return {'id': str(index), 'name': f'Test {index}', 'coordinates': CITIES['mumbai']['center'], 'metadata': {'heritage': '1'} if heritage else {}, 'category': 'museum', 'visit_minutes': 60}

class GuideTests(unittest.IsolatedAsyncioTestCase):
    async def test_curated_catalog_survives_empty_partial_and_failure(self):
        CACHE.clear()
        with patch('backend.attractions._overpass_json', AsyncMock(return_value={'elements': []})):
            result = await attractions('mumbai')
            self.assertEqual(len(result['results']), 12)
            self.assertEqual(result['status'], 'ok')
        CACHE.clear()
        row = {'type': 'node', 'id': 1, 'lat': 19.05, 'lon': 72.87, 'tags': {'name': 'Fixture museum', 'tourism': 'museum'}}
        with patch('backend.attractions._overpass_json', AsyncMock(return_value={'elements': [row], 'remark': 'partial'})):
            result = await attractions('mumbai')
            self.assertEqual(result['status'], 'partial')
            self.assertGreaterEqual(len(result['results']), 13)
        CACHE.clear()
        with patch('backend.attractions._overpass_json', AsyncMock(side_effect=HTTPException(504, 'Timed out'))):
            result = await attractions('mumbai')
            self.assertEqual(len(result['results']), 12)
            self.assertIn('curated catalogue', result['warning'])
        CACHE.clear()
        with patch('backend.attractions._overpass_json', AsyncMock(return_value={'html': 'invalid'})):
            result = await attractions('mumbai')
            self.assertEqual(len(result['results']), 12)

    async def test_both_catalogues_have_complete_source_coordinates_and_categories(self):
        for city_id, expected in [('mumbai', 12), ('bengaluru', 12)]:
            rows = curated_attractions(city_id)
            self.assertEqual(len(rows), expected)
            for row in rows:
                self.assertTrue(row['id'] and row['source_url'] and row['category'])
                self.assertTrue(-90 <= row['coordinates']['latitude'] <= 90)
                self.assertTrue(-180 <= row['coordinates']['longitude'] <= 180)
                self.assertTrue(row['metadata']['description'])

    def test_aliases_and_unsupported_city(self):
        self.assertEqual(resolve_city_id('Bangalore'), 'bengaluru')
        self.assertEqual(resolve_city_id(' Bengaluru '), 'bengaluru')
        self.assertIsNone(resolve_city_id('delhi'))

    def test_curated_and_live_duplicates_are_removed(self):
        curated = curated_attractions('mumbai')
        live = [{'id': 'osm-way-1', 'name': 'Gateway of India', 'coordinates': curated[0]['coordinates'], 'metadata': {}, 'category': 'heritage', 'visit_minutes': 45, 'duration_basis': 'estimate', 'source': 'OpenStreetMap', 'source_url': 'https://www.openstreetmap.org', 'attribution': 'OSM', 'editorial_priority': 99, 'priority_explanation': 'live'}]
        self.assertEqual(len(merge_attractions(curated, live)), len(curated))

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

    def test_unsupported_city_is_not_substituted(self):
        self.assertIsNone(resolve_city_id('unknown'))

    async def test_both_city_plans_rank_curated_recommendations(self):
        leg = {'duration_seconds': 60, 'geometry': {'coordinates': [[77.59, 12.97], [77.60, 12.98]]}}
        with patch('backend.attractions._overpass_json', AsyncMock(return_value={'elements': []})), patch('backend.city_guide.route', AsyncMock(return_value=leg)):
            for city_id in ('mumbai', 'bengaluru'):
                result = await attractions(city_id)
                planned = await plan(GuideRequest(city_id=city_id, available_minutes=240, departure='2026-11-01T09:00:00+05:30'), result['results'])
                self.assertEqual(len(planned['recommendations']), 12)
                self.assertTrue(planned['recommendations'][0]['source_url'])
