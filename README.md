## Current frontend workspace, 31 October 2026

The routing/search repair adds location fields directly to Journey, Route and
Itinerary, plus a header search dropdown that preserves the active tool.
See [routing diagnosis, search behavior and verification](docs/ROUTING_SEARCH_REPAIR.md).

The application opens in the 2D map with persistent search and a collapsible tool sidebar. Routes, journeys and itineraries have separate route ownership; selection and camera context remain shared. Feature inputs survive navigation. Legal draft pages are at `/privacy` and `/terms`; the initial favicon is installed.

The frontend uses `src/services/apiClient.ts` and typed contracts. Keep the existing FastAPI backend `backend.main:app` running on port 3002 in a separate process; `npm run dev` starts only Vite. The compatibility Node server is not the canonical API backend.

Run `npm test`, `npm run typecheck` and `npm run build`. `npm run check:launch` intentionally fails until the domain and external release gates are completed. No deployment is authorized by this implementation.

- [Implementation and actual verification report](docs/FRONTEND_REPORT.md)
- [Production routing and launch gates](docs/PRODUCTION.md)
- [Provider integration review](docs/PROVIDER_REVIEW.md)

The historical sections below describe earlier stages; use the report above for the current status.

# Terrene

Backend migration in progress: Vite now proxies all `/api` requests to FastAPI on port 3002. Start `python -m uvicorn backend.main:app --port 3002` after installing `backend/requirements-dev.txt` and running `python -m alembic upgrade head`. Add backend credentials to the repository-root `.env` file and restart FastAPI. The older Node startup instructions below are retained as historical documentation; Node is no longer required by the current proxy. See [implementation status and current setup](IMPLEMENTATION_STATUS.md) for the exact completed scope and outstanding work.

On first setup, copy the example file if `.env` does not exist. The backend loads `.env` from the repository root automatically at startup; operating-system environment variables take precedence. Keep this file local and restart FastAPI after changing it. Apply database migrations before starting the service:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env and set HEIGIT_API_KEY; leave it blank until you have a real key.
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 3002
```

Run `alembic upgrade head` once for each deployment/release before directing traffic to new backend workers. It is safe to repeat and preserves existing trips and saved places; Terrene does not delete or recreate the database automatically.

Do not put a real key in source control, `.env.example`, `VITE_*` variables, frontend code, or chat messages. `HEIGIT_BASE_URL` is optional and may point at a compatible self-hosted or explicitly configured service root.

Terrene is a time-aware geographical exploration platform. The primary application at `/` integrates the shell with the Cesium Earth engine through `src/globe`. Run `npm ci` then `npm run dev` and open the URL printed by Vite. `/earth-demo.html` remains available as an isolated engine demonstration.

The application now has two coordinated mapping modes. **2D Map** is the default tourist exploration view powered by MapLibre GL JS and the configurable OpenFreeMap Liberty vector style. **3D Globe** lazy-loads the existing Cesium Earth experience for terrain, geographical context and solar exploration. Search, selected places, saved places, route geometry and the two camera states are application-owned and persist when switching modes. See [the mapping architecture](docs/MAPPING_ARCHITECTURE.md).

For a credential-free demonstration, choose Everest, Grand Canyon or Cape Town from the explicitly labeled example destinations. The camera flies to a regional view. Click the globe to inspect coordinates, add a marker, select it from the list or globe, and remove it. Examples are fixed geographical destinations, not fabricated search results. Search failures and degraded engine status remain visible.

## Backend API

The unified FastAPI application provides search, routing, journeys, trips, saved places, itineraries, opening hours and solar calculations. Run it in a separate PowerShell terminal:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m alembic upgrade head
python -m uvicorn backend.main:app --host 127.0.0.1 --port 3002
```

In another terminal run `npm run dev`. Vite forwards all `/api` requests to FastAPI on port 3002. Interactive endpoint schemas are at `http://localhost:3002/docs`. Starting `backend.solar_api:app` alone omits the current feature routers and is obsolete for running the full application.

`GET /api/solar?lat=19.076&lon=72.878&date=2026-11-01` returns UTC sunrise, sunset, solar noon, day length, and solar position. It uses the NOAA solar equations with the standard 90.833° sunrise/sunset zenith; results are approximate (usually within a few minutes), and terrain, weather, and civil-time rules are not modeled. Polar day/night returns null sunrise and sunset rather than invented values.

The Node server and `dev:backend`/`start:backend` scripts are retained for historical compatibility and Node regression tests. They are not part of the current application startup. FastAPI supplies the Nominatim search adapter.

```sh
npm run dev
```

Endpoints:

- `GET /api/v1/health` → `{ "ok": true, "service": "terrene-api" }`
- `GET /api/locations/search?q=Delhi` → `{ "results": [{ "id", "name", "displayName", "coordinates", "metadata" }] }`
- `GET /api/solar?lat=19.076&lon=72.878&date=2026-11-01` → use the FastAPI service on port 3002 described above.

Nominatim is a shared service: use it respectfully and retain OpenStreetMap attribution in deployments. The frontend expects the typed `{ results: GeographicLocation[] }` response shown above; it does not send queries to the MapLibre/OpenFreeMap style service.

Integration verification: `npm test` runs 5 engine logic tests plus 4 shell integration tests (the shell tests mock the globe boundary, not WebGL). `npm run typecheck` and `npm run build` pass. Chrome testing of `/` verified globe rendering, example flights, coordinate display, marker creation and unavailable search. Ion imagery, terrain and live geocoding still require configured credentials and are unverified. Installation reports 3 advisories in inherited development tooling; `npm audit --omit=dev --audit-level=moderate` reports zero runtime vulnerabilities. No force upgrade was applied.

## Requirements

- Node.js 24 recommended (the native TypeScript tests require Node 22.18+)
- npm 10+

The 2D map uses the public OpenFreeMap Liberty style by default. It is a vector map service for development and demos, not an unrestricted production tile guarantee; review its availability, attribution, usage limits and terms before deployment. Override it with `VITE_MAP_STYLE_URL` when using another compatible style or a self-hosted provider.

## Setup

On Windows, the included batch files automate the setup below. Double-click
`setup.bat` once, then run `start.bat` whenever you want to launch the local
API and frontend. The launcher opens the FastAPI service on port 3002 and Vite
on port 5173 in separate Command Prompt windows.
Close existing server windows before starting again. The launcher checks for
occupied ports and applies migrations using this checkout's `.env`. Restart
both services after editing `.env`; an already-running backend retains its
startup configuration.

The default public Nominatim endpoint requires explicit searches: type a place
in any location field and press Enter or Search, then choose a suggestion.
For a Nominatim deployment whose terms permit autocomplete, configure
`NOMINATIM_SEARCH_URL` and `NOMINATIM_AUTOCOMPLETE=true` in `.env` and restart.
The public OSMF endpoint always disables typeahead. Its
[usage policy](https://operations.osmfoundation.org/policies/nominatim/) also
requires attribution, caching and an application-wide maximum of one request
per second. The existing backend cache and single-worker throttle remain in use.

City Guide currently has two curated catalogues: Mumbai and Bengaluru (Bangalore),
with 12 attractions each. The catalogues are the display baseline and remain
available when Overpass is unavailable; live OpenStreetMap enrichment is optional.
Coordinates were checked with Nominatim and descriptions link to the cited
government or institutional tourism sources. Visit durations and editorial
priorities are Terrene estimates and recommendations, not official timings,
ratings or visitor counts. City extents are practical attraction-search bounds,
not administrative boundaries. Elephanta Caves requires ferry access, and the
guide does not claim a direct road route or precise travel time for it. Vidhana
Soudha is shown as an architectural landmark without promising interior access.
Bangalore is accepted as an alias for the canonical `bengaluru` city id.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Without credentials, the globe uses bundled low-resolution Natural Earth II imagery and WGS84 ellipsoid terrain, and reports `degraded`. This is geographical map imagery, not live satellite imagery or elevation terrain.

For ion capabilities, copy `.env.example` to `.env.local` (PowerShell: `Copy-Item .env.example .env.local`), fill `VITE_CESIUM_ION_TOKEN`, set `VITE_CESIUM_ION_IMAGERY_ASSET_ID` to an imagery asset available to your account, and optionally set `VITE_CESIUM_ION_LABELS_ASSET_ID` to a compatible transparent labels-only asset. Restart Vite after configuration changes. The engine requests World Terrain asset 1 with the configured token. Asset availability and service quotas depend on your ion account; no particular imagery asset is assumed. Browser tokens are public: restrict application URLs and use only required `assets:read` and `geocode` scopes. Never grant account-management scopes or commit real tokens. Preserve the visible Cesium and provider credits. CesiumJS is Apache-2.0; Natural Earth data is public domain; ion content remains subject to provider terms.

## Imagery layers and map labels

The globe keeps the bundled Natural Earth II imagery as its resilient fallback and can add the configured ion imagery as a base layer above it. When `VITE_CESIUM_ION_LABELS_ASSET_ID` is configured, a second ion imagery layer is added above the base layers. It is expected to be a provider-supplied transparent labels-only product; Terrene does not manufacture transparency or silently substitute an unrelated basemap. The application enables labels by default and exposes a `Map labels` checkbox. Toggling it changes only the overlay's visibility and does not recreate the Viewer, reset the camera, or remove the base imagery.

The labels asset is optional. Missing, invalid, denied, or failed labels configuration leaves the base imagery and globe usable and reports the label state in the panel. Asset IDs are account- and provider-specific; verify compatibility, coverage, attribution, and licensing in Cesium ion before configuring one. For example, an account may expose a Google Maps 2D Labels Only asset such as `3830185`, but that ID is not a universal default.

## Commands

```sh
npm run dev
npm run typecheck
npm test
npm run build
npm run preview
```

`prepare:cesium` copies Cesium's published runtime assets and workers from `node_modules` to `public/cesium`. Vite serves that directory in development and emits it unchanged in production. `CESIUM_BASE_URL` is configured as `/cesium`.

## Globe contract

Application code imports public globe types and `searchLocations` from `src/globe`; it must not use Cesium internals. See [the interface documentation](docs/GLOBE_INTERFACE.md).

Search uses the backend through the public `searchLocations` contract and Vite proxies `/api` to FastAPI on port 3002 during development. The demo supports click-to-place a marker and explicit search submission. Native Cesium controls provide left-drag rotation, wheel/right-drag zoom, and middle-drag tilt. The production demo is also available after `npm run build` and `npm run preview`.

Verified locally: `npm test` (5 tests), `npm run typecheck`, and `npm run build`. Browser smoke testing verified no-token imagery, rotation/zoom, coordinate picking and marker selection. Configured ion imagery/terrain/search are not verified without credentials. Cesium currently produces a large (~4.23 MB, ~1.14 MB gzip) JS chunk; this is a build warning, not a failure.


## T1-ASTRA-02 provider verification (31 October 2026)

Work is isolated on `feat/cesium-provider-verification` from integration commit
`1d16fe125d23efbdbeeda6cf796647f5c02d0ca3`; unrelated uncommitted backend work is untouched.
CesiumJS 1.146.0 APIs were checked against installed source. No local token was
available: **hosted imagery BLOCKED, World Terrain BLOCKED, live search BLOCKED**.
The earlier verification notes above are historical, not evidence of live providers.

Use a Cesium ion account, add the desired imagery and World Terrain to its assets,
and create a dedicated public application token. Set `VITE_CESIUM_ION_TOKEN` and
`VITE_CESIUM_ION_IMAGERY_ASSET_ID` in ignored `.env.local`. Grant `assets:read` for
asset 1 and the selected imagery asset, plus `geocode` for search. Restrict Allowed
URLs to the actual development origin (including port) and deployment URL; the
browser must send the Referer header for restricted tokens. Do not use private
scopes. See [Cesium's token guide](https://cesium.com/learn/ion/cesium-ion-access-tokens/).
The token is publicly observable in the browser and production bundle.

Provider sources remain unchanged: account-selected `IonImageryProvider`,
World Terrain asset 1, and `IonGeocoderService` using ion's default geocoding
provider. Resolution, coverage, upstream geocoder selection, licensing and quotas
depend on the selected data and account. Natural Earth II is only a low-resolution
bundled map; its shaded relief does not establish loaded elevation.

`npm test` passes 27 tests (6 logic, 17 provider, 4 shell), preserving all original
nine tests. `npm run typecheck` and `npm run build` exit 0.
Automated tests use mocked providers and real Cesium coordinate conversion classes;
they cannot establish remote authentication, tile content or visual elevation.
Chrome verified no-token regional imagery, Everest/Cape Town example selection,
marker creation/removal, coordinate picking and honest unavailable search. Hosted-service 401/403,
network and rate-limit cases were simulated, not verified against a live account.
A reload remounts failed imagery/terrain; search can be resubmitted after failure.
There is no automatic provider retry loop.

Before accepting the full milestone, run the configured app and record successful
remote requests plus visible imagery at continental, metropolitan, coastal and
other-region zoom levels; inspect tilted mountainous and flat terrain; search a
city, country and distant region and select results to verify displayed coordinates
and flights. Repeat with revoked/restricted credentials and network outages. Keep
request URLs containing tokens out of logs, screenshots and reports.

The production build still has one shared EarthGlobe chunk (~4.46 MB, ~1.21 MB gzip).
Both entry points share it; it is not duplicated per page. Asset preparation now
copies only Assets, Workers, ThirdParty and Widgets, excluding the unused standalone
Cesium.js bundle. Broader code splitting remains a separate performance task.
`npm audit` reports three affected development packages (one moderate, two critical):
direct Vitest 3.2.4 and transitive @vitest/mocker and tinypool. Reported issues include
mock-server path traversal/injection and worker-option prototype pollution.
`npm audit --omit=dev --audit-level=moderate` reports zero vulnerabilities. Review
patched tooling and validate its dependency tree in a separate update; no mass
upgrade was applied here.
