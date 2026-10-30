# Terrene

Terrene is a time-aware geographical exploration platform. The primary application at `/` integrates the shell with the Cesium Earth engine through `src/globe`. Run `npm ci` then `npm run dev` and open the URL printed by Vite. `/earth-demo.html` remains available as an isolated engine demonstration.

For a credential-free demonstration, choose Everest, Grand Canyon or Cape Town from the explicitly labeled example destinations. The camera flies to a regional view. Click the globe to inspect coordinates, add a marker, select it from the list or globe, and remove it. Examples are fixed geographical destinations, not fabricated search results. Search failures and degraded engine status remain visible.

## Backend API

The Solar Explorer API is a Python/FastAPI service. Install its dependencies and run it in a separate PowerShell terminal:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.solar_api:app --reload --port 3002
```

In another terminal, run `npm run dev:backend` to keep the existing geocoder available on port 3001, then run `npm run dev` in a third terminal. FastAPI's independent interactive docs are available at `http://localhost:3002/docs`.

`GET /api/solar?lat=19.076&lon=72.878&date=2026-11-01` returns UTC sunrise, sunset, solar noon, day length, and solar position. It uses the NOAA solar equations with the standard 90.833° sunrise/sunset zenith; results are approximate (usually within a few minutes), and terrain, weather, and civil-time rules are not modeled. Polar day/night returns null sunrise and sunset rather than invented values.

The small Node backend keeps the existing OpenStreetMap Nominatim search service available (with a descriptive User-Agent, five-second timeout, bounded five-minute cache, and no credentials):

```sh
npm run dev:backend
npm run dev
```

Endpoints:

- `GET /api/health` → `{ "ok": true, "service": "terrene-backend" }` (Node service)
- `GET /api/locations/search?q=Delhi` → `{ "results": [{ "id", "name", "displayName", "coordinates", "metadata" }] }`
- `GET /api/solar?lat=19.076&lon=72.878&date=2026-11-01` → use the FastAPI service on port 3002 described above.

Nominatim is a shared service: use it respectfully and retain OpenStreetMap attribution in deployments. The local runtime smoke request could not be completed in the restricted environment because localhost socket access is blocked; mocked provider behavior is covered by tests.

Integration verification: `npm test` runs 5 engine logic tests plus 4 shell integration tests (the shell tests mock the globe boundary, not WebGL). `npm run typecheck` and `npm run build` pass. Chrome testing of `/` verified globe rendering, example flights, coordinate display, marker creation and unavailable search. Ion imagery, terrain and live geocoding still require configured credentials and are unverified. Installation reports 3 advisories in inherited development tooling; `npm audit --omit=dev --audit-level=moderate` reports zero runtime vulnerabilities. No force upgrade was applied.

## Requirements

- Node.js 24 recommended (the native TypeScript tests require Node 22.18+)
- npm 10+

## Setup

```sh
npm install
cp .env.example .env
npm run dev
```

Without credentials, the globe uses bundled low-resolution Natural Earth II imagery and WGS84 ellipsoid terrain, and reports `degraded`. This is geographical map imagery, not live satellite imagery or elevation terrain.

For ion capabilities, copy `.env.example` to `.env.local` (PowerShell: `Copy-Item .env.example .env.local`), fill `VITE_CESIUM_ION_TOKEN`, and set `VITE_CESIUM_ION_IMAGERY_ASSET_ID` to an imagery asset available to your account. Restart Vite after configuration changes. The engine requests World Terrain asset 1 with the configured token. Asset availability and service quotas depend on your ion account; no particular imagery asset is assumed. Browser tokens are public: restrict application URLs and use only required `assets:read` and `geocode` scopes. Never grant account-management scopes or commit real tokens. Preserve the visible Cesium and provider credits. CesiumJS is Apache-2.0; Natural Earth data is public domain; ion content remains subject to provider terms.

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

Search uses the backend through the public `searchLocations` contract and Vite proxies `/api` to port 3001 during development. The demo supports click-to-place a marker and explicit search submission. Native Cesium controls provide left-drag rotation, wheel/right-drag zoom, and middle-drag tilt. The production demo is also available after `npm run build` and `npm run preview`.

Verified locally: `npm test` (5 tests), `npm run typecheck`, and `npm run build`. Browser smoke testing verified no-token imagery, rotation/zoom, coordinate picking and marker selection. Configured ion imagery/terrain/search are not verified without credentials. Cesium currently produces a large (~4.23 MB, ~1.14 MB gzip) JS chunk; this is a build warning, not a failure.
