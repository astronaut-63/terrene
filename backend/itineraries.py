from datetime import timedelta

from fastapi import APIRouter, HTTPException
from pydantic import AwareDatetime, BaseModel, Field

from backend.availability import AvailabilityRequest, availability
from backend.routing import Point, RouteRequest, route

router = APIRouter(prefix='/api/v1/itineraries')

class ItineraryStop(BaseModel):
    id: str = Field(min_length=1, max_length=256)
    name: str = Field(min_length=1, max_length=120)
    coordinates: Point
    visit_minutes: int = Field(default=30, ge=5, le=240)
    opening_hours: str | None = Field(default=None, max_length=2048)

class ItineraryRequest(BaseModel):
    origin: Point
    destination: Point | None = None
    stops: list[ItineraryStop] = Field(min_length=1, max_length=8)
    mode: str = Field(default='driving', pattern='^(driving|walking|cycling|wheelchair)$')
    departure: AwareDatetime
    available_minutes: int = Field(default=480, ge=1, le=1440)
    break_minutes: int = Field(default=0, ge=0, le=240)
    break_after_stop: int | None = Field(default=None, ge=1, le=8)

def _conflict(status: str):
    return status in {'closed', 'unknown', 'not_provided'}

@router.post('/generate')
async def generate(body: ItineraryRequest):
    current = body.origin
    current_time = body.departure
    elapsed_seconds = 0.0
    itinerary = []
    legs = []
    omitted = []
    warnings = []

    for index, stop in enumerate(body.stops, start=1):
        try:
            leg = await route(RouteRequest(origin=current, destination=stop.coordinates, mode=body.mode))
        except HTTPException as error:
            omitted.append({'id': stop.id, 'name': stop.name, 'reason': 'route_unavailable', 'detail': error.detail if isinstance(error.detail, str) else 'Route unavailable.'})
            warnings.append(f'Could not route to {stop.name}; it was omitted.')
            continue
        duration = float(leg['duration_seconds'])
        arrival = current_time + timedelta(seconds=duration)
        if elapsed_seconds + duration + stop.visit_minutes * 60 > body.available_minutes * 60:
            omitted.append({'id': stop.id, 'name': stop.name, 'reason': 'time_budget_exceeded'})
            warnings.append(f'{stop.name} was omitted because it exceeds the available time.')
            continue
        hours = availability(AvailabilityRequest(coordinates=stop.coordinates, schedule=stop.opening_hours, timestamp=arrival))
        if _conflict(hours['status']):
            warnings.append(f'{stop.name} has opening-hours status {hours["status"]}; verify before visiting.')
        visit_end = arrival + timedelta(minutes=stop.visit_minutes)
        item = {'id': stop.id, 'name': stop.name, 'coordinates': stop.coordinates.model_dump(), 'arrival': arrival.isoformat(), 'visit_start': arrival.isoformat(), 'visit_end': visit_end.isoformat(), 'visit_minutes': stop.visit_minutes, 'opening_hours': hours, 'travel_from_previous': {'distance_m': leg['distance_m'], 'duration_seconds': duration}}
        itinerary.append(item)
        legs.append(leg)
        elapsed_seconds += duration + stop.visit_minutes * 60
        current, current_time = stop.coordinates, visit_end
        if body.break_minutes and body.break_after_stop == index:
            break_end = current_time + timedelta(minutes=body.break_minutes)
            itinerary.append({'type': 'break', 'after_stop': stop.id, 'start': current_time.isoformat(), 'end': break_end.isoformat(), 'duration_minutes': body.break_minutes})
            elapsed_seconds += body.break_minutes * 60
            current_time = break_end

    if body.destination is not None and itinerary:
        try:
            final_leg = await route(RouteRequest(origin=current, destination=body.destination, mode=body.mode))
            final_duration = float(final_leg['duration_seconds'])
            if elapsed_seconds + final_duration <= body.available_minutes * 60:
                legs.append(final_leg)
                elapsed_seconds += final_duration
            else:
                warnings.append('The final destination was omitted because it exceeds the available time.')
        except HTTPException:
            warnings.append('The final destination route was unavailable.')
    if not itinerary or not any(item.get('type') != 'break' for item in itinerary):
        raise HTTPException(503, 'No itinerary stops could be routed.')
    return {'status': 'partial' if omitted else 'ok', 'origin': body.origin.model_dump(), 'destination': body.destination.model_dump() if body.destination else None, 'departure': body.departure.isoformat(), 'available_minutes': body.available_minutes, 'stops': itinerary, 'legs': legs, 'omitted_stops': omitted, 'warnings': warnings, 'total_duration_minutes': elapsed_seconds / 60, 'limitations': 'Stops are kept in the requested order; travel and visit durations are estimates, and opening-hours data is published information rather than a guarantee of operation.'}
