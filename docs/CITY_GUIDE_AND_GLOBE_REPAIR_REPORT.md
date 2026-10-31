# City Guide and globe repair report

31 October 2026. Worktree: `terrene-journey-integration`, branch
`codex/frontend-experience`, base `ea02d00`. Existing uncommitted work was
inspected and preserved. No commit, push, merge, deployment, schema migration,
dependency replacement or environment-file overwrite was performed.

## Status

Search is working and the fallback globe renders. City Guide code and its
integration are implemented as an initial Mumbai pilot, but **the full feature
acceptance is not complete**. Live Overpass attraction retrieval failed, so
Mumbai attraction coverage and real generated tour examples are unverified.
The interface labels coverage as under verification. No sample attraction data
was installed into the application to conceal this failure.

## 1. Location search

The prior invalid-data failure was reproduced in the preceding repair:
FastAPI on 3002 was stopped, while Vite returned HTTP 500, `text/plain`, with
an empty body. JSON parsing of that proxy response produced the misleading
message. The canonical backend was started; the existing adapter now checks
content type/status, distinguishes malformed JSON from invalid structures and
empty success, and suppresses unsafe error details. Those changes were preserved.

In this pass `/api/locations/search?q=mumbai` returned HTTP 200,
`application/json`, with `results` and OSM `attribution`. Mumbai, Delhi and
Bengaluru were tested through Vite: respectively 1, 5 and 1 real results, all
with string IDs/names/display names and numeric WGS84 coordinates. No current
invalid-data failure was reproduced. Explicit submission and the existing
Nominatim throttle/cache remain unchanged. The backend is left running from
the intended checkout to avoid recreating the previous outage.

## 2. Cesium

No ion token, imagery asset or labels asset was configured in `.env` or
`.env.local`; only presence booleans were inspected. Natural Earth static
metadata returned HTTP 200 `text/xml`. Chrome rendered fallback imagery without
captured console warnings/errors. A complete renderer failure was not
reproduced, so no unsupported claim is made about the cause of a previous blank
globe on another runtime.

Actual camera defects found in code: a camera eye location and altitude were
saved as a surface look-at target, then used with another range offset on
remount; selecting the same place after remount also restarted a camera flight.
The globe now preserves an explicit eye coordinate and heading/pitch, restores
with `setView`, and skips that redundant initial selection flight. Global-scale
views use a nadir camera rather than an off-centre surface-target offset. Failed
labels also lose their toggleable layer reference so a checkbox cannot revive
the failed layer. Base imagery remains independent.

Changed `src/globe/EarthGlobe.tsx`, `contracts.ts` and `providers.test.tsx`.
Fallback/base/labels order remains intact. The asset preparation script was
inspected and already copies Assets, Workers, ThirdParty and Widgets correctly.
No unrelated basemap was introduced.

Live: fallback rendering, selected Mumbai marker, rotation and 2D/3D switching
were inspected in Chrome. Automated provider tests cover ion success/failure,
terrain fallback, labels/lifecycle and exact eye restoration. Ion imagery,
terrain, restricted-origin authorization and live labels toggling remain
unverified without credentials. This pass did not fully verify city-detail
imagery, every worker URL, tilt input or every WebGL failure on real hardware.

## 3. City Guide foundation

Configured pilot: Mumbai, India, Asia/Kolkata. City definition was retrieved
from Nominatim: OSM node 16173235, centre 19.054999 / 72.8692035. The returned
extent is 18.894999 to 19.214999 latitude and 72.7092035 to 73.0292035 longitude.
This is explicitly a search extent, not an invented administrative boundary.
Registry source: https://www.openstreetmap.org/node/16173235.

Provider access reuses the existing Overpass JSON adapter, semaphore, bounded
retries and timeout handling. City lookups have a 10-minute cache and an overall
55-second timeout; only one city discovery request runs at a time. The query
targets museums, visitor attractions, viewpoints, historic/heritage objects,
and documented parks. Generic restaurants/buildings and unnamed records are
excluded. WGS84 validation, stable OSM IDs and Wikidata/location deduplication
are retained. OSM tags remain available as metadata; unknown values stay missing.

**Live coverage blocker:** the initial lookup returned a provider-unavailable
HTTP 503. A direct diagnostic timed out. The actual browser generation request
returned HTTP 504 with a place-discovery timeout message. No successful live
attraction collection was obtained. Real two-hour, four-hour and full-day
outputs therefore cannot be supplied honestly. Registry expansion and verified
city-specific curated priorities remain pending coverage/evidence review.

## 4. Ranking and time accounting

Importance is deterministic and separate from route feasibility. Base score 10;
heritage designation +40; Wikidata +20; Wikipedia +20; museum classification +15;
historic classification +15; selected interest +25. Reasons expose the actual
signals. Ties use stable provider ID. These are engineering relevance weights,
not popularity, ratings, visitor counts or independently verified significance.

Default visit estimates are 90 minutes for museums, 60 for parks, 20 for
viewpoints and 45 for heritage/other attractions. All are labelled editable
category estimates. Candidates are evaluated in importance order using real
openrouteservice legs. At most 12 sequential routing attempts and 8 selected
stops are allowed. Travel + visits + explicit buffer must fit the budget.
Unavailable travel never yields invented precise durations or a false fit.
Unselected candidates remain visible with reasons. Closed arrivals/departures
are excluded; absent/unparseable schedules remain uncertain. An intermediate
closure can still be missed by the endpoint checks and is disclosed.

Selection order follows importance and budget feasibility. It is not a global
route optimum and does not yet implement a separate clustering/visit-order
optimizer. No return-to-origin leg is assumed. Unit fixtures for 2/4/6/10 hours
produce 1/3/5/8 stops with a 60-minute test visit, 10-minute travel leg and
10-minute buffer. These are test fixtures, not Mumbai recommendations.

## 5. UI and integration

City Guide is a persistent sidebar feature with an independent city field,
duration presets, explicit full-day/custom hours and minutes, aware departure,
travel modes, interests, optional starting point and buffer. The assumed city
centre is labelled. Ranked cards explain evidence and feasibility; selected
stops allow duration edits, exclusion, inclusion and moving upward. Editing
clears the old route/time summary until Itinerary recalculates.

Attractions use the existing POI store and map selection. Priority numbers use
a MapLibre symbol layer and selected locations retain the existing highlight.
Guide geometry has its own route owner; other planners' background requests
cannot take over that owner. The explicit Fit attractions in 2D action fits
priority markers even when routing is unavailable. A dedicated 3D fit-results
action remains outside this first pass. Selected attraction details show
published descriptions/hours where supplied, reasons, source and a safe website
link. These fields remain absent when OSM does not provide them.

Transfer retains stop order, names, coordinates, durations, origin, mode,
departure and available time. Itinerary presents Import/Keep-current choices
before replacing inputs. A buffer is reserved from the backend planning budget
while the original available duration remains visible. Its separate buffer
allowance is also preserved in the existing saved itinerary JSON metadata.

New modules: `backend/cities.py`, `backend/attractions.py`,
`backend/city_guide.py`, `backend/test_city_guide.py`, `src/CityGuide.tsx`,
`src/CityGuide.test.tsx`. Integration edits: `backend/main.py`, `src/App.tsx`,
`src/ItineraryPlanner.tsx` and its tests, `src/shell/Sidebar.tsx`,
`src/session/routes.ts`, `src/domain/geo.ts`, `src/map/MapView.tsx` and its tests.
No database schema change was needed.

Endpoints: `GET /api/v1/cities/supported`,
`GET /api/v1/cities/{city_id}/attractions`,
`POST /api/v1/city-guides/generate`. Generation uses Pydantic requests and
nested response models for cities, attractions and coordinates.

## 6. Verification and remaining acceptance

- Complete Python suite: 61 passed.
- Frontend Vitest suite: 68 passed, including the new guide failure, successful
  mock selection/marker/transfer flow and import
  confirmation checks and the globe eye-restoration regression.
- Node compatibility suite: 10 passed.
- Typecheck and production build passed. Existing large bundle warnings remain.
- Chrome inspected City Guide at 1920x1080, 1440x900, 1366x768, 1024x768 and
  390x844. No horizontal page overflow; sidebar scrolling and attribution were
  visible. Viewport override was reset.
- Browser City Guide submission verified the real provider failure state,
  rather than a successful recommendation/transfer workflow.

Remaining: successful live attraction coverage, curated evidence review,
actual time-budget examples and full successful browser workflow, broader
ranking scenario coverage and clustering/order refinement.
Live ion-specific behavior needs user-owned configured assets. The requested
full acceptance is not claimed complete; this report distinguishes tested
implementation from externally blocked verification and remaining refinements.
