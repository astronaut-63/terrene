"""Canonical API entry point; legacy solar endpoints remain compatible."""
# Load repository-local backend configuration before importing routers that read it.
from backend import config as _config  # noqa: F401

import logging
from fastapi import Request
from fastapi.responses import JSONResponse
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from backend.database import engine, Base

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
    capabilities = {'routing': routing_configuration(), 'discovery': {'configured': True, 'availability': 'checked_on_request'},
                    'weather': {'configured': True, 'availability': 'checked_on_request'},
                    'geocoding': {'configured': True, 'availability': 'checked_on_request'}}
    try:
        with engine.connect() as connection:
            connection.execute(text('SELECT 1'))
            schema = inspect(connection)
            for table in Base.metadata.sorted_tables:
                if not schema.has_table(table.name):
                    raise ValueError('Missing schema')
                actual = {c['name'] for c in schema.get_columns(table.name)}
                if not {c.name for c in table.columns} <= actual:
                    raise ValueError('Incomplete schema')
    except (SQLAlchemyError, ValueError):
        return JSONResponse(status_code=503, content={'ok': False, 'service': 'terrene-api', 'database': 'unavailable_or_schema_missing', 'capabilities': capabilities})
    return {'ok': True, 'service': 'terrene-api', 'database': 'ready', 'routing_provider': routing_configuration(), 'capabilities': capabilities}


@app.exception_handler(SQLAlchemyError)
async def database_failure(request: Request, error: SQLAlchemyError):
    logging.getLogger(__name__).error('operation=database path=%s outcome=%s', request.url.path, type(error).__name__)
    return JSONResponse(status_code=503, content={'detail': 'Storage is temporarily unavailable. Please retry; your change was not confirmed.'})
