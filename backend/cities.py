"""Supported City Guide registry. Bounds are practical search extents, not borders."""
CITIES = {'mumbai': {'id': 'mumbai', 'name': 'Mumbai', 'country': 'India',
    'center': {'latitude': 19.054999, 'longitude': 72.8692035},
    'bbox': [18.894999, 19.214999, 72.7092035, 73.0292035],
    'timezone': 'Asia/Kolkata', 'source': 'https://www.openstreetmap.org/node/16173235',
    'coverage': 'Nominatim city search extent verified 2026-10-31. Not an administrative boundary; excludes distant metropolitan attractions. OSM coverage and opening hours are incomplete.'},
    'bengaluru': {'id': 'bengaluru', 'name': 'Bengaluru (Bangalore)', 'country': 'India',
    'center': {'latitude': 12.971599, 'longitude': 77.594566},
    'bbox': [12.88, 13.15, 77.50, 77.72],
    'timezone': 'Asia/Kolkata', 'source': 'https://www.openstreetmap.org/relation/673504',
    'coverage': 'Practical Nominatim attraction-search extent verified 2026-10-31. Not an administrative boundary; excludes distant metropolitan attractions. OSM coverage and opening hours are incomplete.'}}

CITY_ALIASES = {'mumbai': 'mumbai', 'bengaluru': 'bengaluru', 'bangalore': 'bengaluru'}


def resolve_city_id(city_id: str) -> str | None:
    return CITY_ALIASES.get(city_id.strip().casefold())
