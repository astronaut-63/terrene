# Terrene

Terrene is a time-aware geographical exploration platform. The Cesium Earth engine is exported from `src/globe`. The application shell PR remains separate; open `/earth-demo.html` for a working engine demonstration.

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

Search uses the installed Cesium 1.146.0 `IonGeocoderService` and requires a mounted `EarthGlobe` with a token. No-token search rejects explicitly. The demo supports click-to-place a marker and explicit search submission. Native Cesium controls provide left-drag rotation, wheel/right-drag zoom, and middle-drag tilt. The production demo is also available after `npm run build` and `npm run preview`.

Verified locally: `npm test` (5 tests), `npm run typecheck`, and `npm run build`. Browser smoke testing verified no-token imagery, rotation/zoom, coordinate picking and marker selection. Configured ion imagery/terrain/search are not verified without credentials. Cesium currently produces a large (~4.23 MB, ~1.14 MB gzip) JS chunk; this is a build warning, not a failure.
