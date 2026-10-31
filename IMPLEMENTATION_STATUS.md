# Implementation status

This is an incomplete MVP. Endpoint existence alone is not end-to-end verification.

## Journey enhancement integration — 2026-10-31

Integrated on `feat/astra-journey-enhancements`, based on `backend-audit-baseline` commit `7883dcaf800724999c6dfdb2a27662f0a8374a90`.

- Preserved HeiGIT configuration, string-coordinate normalization, authentication handling, dotenv loading, readiness reporting, saved places, itineraries, guest trips, migrations, and their regression tests.
- Added bounded checkpoint count/spacing, cumulative distance, elapsed-time metadata, stable checkpoint indexes, typed journey response models, and frontend journey invalidation/checkpoint cleanup.
- Preserved the baseline weather cache, five-request concurrency limit, partial-failure behavior, and `unavailable` compatibility status. Batched multi-location weather and route reuse remain deferred because they require a larger provider/test-seam redesign.
- Verification: 44 backend tests passed (43 baseline plus one new checkpoint test), 10 Node tests passed, 29 Vitest tests passed, TypeScript typecheck passed, production build passed, and `git diff --check` passed. Live routing and browser/provider smoke tests remain unverified without a routing credential.

## Current source assessment — 2026-10-31

This section supersedes the historical continuation and table below. The current checkout contains the unified FastAPI application, saved-place persistence/migration, itinerary generation and saving, opening-hours integration, and POI route sampling capped at twelve points. They are implemented and covered by mocked-provider/API tests; this does not establish live provider or browser verification.

| Workflow | Current evidence and limitations |
|---|---|
| Search, selection and 2D/3D mapping | Shared App state, typed search adapter, MapLibre/Cesium cleanup tests; live imagery/provider checks remain manual |
| Routes and journeys | HeiGIT normalization, five default checkpoints and API count/spacing options, cache/concurrency and partial-weather tests; credentials required for real routing |
| Trips and saved places | SQLAlchemy guest-scoped CRUD and migration tests; saved-place frontend updates optimistically with visible persistence failures and a guard against late initial-load overwrites |
| Itineraries | Ordered stops, visits/breaks, opening-hours checks, budget and partial-routing tests; UI retains generated results and now reports failed persistence |
| Solar | UTC calculation API tested; changing selection/date can leave an old displayed result until recalculation |
| Opening hours and POIs | Location-timezone schedule evaluation, Overpass bounds/retries/cache and sampled corridor tests |
| Outstanding features | Transit, traffic, departure comparison, historical weather and route reuse are not implemented |

Reliability repairs in this continuation: journey input invalidation now aborts the previous request and resets its ownership, preventing a late response from restoring an old route; itinerary persistence checks HTTP errors; README startup now consistently uses `backend.main:app` on 127.0.0.1:3002. MapLibre is already imported as an installed dependency and required no package change. No database or lifecycle changes were made.

Saved-place load/save/delete failures now produce visible retry guidance, and a revision guard prevents an initial load from overwriting local edits. Search recovery text now names the FastAPI backend. Regression verification: 44 backend unittest methods, 10 Node tests, 32 Vitest tests, compileall, typecheck and production build pass with mocked external providers. Browser/live-provider acceptance remains outstanding; no routing key or repository `.env` was present in this worktree. No commit or push was performed.

## Historical continuation (superseded)

- POI discovery: PARTIALLY_COMPLETED. Bounded Overpass nearby queries, five-point sampled along-route queries, caching, category controls and markers in both maps are implemented. Live verification and clustering remain.
- Personalised modes: PARTIALLY_COMPLETED. Four reusable category presets exist; routing preferences and richer ranking remain.
- Opening hours: PARTIALLY_COMPLETED. Installed opening-hours-py parser evaluates location timezone with explicit unknown/missing states; UI permits a selected timestamp. Itinerary integration remains.
- Journey timeline: PARTIALLY_COMPLETED. UI calls simulation and selects checkpoints on the shared map. Departure comparison and persisted timeline state remain.
- Guest isolation: automated tests verify another visitor cannot read, update or delete a trip.
- Live environment: port 3002 was serving the old solar-only API, with `/api/v1/health` returning 404. Attempts to replace it encountered a persistent port binding even after its reported PID exited. Live browser flows have not been verified in this continuation.
- Routing credential: HEIGIT_API_KEY was absent from the inspected process environment. No real route success is claimed.

The older table below records an earlier baseline, not the current feature inventory. Use the current source assessment above.

| Feature | Status | Evidence / remaining work |
|---|---|---|
| Existing MapLibre/Cesium views | COMPLETED | Existing implementation retained; production build passes |
| FastAPI search and solar consolidation | PARTIALLY_COMPLETED | Compatibility routes and proxy added; live startup/browser regression verification pending |
| SQLAlchemy and Alembic | PARTIALLY_COMPLETED | Initial trips migration applied; persistence/access-control tests pending |
| Driving/walking/cycling/wheelchair routes | PARTIALLY_COMPLETED | ORS adapter and planner/map integration present; missing-key and validation tests pass; real provider verification requires HEIGIT_API_KEY |
| Public transport | NOT_IMPLEMENTED | Explicit unavailable response only; no transit adapter or coverage integration |
| Guest trip CRUD | PARTIALLY_COMPLETED | Owner-scoped backend and save/load/delete UI; full editor, timestamps, stop UI and browser verification pending |
| Weather | PARTIALLY_COMPLETED | Point forecast adapter with explicit horizon states; caching, history, tests and UI pending |
| Journey simulation | PARTIALLY_COMPLETED | Distance-based checkpoint backend; timeline UI and tests pending |
| POIs and along-route discovery | NOT_IMPLEMENTED | Provider integration and UI remain |
| Opening hours | NOT_IMPLEMENTED | Parser, local timezone evaluation and UI remain |
| Accessibility information | PARTIALLY_COMPLETED | Wheelchair route request supported; place tags, preferences UI and confidence evaluation remain |
| Personalised modes | NOT_IMPLEMENTED | Presets and discovery integration remain |
| Tourist itinerary | NOT_IMPLEMENTED | Real-route budget planner and editor remain |
| Departure comparison | NOT_IMPLEMENTED | API and UI remain |
| Persistent saved places | NOT_IMPLEMENTED | Existing React memory state retained |
| Full trip overview and refresh | NOT_IMPLEMENTED | Only loading route endpoints and recalculating is supported |

## Local setup for current implementation

From repository root:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
$env:HEIGIT_API_KEY = 'your-key'
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --port 3002
```

In another terminal: `npm run dev`. Restart Vite after the proxy change. Stop the old solar-only process on port 3002 before starting the canonical app. The Node backend remains in the repository but is no longer the proxy target.

`DATABASE_URL` defaults to `sqlite:///terrene.db`. Guest ownership is stored as a hash of an HttpOnly, SameSite=Strict cookie. Clearing cookies loses access; this is not an account recovery system. SQLite database files and Python caches are ignored by Git.

Provider references: https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options and https://open-meteo.com/en/docs . Open-Meteo public service is for noncommercial use; review provider terms before deployment. Wheelchair routes depend on mapped data and are not accessibility guarantees.
