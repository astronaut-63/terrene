# Journey simulation: implementation and frontend contract

Verified on 2026-10-31. This is an MVP approximation, not a traffic or road-accessibility simulation.

## Inspection and acceptance criteria

The initial working tree was clean. The existing POST endpoint calculated an ORS route, sampled five checkpoints using cumulative haversine distance, and fetched Open-Meteo separately and sequentially. It lacked journey tests, robust geometry/duration validation, route reuse, caching, and distinct weather failure states. The timeline consumed `route.geometry`, `checkpoints`, and a string `limitations`; it already converted browser-local departure input into an ISO UTC timestamp. Trips persist owner-scoped route requests only; simulation checkpoints are not persisted. No migrations or ownership changes were needed.

Acceptance criteria used: keep those public fields and endpoints, sample actual geometry including endpoints, make elapsed time/distance monotonic, finish at the provider duration, reject unusable input, bound workload, preserve routes through weather failures, and cover the provider/API/UI boundaries with deterministic tests.

## Endpoints and request

- `POST /api/v1/journeys/simulate`: existing endpoint, additive request/response fields.
- `GET /api/v1/weather/point?latitude=...&longitude=...&timestamp=...`: same adapter/cache and explicit availability states.
- `POST /api/v1/routes`: existing endpoint, now validates returned geometry, distance, and duration.
- `/docs` and `/openapi.json`: generated Pydantic contracts.

Example simulation request (replace departure with your desired time):

```json
{
  "origin": {"latitude": 52.52, "longitude": 13.405},
  "destination": {"latitude": 52.5163, "longitude": 13.3777},
  "mode": "walking",
  "departure": "2026-10-31T12:00:00+05:30",
  "checkpoint_count": 5
}
```

Supported modes remain driving, walking, cycling, wheelchair. Transit returns 503, including when a route is supplied. Existing route request fields, including up to eight intermediate stops and wheelchair incline, still apply to calculated routes. Stops are waypoints, not dwell-time requests.

Optional `route` accepts the object returned by `/api/v1/routes`; supply geometry, `distance_m`, and `duration_seconds` together. This skips routing completely and does not require a key. The frontend may keep that complete object in state for future reuse; its current journey form still calculates a fresh route. Supplied routes must start/end within 1 km of the named request locations to allow provider snapping. Do not also pass stops: they must already be represented in the supplied geometry. The API cannot verify that a supplied route is traversable or that its stated duration matches the selected mode.

`checkpoint_count`: integer 2–25, defaults to 5. Alternatively, `checkpoint_spacing_m`: 100–1,000,000 metres. Both together are invalid. Spacing includes the destination after the final full interval; if this exceeds 25 checkpoints, return 422 rather than silently changing spacing.

Departure requires an explicit offset or `Z`; naive datetimes return 422. Calculations and responses use UTC. The browser converts its local datetime input to UTC and displays responses in the browser timezone. No geographic timezone is inferred from coordinates. A UTC-unrepresentable departure/arrival returns 422.

## Geometry, timing, and response

GeoJSON is `LineString` with `[longitude, latitude]` pairs, at least two and at most 100,000 coordinates. Coordinates and route totals must be finite and in bounds. Routes are limited to 40,000 km and 30 days duration. Moving routes require positive distance and duration; no guessed-speed fallback is used. Missing duration is a 422 for supplied routes or 502 for provider data. Coincident routes require zero distance/duration and return one checkpoint representing both endpoints. Very short routes reduce interior samples to avoid sub-metre clustering while retaining distinct endpoints.

The engine sums spherical haversine segment lengths (Earth radius 6,371,000 m), then uses cumulative-distance lookup and spherical interpolation within each segment. It handles repeated vertices and the antimeridian; ambiguous antipodal segments are rejected. This is a spherical approximation, not an ellipsoidal survey measurement. Geometry resolution limits precision. Complexity is O(vertices + checkpoints × log(vertices)); geometry is returned once, never copied per checkpoint.

Elapsed seconds = provider total duration × cumulative geometry distance / total geometry distance. Arrival = absolute UTC departure + elapsed seconds. This apportions duration by distance without claiming knowledge of segment speed, traffic, closures, or stops.

Response fields:

| Field | Meaning |
|---|---|
| `route` | Validated geometry, original provider distance/duration, attribution, instructions, accessibility and limitations |
| `origin`, `destination`, `mode` | Requested endpoints and mode; geometry endpoints may be provider-snapped |
| `departure`, `arrival` | Absolute ISO timestamps, UTC |
| `duration_seconds` | Validated total route duration |
| `geometry_distance_m` | Sum of geometry segment distances, used for checkpoint spacing; can differ from provider `route.distance_m` |
| `route_source` | `provider` or `supplied` |
| `checkpoints` | Ordered points, described below |
| `limitations` | Existing string field retained for the timeline |
| `timing_method`, `coordinate_order`, `timezone` | Explicit interpretation metadata |

Each checkpoint has stable zero-based `index`, named `coordinates.latitude/longitude`, `progress` (0–1), cumulative `distance_m`, `elapsed_seconds`, `arrival`, and `weather`. A zero-length checkpoint uses progress 0 and arrival equal to departure.

Validation failures use FastAPI's existing `{ "detail": ... }` envelope and HTTP 422. Routing configuration/transit failures use 503, provider timeout 504, provider rate limiting 429, and malformed/failed routing responses 502. Weather failure alone returns HTTP 200 with a valid route and per-checkpoint statuses.

## Weather semantics and reliability

The existing adapter now uses Open-Meteo's standard best-match forecast product with `forecast_days=16`, `timezone=GMT`, Celsius, km/h wind, and mm precipitation explicitly selected. Multi-location requests combine cache misses into one call per simulation, at most 25 locations. An application-scoped HTTP client reuses connections; a semaphore bounds concurrent provider batches to three per application worker. Connect/pool timeout is 4 seconds, read/write timeout 12 seconds. There are no automatic retries.

Exact coordinate plus current UTC date keys a 128-entry LRU cache, with a ten-minute monotonic TTL and original retrieval timestamp. Successful hourly products with at least one finite measurement can be cached; failures, malformed products, and all-null products are not cached. Concurrent identical cold misses may issue duplicate bounded requests; there is no distributed cache or cross-worker rate limiter.

Before requesting, dates before the current UTC date are historical/unavailable; dates after today + 15 days are outside the requested product window. Earlier hours of today can be returned as forecast data, never labelled observations. The actual returned hourly timestamps determine coverage within that window. The arrival time selects the containing UTC hour (floor); there is no temporal interpolation. `timestamp` is the requested arrival and `forecast_timestamp` is the actual selected hour. Variables retain the provider's hourly semantics: precipitation can describe the preceding hour, rather than an instantaneous value.

Every weather object consistently includes status, nullable reason, source, kind, eight nullable numeric measurements under `values`, units, requested timestamp, nullable forecast timestamp and nullable retrieved-at timestamp. Measurements: temperature, apparent temperature, precipitation, precipitation probability, wind speed, wind direction, cloud cover, WMO weather code.

| Status | Meaning |
|---|---|
| `available` | All eight finite measurements available |
| `partially_available` | Some finite measurements; others null (existing status name retained) |
| `beyond_forecast_horizon` | Outside the requested window or actual returned timestamp coverage (existing status name retained) |
| `historical_data_unavailable` | Earlier UTC date; historical product not configured |
| `provider_error` | HTTP error, timeout, malformed JSON/product or mismatched location batch |
| `no_data` | Missing hour inside coverage, or all measurements null |

Previously several of these states were all `unavailable`; clients should now handle the explicit states above. No unavailable measurement is represented as zero. One malformed location in a correctly sized batch does not discard other locations. A failed batch marks its locations as provider errors without failing the journey.

Provider references: [Open-Meteo forecast documentation](https://open-meteo.com/en/docs) and [ORS directions documentation](https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/). Preserve Open-Meteo and ORS/OpenStreetMap attribution and review their terms before deployment.

## Changed files

- `backend/journeys.py`: request/response schemas, checkpoint geometry/timing, pooled batch weather adapter/cache, explicit failure states.
- `backend/routing.py`: reusable validated geometry/route models and validation at the ORS boundary.
- `backend/main.py`: creates and closes the weather client through application lifespan.
- `backend/test_journeys.py`: geometry, timing, weather, API, routing boundary, cache/concurrency and lifespan coverage.
- `src/JourneyExplorer.tsx`: additive response typing, stale-result cleanup, cancellation on unmount, weather reasons and forecast-hour display; existing map callback retained.
- `src/JourneyExplorer.test.tsx`: request timestamp, weather rendering, map selection, failed-refresh cleanup.
- `src/App.tsx` and `src/App.test.tsx`: remove temporary checkpoint markers/selection when a journey is invalidated, with an integration regression test.
- This guide and `IMPLEMENTATION_STATUS.md`: current evidence and integration instructions.

## Verification and local operation

From the repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s backend -p 'test_*.py' -v
npm test
npm run typecheck
npm run build
.\.venv\Scripts\python.exe -m alembic upgrade head
$env:HEIGIT_API_KEY = 'your-backend-key'
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --port 3002
```

In another terminal run `npm run dev`. Use the canonical FastAPI command above; `npm run dev:backend` still starts the legacy Node backend, which does not provide this journey API. Ensure port 3002 is free. Shell environment variables must actually be exported; the FastAPI app does not automatically load Vite's `.env.local`.

Use `/docs` to POST a journey, inspect checkpoints and explicit weather states, or copy a `/routes` response into the optional `route` field and change departure without a second routing call. In the app select two places, assign origin/destination, set departure and generate the timeline; select a checkpoint to focus the shared 2D/3D map. Change input or retry to verify stale route/timeline cleanup. Route reuse with a synthetic test geometry verifies computation only, not real route accessibility.

Automated results: 29 Python backend tests passed; `npm test` passed 10 Node tests plus 30 Vitest tests; production build passed (including TypeScript), with existing large map/globe chunk warnings. Python initially stalled in sandbox Windows socket-pair initialization, including a minimal asyncio reproduction; the complete suite passed outside the sandbox without test suppression. Provider calls in automated tests are mocked. Browser interaction with real map providers and a real ORS route has not been verified; HEIGIT_API_KEY was absent in the process environment.

Remaining scope: no traffic/closure data, historical weather, long-range extrapolation, dwell-time model, transit, persistence of simulations, location-based display timezone, or departure comparisons. Recommended next backend task: add a provider-configured deployment smoke test (health, one actual ORS route, one weather batch) and deployment-level request rate limits before broad public use.

Live provider check: a real Open-Meteo point request through WeatherService on 2026-10-31 returned available with all eight measurements and the expected UTC forecast hour. This does not verify a real routed journey or browser flow. Explicit npm run typecheck also passed.

