"""Canonical API entry point; legacy solar endpoints remain compatible."""
# Load repository-local backend configuration before importing routers that read it.
from backend import config as _config  # noqa: F401

from backend.solar_api import app, solar
from backend.search import router
from backend.routing import router as routing_router
from backend.trips import router as trips_router
from backend.journeys import router as journeys_router
from backend.places import router as places_router
from backend.availability import router as availability_router
from backend.saved_places import router as saved_places_router
from backend.itineraries import router as itineraries_router
from backend.routing import routing_configuration
from backend.city_guide import router as city_guide_router
app.include_router(city_guide_router)

app.include_router(router)
app.include_router(routing_router)
app.include_router(trips_router)
app.include_router(journeys_router)
app.include_router(places_router)
app.include_router(availability_router)
app.include_router(saved_places_router)
app.include_router(itineraries_router)
app.add_api_route('/api/v1/solar', solar, methods=['GET'])

@app.get('/api/v1/health')
def health():
    return {'ok': True, 'service': 'terrene-api'}

@app.get('/api/v1/ready')
def ready():
    return {'ok': True, 'service': 'terrene-api', 'routing_provider': routing_configuration()}
