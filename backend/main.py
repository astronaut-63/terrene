"""Canonical API entry point; legacy solar endpoints remain compatible."""
from backend.solar_api import app, solar
from backend.search import router
from backend.routing import router as routing_router
from backend.trips import router as trips_router
from backend.journeys import router as journeys_router, WeatherService
from contextlib import asynccontextmanager
import httpx
from backend.places import router as places_router
from backend.availability import router as availability_router

@asynccontextmanager
async def lifespan(app):
    async with httpx.AsyncClient(timeout=httpx.Timeout(12, connect=4, pool=4),
                                 limits=httpx.Limits(max_connections=3, max_keepalive_connections=3)) as client:
        app.state.weather_service = WeatherService(client)
        yield

app.router.lifespan_context = lifespan

app.include_router(router)
app.include_router(routing_router)
app.include_router(trips_router)
app.include_router(journeys_router)
app.include_router(places_router)
app.include_router(availability_router)
app.add_api_route('/api/v1/solar', solar, methods=['GET'])

@app.get('/api/v1/health')
def health():
    return {'ok': True, 'service': 'terrene-api'}

@app.get('/api/v1/ready')
def ready():
    return {'ok': True, 'service': 'terrene-api'}
