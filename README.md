# Terrene

Terrene is a time-aware geographical exploration platform. This repository currently provides the React/Vite foundation and the public globe contract; the interactive Earth engine follows in the next task.

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+

## Setup

```sh
npm install
cp .env.example .env
npm run dev
```

`VITE_CESIUM_ION_TOKEN` is optional for the foundation. The Earth engine will use it for Cesium ion imagery, terrain, and geocoding. Browser environment variables are public: issue a minimally scoped token, restrict it to application URLs, and never commit it.

## Commands

```sh
npm run dev
npm run typecheck
npm run build
npm run preview
```

`prepare:cesium` copies Cesium's published runtime assets and workers from `node_modules` to `public/cesium`. Vite serves that directory in development and emits it unchanged in production. `CESIUM_BASE_URL` is configured as `/cesium`.

## Globe contract

Application code imports public globe types and `searchLocations` from `src/globe`; it must not use Cesium internals. See [the interface documentation](docs/GLOBE_INTERFACE.md).

No imagery, terrain, or geocoding provider is configured by this foundation. The search stub rejects explicitly instead of returning fabricated data.
