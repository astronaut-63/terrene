"""Deterministic importance ranking and bounded sequential route feasibility."""
from datetime import timedelta
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, AwareDatetime, model_validator
from backend.cities import CITIES
from backend.attractions import attractions
from backend.routing import Point, RouteRequest, route
from backend.availability import AvailabilityRequest, availability

router = APIRouter(prefix='/api/v1')
Category = Literal['museum', 'heritage', 'park', 'viewpoint', 'attraction']
class GuideRequest(BaseModel):
    city_id: str
    available_minutes: int = Field(ge=30, le=960)
    departure: AwareDatetime
    mode: Literal['driving', 'walking', 'cycling', 'wheelchair'] = 'walking'
    interests: list[Category] = Field(default_factory=list, max_length=5)
    origin: Point | None = None
    buffer_minutes: int = Field(default=10, ge=0, le=120)

    @model_validator(mode='after')
    def buffer_fits(self):
        if self.buffer_minutes > self.available_minutes: raise ValueError('Buffer must fit the available time.')
        return self

class CityData(BaseModel):
    id: str
    name: str
    country: str
    center: Point
    bbox: list[float] = Field(min_length=4, max_length=4)
    timezone: str
    source: str
    coverage: str

class AttractionData(BaseModel):
    id: str
    name: str
    coordinates: Point
    metadata: dict[str, str]
    category: Category
    visit_minutes: int
    duration_basis: str
    source: str
    attribution: str
    rank: int
    score: int
    reasons: list[str]
    feasibility: str
    travel_minutes: float | None
    opening_status: str

def importance(place, interests):
    tags = place['metadata']; score = 10; reasons = ['Mapped visitor attraction']
    for condition, weight, reason in [(bool(tags.get('heritage')), 40, 'Mapped heritage designation'), (bool(tags.get('wikidata')), 20, 'Wikidata reference'), (bool(tags.get('wikipedia')), 20, 'Wikipedia reference'), (place['category'] == 'museum', 15, 'Museum classification'), (place['category'] == 'heritage', 15, 'Historic classification'), (place['category'] in interests, 25, 'Matches your selected interests')]:
        if condition: score += weight; reasons.append(reason)
    return score, reasons

def ranked(places, interests):
    rows = []
    for place in places:
        score, reasons = importance(place, interests)
        rows.append({**place, 'score': score, 'reasons': reasons})
    rows.sort(key=lambda p: (-p['score'], p['id']))
    return [{**place, 'rank': i + 1} for i, place in enumerate(rows)]

class GuideResponse(BaseModel):
    city: CityData
    recommendations: list[AttractionData]
    selected: list[AttractionData]
    available_minutes: int
    travel_minutes: float
    visit_minutes: int
    buffer_minutes: int
    total_minutes: float
    remaining_minutes: float
    origin: Point
    departure: AwareDatetime
    mode: str
    geometry: dict | None
    warnings: list[str]
    attribution: str

@router.get('/cities/supported')
def supported(): return {'cities': list(CITIES.values())}

@router.get('/cities/{city_id}/attractions')
async def get_attractions(city_id: str): return await attractions(city_id)

async def plan(body, places):
    city = CITIES.get(body.city_id)
    if not city: raise HTTPException(404, 'City Guide is not available for this city yet.')
    origin = body.origin or Point(**city['center'])
    s, n, w, e = city['bbox']
    if not s <= origin.latitude <= n or not w <= origin.longitude <= e: raise HTTPException(422, 'Choose a starting point inside the supported city search area.')
    rows = ranked(places, body.interests)
    chosen, coordinates, warnings = [], [], []
    elapsed = float(body.buffer_minutes); travel = 0; visits = 0; previous = origin
    attempts = 0
    for item in rows:
        item.update({'feasibility': 'not_evaluated', 'travel_minutes': None, 'opening_status': 'unknown'})
        if len(chosen) >= 8 or attempts >= 12: continue
        if elapsed + item['visit_minutes'] > body.available_minutes:
            item['feasibility'] = 'time_budget_exceeded'; continue
        attempts += 1
        try:
            leg = await route(RouteRequest(origin=previous, destination=Point(**item['coordinates']), mode=body.mode))
        except HTTPException:
            item['feasibility'] = 'travel_unavailable'; continue
        minutes = leg['duration_seconds'] / 60
        item['travel_minutes'] = minutes
        arrival = body.departure + timedelta(minutes=elapsed + minutes)
        hours = availability(AvailabilityRequest(coordinates=Point(**item['coordinates']), schedule=item['metadata'].get('opening_hours'), timestamp=arrival))
        end_hours = availability(AvailabilityRequest(coordinates=Point(**item['coordinates']), schedule=item['metadata'].get('opening_hours'), timestamp=arrival + timedelta(minutes=item['visit_minutes'])))
        item['opening_status'] = hours['status']
        if 'closed' in {hours['status'], end_hours['status']}:
            item['feasibility'] = 'closed'; continue
        if elapsed + minutes + item['visit_minutes'] > body.available_minutes:
            item['feasibility'] = 'time_budget_exceeded'; continue
        item['feasibility'] = 'fits'; chosen.append(item); elapsed += minutes + item['visit_minutes']; travel += minutes; visits += item['visit_minutes']; previous = Point(**item['coordinates'])
        coordinates.extend(leg['geometry']['coordinates'][1:] if coordinates else leg['geometry']['coordinates'])
    if any(p['feasibility'] == 'travel_unavailable' for p in rows): warnings.append('Some travel times are unavailable. Those attractions remain in the ranked list but are not claimed to fit.')
    return {'city': city, 'recommendations': rows, 'selected': chosen, 'available_minutes': body.available_minutes, 'origin': origin, 'departure': body.departure, 'mode': body.mode, 'travel_minutes': travel, 'visit_minutes': visits, 'buffer_minutes': body.buffer_minutes, 'total_minutes': elapsed, 'remaining_minutes': body.available_minutes - elapsed, 'geometry': {'type': 'LineString', 'coordinates': coordinates} if len(coordinates) >= 2 else None, 'warnings': warnings + [city['coverage'], 'Order follows importance, not an optimal tour. Up to 12 sequential routing requests and 8 selected stops. Opening hours checked at arrival and departure; intermediate closures may be missed. No return journey included.'], 'attribution': '© OpenStreetMap contributors | openrouteservice by HeiGIT'}

@router.post('/city-guides/generate', response_model=GuideResponse)
async def generate(body: GuideRequest):
    data = await attractions(body.city_id)
    result = await plan(body, data['results'])
    if data['warning']: result['warnings'].append(data['warning'])
    if not data['results']: result['warnings'].append('Insufficient mapped attraction data for a guide.')
    return result
