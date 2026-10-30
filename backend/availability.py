from fastapi import APIRouter
from pydantic import BaseModel, AwareDatetime, Field
from opening_hours import OpeningHours, ParserError
from zoneinfo import ZoneInfo
from backend.routing import Point

router = APIRouter(prefix='/api/v1/places')
class AvailabilityRequest(BaseModel):
    coordinates: Point
    schedule: str | None = Field(default=None, max_length=2048)
    timestamp: AwareDatetime

@router.post('/availability')
def availability(body: AvailabilityRequest):
    status = 'not_provided'
    if body.schedule:
        try:
            hours = OpeningHours(body.schedule, coords=(body.coordinates.latitude, body.coordinates.longitude))
            state, _comment = hours.state(body.timestamp.astimezone(ZoneInfo('UTC')))
            status = str(state)
            if status not in ('open', 'closed', 'unknown'):
                status = 'unknown'
        except (ValueError, TypeError, ParserError):
            status = 'unknown'
    return {'status':status, 'schedule':body.schedule, 'timestamp':body.timestamp.isoformat(), 'basis':'Published schedule evaluated in the location timezone; exceptional closures may be unrecorded.'}
