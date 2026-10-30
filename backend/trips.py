import hashlib
import secrets
import uuid
from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from backend.database import Session, Trip
from backend.routing import RouteRequest

router = APIRouter(prefix='/api/v1/trips')

class TripInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    plan: RouteRequest

def owner(request, response):
    token = request.cookies.get('terrene_guest')
    if not token:
        token = secrets.token_urlsafe(32)
        response.set_cookie('terrene_guest', token, httponly=True, samesite='strict', secure=request.url.scheme == 'https', max_age=86400 * 30)
    return hashlib.sha256(token.encode()).hexdigest()

def serialize(trip):
    return {'id': trip.id, 'name': trip.name, 'plan': trip.plan}

@router.get('')
def list_trips(request: Request, response: Response):
    identity = owner(request, response)
    with Session() as session:
        return {'trips': [serialize(t) for t in session.scalars(select(Trip).where(Trip.owner == identity))]}

@router.post('')
def create_trip(body: TripInput, request: Request, response: Response):
    trip = Trip(id=str(uuid.uuid4()), owner=owner(request, response), name=body.name, plan=body.plan.model_dump())
    with Session() as session:
        session.add(trip)
        session.commit()
        return serialize(trip)

def owned(session, trip_id, identity):
    trip = session.get(Trip, trip_id)
    if not trip or trip.owner != identity:
        raise HTTPException(404, 'Trip not found.')
    return trip

@router.get('/{trip_id}')
def get_trip(trip_id: str, request: Request, response: Response):
    with Session() as session:
        return serialize(owned(session, trip_id, owner(request, response)))

@router.put('/{trip_id}')
def update_trip(trip_id: str, body: TripInput, request: Request, response: Response):
    with Session() as session:
        trip = owned(session, trip_id, owner(request, response))
        trip.name, trip.plan = body.name, body.plan.model_dump()
        session.commit()
        return serialize(trip)

@router.delete('/{trip_id}')
def delete_trip(trip_id: str, request: Request, response: Response):
    with Session() as session:
        session.delete(owned(session, trip_id, owner(request, response)))
        session.commit()
        return {'deleted': True}
