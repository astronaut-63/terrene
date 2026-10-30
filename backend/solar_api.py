"""Terrene solar API using the NOAA-style solar position equations.

Run with: python -m uvicorn backend.solar_api:app --reload --port 3002
"""
from __future__ import annotations

import math
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Query

app = FastAPI(title="Terrene Solar API", version="1.0.0")
UTC = timezone.utc
ZENITH = math.radians(90.833)  # atmospheric refraction + solar radius


def _validate_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(400, "date must be a valid YYYY-MM-DD calendar date") from exc


def _validate_coordinate(name: str, value: float, low: float, high: float) -> float:
    if not math.isfinite(value) or not low <= value <= high:
        raise HTTPException(400, f"{name} must be between {low:g} and {high:g}")
    return value


def _iso(day: date, minutes: float) -> str:
    return (datetime(day.year, day.month, day.day, tzinfo=UTC) + timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


def _solar_terms(day: date, latitude: float, longitude: float) -> tuple[float, float, float, float]:
    n = day.timetuple().tm_yday
    gamma = 2 * math.pi / 365 * (n - 1)
    declination = (0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma)
                  - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma)
                  - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma))
    equation_of_time = 229.18 * (0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma)
                                 - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma))
    noon = 720 - 4 * longitude - equation_of_time
    cosine = (math.cos(ZENITH) / (math.cos(math.radians(latitude)) * math.cos(declination))
              - math.tan(math.radians(latitude)) * math.tan(declination))
    return declination, equation_of_time, noon, cosine


def _position(day: date, lat: float, lon: float, when: datetime) -> tuple[float, float]:
    n = day.timetuple().tm_yday
    gamma = 2 * math.pi / 365 * (n - 1 + (when.hour + when.minute / 60) / 24)
    decl = 0.006918 - 0.399912 * math.cos(gamma) + 0.070257 * math.sin(gamma) - 0.006758 * math.cos(2 * gamma) + 0.000907 * math.sin(2 * gamma) - 0.002697 * math.cos(3 * gamma) + 0.00148 * math.sin(3 * gamma)
    eqtime = 229.18 * (0.000075 + 0.001868 * math.cos(gamma) - 0.032077 * math.sin(gamma) - 0.014615 * math.cos(2 * gamma) - 0.040849 * math.sin(2 * gamma))
    minutes = when.hour * 60 + when.minute + when.second / 60
    hour_angle = math.radians((minutes + eqtime + 4 * lon - 720) / 4)
    lat_r = math.radians(lat)
    elevation = math.degrees(math.asin(math.sin(lat_r) * math.sin(decl) + math.cos(lat_r) * math.cos(decl) * math.cos(hour_angle)))
    azimuth = (math.degrees(math.atan2(math.sin(hour_angle), math.cos(hour_angle) * math.sin(lat_r) - math.tan(decl) * math.cos(lat_r))) + 180) % 360
    return elevation, azimuth


@app.get("/api/health")
def health() -> dict[str, object]:
    return {"ok": True, "service": "terrene-solar-api"}


@app.get("/api/solar")
def solar(lat: float = Query(...), lon: float = Query(...), date: str = Query(...), timestamp: Optional[str] = Query(None)) -> dict[str, object]:
    day = _validate_date(date)
    lat = _validate_coordinate("latitude", lat, -90, 90)
    lon = _validate_coordinate("longitude", lon, -180, 180)
    declination, equation_of_time, noon, cosine = _solar_terms(day, lat, lon)
    result: dict[str, object] = {
        "date": day.isoformat(), "latitude": lat, "longitude": lon, "timezone": "UTC",
        "solar_noon_utc": _iso(day, noon), "sunrise_utc": None, "sunset_utc": None,
        "day_length_seconds": None, "sunrise_sunset_defined": False,
        "solar_elevation_degrees": None, "solar_azimuth_degrees": None,
        "observation_utc": timestamp or _iso(day, noon),
        "units": {"angles": "degrees", "day_length": "seconds", "times": "ISO 8601 UTC"},
        "accuracy": "Approximate NOAA solar equations; typically within a few minutes for sunrise/sunset. Ignores terrain, weather and local civil-time rules.",
    }
    if cosine > 1:
        result["condition"] = "polar-night"
    elif cosine < -1:
        result["condition"] = "polar-day"
    else:
        hour_angle = math.degrees(math.acos(cosine))
        sunrise = 720 - 4 * (lon + hour_angle) - equation_of_time
        sunset = 720 - 4 * (lon - hour_angle) - equation_of_time
        result.update(sunrise_utc=_iso(day, sunrise), sunset_utc=_iso(day, sunset), day_length_seconds=round((sunset - sunrise) * 60), sunrise_sunset_defined=True)
    try:
        observation = datetime.fromisoformat(timestamp.replace("Z", "+00:00")) if timestamp else datetime.fromtimestamp(datetime.fromisoformat(result["solar_noon_utc"].replace("Z", "+00:00")).timestamp(), tz=UTC)
        if observation.tzinfo is None:
            raise ValueError
        observation = observation.astimezone(UTC)
    except (AttributeError, ValueError) as exc:
        raise HTTPException(400, "timestamp must be a valid ISO 8601 timestamp") from exc
    elevation, azimuth = _position(day, lat, lon, observation)
    result["observation_utc"] = observation.isoformat().replace("+00:00", "Z")
    result["solar_elevation_degrees"] = round(elevation, 3)
    result["solar_azimuth_degrees"] = round(azimuth, 3)
    return result
