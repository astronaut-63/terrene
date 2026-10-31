# Provider integration review, 31 October 2026

This is an engineering review of public documentation, not approval of commercial use or a legal compliance statement. Confirm the exact deployment, account plans and content licences before release.

| Provider | Current integration and release consideration | Primary reference |
| --- | --- | --- |
| OpenStreetMap | Keep readable attribution and the copyright/licence link for map, place and route data. | https://www.openstreetmap.org/copyright |
| OpenFreeMap | Site currently describes no request or map-view limits. Service is provided as-is under its current terms. Preserve OpenFreeMap, OpenMapTiles and OpenStreetMap credits from the style. Historical project notes describing a demo-only entitlement are not an accurate statement of current terms. | https://openfreemap.org/ and https://openfreemap.org/tos/ |
| Nominatim | Explicit submissions, cached responses and existing per-worker request spacing are preserved. The public service limits requests to one per second, prohibits client autocomplete and requires identification and attribution. Aggregate limits across production workers still need assessment, or configure alternative infrastructure. | https://operations.osmfoundation.org/policies/nominatim/ |
| Overpass | Public instances share capacity and may shed load. Preserve existing three-request concurrency and bounded sampling; do not add retries to the along-route aggregator. Current existing nearby adapter has at most two attempts. | https://dev.overpass-api.de/overpass-doc/en/preface/commons.html |
| Open-Meteo | Link attribution next to forecast results. The current free API is for noncommercial use; commercial deployment requires suitable terms. | https://open-meteo.com/en/terms |
| HeiGIT/openrouteservice | Route result credits include openrouteservice, HeiGIT and OpenStreetMap. Confirm account-specific quota and usage terms. The current public terms page could not be retrieved at its usual URL; the official staging terms describe required attribution, so production terms approval remains open. | https://staging.openrouteservice.org/terms-of-service/ |
| Cesium ion | Preserve credits, use the minimal public-token permissions and exact domain restrictions, and confirm licences for the selected imagery, terrain and labels assets. Natural Earth fallback remains bundled. | https://cesium.com/legal/terms-of-service/ |

Windy was inspected as a general reference for map-first task hierarchy; no branding, assets or source code were copied: https://www.windy.com/.

The application ships no AI builder tag. Provider branding and licence attribution are retained intentionally.
