# Terrene mapping architecture

Terrene has one exploration session with two renderer views:

- **2D Map** is the default tourist workspace. It uses MapLibre GL JS with the configurable OpenFreeMap Liberty vector style. It is flat, starts at pitch 0/bearing 0, keeps rotation and tilt disabled, and receives provider attribution from the style.
- **3D Globe** is a secondary geographical visualisation. It lazy-loads the existing Cesium implementation only when selected and retains its terrain, imagery fallback, labels overlay, markers, camera and provider status handling.

The application owns selected place, saved places, route geometry, 2D camera and 3D camera state. MapLibre receives GeoJSON in `[longitude, latitude]` order at its boundary; Cesium receives the same places as geographic latitude/longitude values. Switching modes unmounts the inactive renderer but preserves the shared state and each renderer's last camera.

Search is renderer-independent in `src/services/locationSearch.ts` and uses the existing `/api/locations/search` backend. It does not require Cesium to be mounted. Route rendering accepts a real `LineString` contract in `src/domain/geo.ts`; no route calculation or fabricated road geometry is included yet.

## Configuration

`VITE_MAP_STYLE_URL` overrides the default `https://tiles.openfreemap.org/styles/liberty`. The public OpenFreeMap service is suitable for development and demos, but availability, rate limits, coverage and service terms should be reviewed before production use. A self-hosted or compatible vector style can be substituted without changing the MapView contract.

Cesium credentials remain configured through the existing `VITE_CESIUM_ION_TOKEN`, `VITE_CESIUM_ION_IMAGERY_ASSET_ID`, and optional `VITE_CESIUM_ION_LABELS_ASSET_ID` variables. The 2D map does not use Cesium credentials.

## Verification

Run `npm test`, `npm run typecheck`, and `npm run build`. The build should contain MapLibre in the initial application path and a separate Cesium chunk loaded by the lazy 3D branch; the 2D view must remain usable without opening the globe.
