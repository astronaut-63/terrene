import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from backend.places import normalize, nearby, along_route, Corridor, cache, MAX_ROUTE_SAMPLES

class PlacesTests(unittest.IsolatedAsyncioTestCase):
    def test_normalize(self):
        data = normalize([{'type':'node','id':1,'lat':19,'lon':72,'tags':{'name':'Library','opening_hours':'24/7'}}, {'type':'node','id':2,'tags':{}}, {'type':'node','id':3,'center':{'lat':'bad','lon':72}}, {'type':'node','id':1,'lat':19,'lon':72,'tags':{}}])
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['accessibility'],'unknown')
        self.assertEqual(data[0]['metadata']['opening_hours'],'24/7')

    async def test_category_validation(self):
        with self.assertRaises(HTTPException):
            await nearby(19,72,'invalid',1000)

    async def test_corridor_deduplicates(self):
        with patch('backend.places.nearby',AsyncMock(return_value={'results':[{'id':'a'}]})) as provider:
            result = await along_route(Corridor(points=[{'latitude':19,'longitude':72},{'latitude':18,'longitude':73}]))
            self.assertEqual(result['results'],[{'id':'a'}])
            self.assertEqual(provider.await_count,MAX_ROUTE_SAMPLES)
            self.assertIn('not an exhaustive corridor search', result['coverage'])

    async def test_corridor_uses_distance_sampling_and_keeps_other_samples(self):
        calls = 0
        async def provider(*args):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise TimeoutError('one sample failed')
            return {'results': [{'id': f'place-{calls}'}, {'id': 'shared'}]}
        with patch('backend.places.nearby', side_effect=provider):
            result = await along_route(Corridor(points=[{'latitude':19,'longitude':72},{'latitude':19.1,'longitude':72.1}]))
        self.assertLessEqual(calls, MAX_ROUTE_SAMPLES)
        self.assertEqual(len({place['id'] for place in result['results']}), len(result['results']))
        self.assertIn('shared', {place['id'] for place in result['results']})

    async def test_nearby_provider_errors_and_empty_results(self):
        cache.clear()
        with patch('backend.places.httpx.AsyncClient') as client:
            client.return_value.__aenter__ = AsyncMock()
            client.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.return_value.__aenter__.return_value
            response.post = AsyncMock(return_value=type('Response', (), {'status_code': 200, 'raise_for_status': lambda self: None, 'json': lambda self: {'elements': []}})())
            result = await nearby(19, 72, 'tourism', 1000)
            self.assertEqual(result['results'], [])
            response.post = AsyncMock(return_value=type('Response', (), {'status_code': 200, 'raise_for_status': lambda self: None, 'json': lambda self: []})())
            with self.assertRaises(HTTPException) as malformed:
                await nearby(19, 74, 'tourism', 1000)
            self.assertEqual(malformed.exception.status_code, 502)
            response.post = AsyncMock(side_effect=__import__('httpx').TimeoutException('timeout'))
            with self.assertRaises(HTTPException) as error:
                await nearby(19, 73, 'tourism', 1000)
            self.assertEqual(error.exception.status_code, 504)

    async def test_nearby_rate_limit_and_server_errors_retry_once(self):
        cache.clear()
        with patch('backend.places.httpx.AsyncClient') as client, patch('backend.places.asyncio.sleep', AsyncMock()):
            client.return_value.__aenter__ = AsyncMock()
            client.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.return_value.__aenter__.return_value
            response.post = AsyncMock(side_effect=[type('Response', (), {'status_code': 429})(), type('Response', (), {'status_code': 429})()])
            with self.assertRaises(HTTPException) as rate:
                await nearby(19, 75, 'tourism', 1000)
            self.assertEqual(rate.exception.status_code, 429)
            self.assertEqual(response.post.await_count, 2)
            cache.clear()
            response.post = AsyncMock(side_effect=[type('Response', (), {'status_code': 503})(), type('Response', (), {'status_code': 503})()])
            with self.assertRaises(HTTPException) as outage:
                await nearby(19, 77, 'tourism', 1000)
            self.assertEqual(outage.exception.status_code, 503)

    async def test_endpoint_override_and_request_headers(self):
        cache.clear()
        with patch.dict('os.environ', {'OVERPASS_API_URL': 'https://overpass.example.test/api/interpreter'}), patch('backend.places.httpx.AsyncClient') as client:
            client.return_value.__aenter__ = AsyncMock()
            client.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.return_value.__aenter__.return_value
            response.post = AsyncMock(return_value=type('Response', (), {'status_code': 200, 'raise_for_status': lambda self: None, 'json': lambda self: {'elements': []}})())
            await nearby(19, 78, 'tourism', 1000)
            self.assertEqual(response.post.call_args.args[0], 'https://overpass.example.test/api/interpreter')
            self.assertEqual(response.post.call_args.kwargs['headers']['Accept'], 'application/json')

    async def test_nearby_success_parses_invalid_entries_and_empty_success(self):
        cache.clear()
        with patch('backend.places.httpx.AsyncClient') as client:
            client.return_value.__aenter__ = AsyncMock()
            client.return_value.__aexit__ = AsyncMock(return_value=None)
            response = client.return_value.__aenter__.return_value
            response.post = AsyncMock(return_value=type('Response', (), {'status_code': 200, 'raise_for_status': lambda self: None, 'json': lambda self: {'elements': [{'type': 'node', 'id': 1, 'lat': 19, 'lon': 72, 'tags': {'name': 'Valid'}}, {'type': 'node', 'id': 2, 'tags': {}}]}})())
            result = await nearby(19, 76, 'tourism', 1000)
            self.assertEqual([place['name'] for place in result['results']], ['Valid'])

    async def test_corridor_all_failed_is_unavailable(self):
        with patch('backend.places.nearby', AsyncMock(side_effect=HTTPException(504, 'Timeout'))):
            with self.assertRaises(HTTPException) as error:
                await along_route(Corridor(points=[{'latitude': 19, 'longitude': 72}, {'latitude': 19.01, 'longitude': 72.01}]))
        self.assertEqual(error.exception.status_code, 503)

    async def test_corridor_empty_success_is_not_failure(self):
        with patch('backend.places.nearby', AsyncMock(return_value={'results': []})):
            result = await along_route(Corridor(points=[{'latitude': 19, 'longitude': 72}, {'latitude': 19.01, 'longitude': 72.01}]))
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['failed_samples'], 0)
        self.assertEqual(result['results'], [])

    async def test_corridor_partial_failure_is_explicit(self):
        with patch('backend.places.nearby', AsyncMock(side_effect=[{'results': [{'id': 'kept'}]}, HTTPException(503, 'Unavailable')])):
            result = await along_route(Corridor(points=[{'latitude': 19, 'longitude': 72}, {'latitude': 19.001, 'longitude': 72.001}]))
        self.assertEqual(result['status'], 'partial')
        self.assertEqual(result['failed_samples'], 1)
        self.assertEqual(result['successful_samples'], 1)
        self.assertEqual(result['results'], [{'id': 'kept'}])
        self.assertTrue(result['warning'])
