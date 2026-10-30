import unittest
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from backend.places import normalize, nearby, along_route, Corridor, cache

class PlacesTests(unittest.IsolatedAsyncioTestCase):
    def test_normalize(self):
        data = normalize([{'type':'node','id':1,'lat':19,'lon':72,'tags':{'name':'Library','opening_hours':'24/7'}}])
        self.assertEqual(data[0]['accessibility'],'unknown')
        self.assertEqual(data[0]['metadata']['opening_hours'],'24/7')

    async def test_category_validation(self):
        with self.assertRaises(HTTPException):
            await nearby(19,72,'invalid',1000)

    async def test_corridor_deduplicates(self):
        with patch('backend.places.nearby',AsyncMock(return_value={'results':[{'id':'a'}]})) as provider:
            result = await along_route(Corridor(points=[{'latitude':19,'longitude':72},{'latitude':18,'longitude':73}]))
            self.assertEqual(result['results'],[{'id':'a'}])
            self.assertEqual(provider.await_count,2)
