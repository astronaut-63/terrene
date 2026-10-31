from fastapi import APIRouter, Request, Response, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from backend.database import SavedPlace, Session
from backend.routing import Point
from backend.trips import owner

router = APIRouter(prefix='/api/v1/places/saved')

class SavedPlaceInput(BaseModel):
    id: str = Field(min_length=1, max_length=256)
    name: str = Field(min_length=1, max_length=120)
    displayName: str | None = Field(default=None, max_length=256)
    coordinates: Point

def serialize(place: SavedPlace):
    result = {'id': place.place_id, 'name': place.name, 'coordinates': {'latitude': place.latitude, 'longitude': place.longitude}}
    if place.display_name is not None:
        result['displayName'] = place.display_name
    return result

@router.get('')
def list_saved_places(request: Request, response: Response):
    identity = owner(request, response)
    with Session() as session:
        places = session.scalars(select(SavedPlace).where(SavedPlace.owner == identity).order_by(SavedPlace.name, SavedPlace.place_id)).all()
        return {'results': [serialize(place) for place in places]}

@router.post('')
def save_place(body: SavedPlaceInput, request: Request, response: Response):
    identity = owner(request, response)
    with Session() as session:
        place = session.get(SavedPlace, (identity, body.id))
        if place is None:
            place = SavedPlace(owner=identity, place_id=body.id, name=body.name.strip(), display_name=body.displayName, latitude=body.coordinates.latitude, longitude=body.coordinates.longitude)
            session.add(place)
        else:
            place.name = body.name.strip()
            place.display_name = body.displayName
            place.latitude = body.coordinates.latitude
            place.longitude = body.coordinates.longitude
        session.commit()
        return serialize(place)

@router.delete('/{place_id}')
def delete_saved_place(place_id: str, request: Request, response: Response):
    if not place_id or len(place_id) > 256:
        raise HTTPException(404, 'Saved place not found.')
    identity = owner(request, response)
    with Session() as session:
        place = session.get(SavedPlace, (identity, place_id))
        if place is None:
            raise HTTPException(404, 'Saved place not found.')
        session.delete(place)
        session.commit()
        return {'deleted': True}
