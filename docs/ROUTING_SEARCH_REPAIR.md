# Routing, location search and sidebar repair

Verified on 31 October 2026. Checkout: `terrene-journey-integration`.
Branch: `codex/frontend-experience`. Starting commit: `ea02d00`.
The working tree was clean at preflight. Changes for this task are uncommitted
and unpushed. No files were copied between Terrene worktrees.

## A. Routing diagnosis

The repository-root `.env` exists and contains a non-empty `HEIGIT_API_KEY`.
The loader correctly resolves this checkout's `.env` with `override=False`.
No `HEIGIT_API_KEY` process variable was present in the diagnostic shell before
loading the file. A fresh import reported `routing_provider.configured: true`
and calculated a genuine Mumbai-to-Pune driving route (146.56 km, 7037.7 seconds,
1651 geometry coordinates, using the explicit test coordinates).

The existing API on port 3002 reported `configured: false` and returned HTTP 503
for the same route. Its executable, command line and working directory were
established before it was stopped: the `.venv` launcher and its Python child
were serving `backend.main:app` from this exact checkout. The process started
about 341 seconds before the local `.env` file was modified. It retained its
startup environment. This was a stale backend configuration, rather than an
invalid key or a missing local key.

The identified stale API processes were restarted from the intended checkout.
Readiness then reported `configured: true` both directly on 3002 and through
Vite on 5173. The frontend process was also confirmed to use this checkout.
Vite's proxy now targets `127.0.0.1:3002` explicitly, matching Uvicorn's IPv4
binding and avoiding localhost IPv4/IPv6 differences.

Live short-distance requests through the frontend proxy succeeded for driving,
walking, cycling and wheelchair. Transit returned the expected HTTP 503.
The unconditional transit warning was removed from Route Planner.

Routing errors still distinguish missing configuration, provider authentication,
rate limiting, timeout, transport failure, upstream rejection and malformed data.
No credential values were printed, stored in reports or committed.

## B. Search and planning behavior

`LocationAutocomplete` is shared by the header and all planning fields. It owns
only its query, suggestions and request state. Each parent planner owns its
chosen endpoints or stops. Selecting an endpoint also updates map selection
and camera through a separate callback; global search never assigns endpoints.

The component supports cancellation, request revision checks, loading, empty
results, errors, clear/edit, Arrow Up/Down, Enter, Escape, focus retention and
combobox/listbox ARIA. Editing removes the old selected endpoint immediately,
which invalidates that planner's existing result and geometry. Late results
cannot restore a previous query or route.

Journey now has independent Origin and Destination fields inside its panel.
It retains departure conversion from browser local time to UTC, checkpoint
count, and real geometry/weather. A distance-spacing control now exposes the
existing backend spacing contract, mutually exclusive with count.

Route uses the same independent fields and retains four travel modes, distance,
duration, provider credits, trip saving, updates and restoration.

Itinerary supports searching its starting point, optional final destination,
new stops and existing stops. Editing a stop retains its position and visit
duration. Stable editor keys keep a stop's field mounted when its place changes.
Unresolved stop edits prevent generation. Ordering remains manual. Breaks,
budget, final-destination behavior, partial warnings and saved restoration remain.

Explore remains an optional location-details/map-shortcuts panel. Search results
now belong to their respective fields. Header search updates shared selection
and the map while the current tool and its inputs remain intact. Planner
components remain mounted, and Route/Journey/Itinerary retain separate geometry
ownership through the existing route reducer.

### Actual provider limitation

The existing adapter uses public OSMF Nominatim. Its
[usage policy](https://operations.osmfoundation.org/policies/nominatim/)
forbids autocomplete, including through a proxy. It also requires attribution,
caching and a maximum of one request per second across the application.

The current deployment therefore requires Enter or Search in each field; real
results appear immediately below that field, without changing tools. It does
not send geocoding requests for each typed prefix.

The reusable component implements 450 ms debouncing for a Nominatim deployment
that permits autocomplete. Set `NOMINATIM_SEARCH_URL` to that deployment and
`NOMINATIM_AUTOCOMPLETE=true` only after verifying its terms, then restart the
backend. `/api/v1/locations/config` exposes only the boolean capability.
The public OSMF hostname always disables typeahead, even if the flag is true.
No new geocoding provider or dependency was introduced. Cache entries are now
scoped by endpoint as well as query. The existing cache and throttle remain.
Multi-worker/global rate limiting remains a production consideration.

## C. Sidebar layout

The old forms mixed button-based endpoint cards, standalone strong text,
label margins, full-width button margins and a special 110px stop-input width.
These created inconsistent field rhythm and alignment.

The stylesheet now defines 4/8/12/16/20/24px spacing tokens, shared panel padding
and a 40px control-row height. Labels, endpoint groups and menu borders use
shared rules. Controls have border-box sizing and flexible minimum-zero columns.
Visit duration fields use available width. The desktop context panel is 320px
wide; the narrower breakpoint uses 300px. The existing mobile drawer remains.

Planner suggestion menus occupy normal layout flow, so the context scroller
can scroll the entire result list instead of cutting off an absolute overlay.
The header's menu overlays below the header field. Menus match their field rows;
their own result list has a bounded scroll area. Visible keyboard focus and the
existing reduced-motion rule remain. No decorative animation was added.

## D. Files and engineering changes

Added:

- `src/ui/LocationAutocomplete.tsx`
- `src/ui/LocationAutocomplete.test.tsx`
- `src/PlannerSearch.test.tsx`
- `scripts/local_preflight.py`
- `docs/ROUTING_SEARCH_REPAIR.md`

Modified:

- `src/App.tsx`, `src/App.test.tsx`, `src/shell/AppHeader.tsx`
- `src/JourneyExplorer.tsx`, `src/RoutePlanner.tsx`, `src/ItineraryPlanner.tsx`
- `src/services/locationSearch.ts`, `src/styles.css`
- `backend/search.py`, `backend/test_search.py`
- `backend/routing.py`, `backend/test_routing.py`
- `backend/migrations/env.py`
- `setup.bat`, `start.bat`, `vite.config.ts`, `.env.example`, `README.md`

Alembic now loads the repository configuration before reading `DATABASE_URL`,
matching FastAPI. Startup checks configuration and occupied ports without
stopping unknown processes, applies migrations, and uses a strict frontend
port. Setup checks usable Python 3.11+ and reports environment-copy failures.
Existing `.env` files are preserved. Restart both servers after editing `.env`.

The process-inspection package used to establish the old server's working
directory was installed only in the ignored local `.venv`. It is not a product
dependency and is not needed by the startup scripts. No dependency manifests,
lockfiles, schemas or migration revisions changed.

## E. Verification

| Check | Actual result |
| --- | --- |
| Complete Python suite | 55 passed |
| Node compatibility tests | 10 passed |
| Vitest frontend suite | 63 passed across 13 files |
| TypeScript check | Passed |
| Production build | Passed; existing large MapLibre/Cesium chunk warning remains |
| Git whitespace check | Passed |
| `.env` Git ignore | Confirmed |
| Local startup preflight | Correct checkout/configuration reported; occupied ports detected |

Automated regressions cover rapid typing/debounce, empty/error/slow responses,
abort and stale-response protection, keyboard navigation, clearing, independent
endpoint assignment, active-panel preservation, mode/input invalidation, saved
route restoration/update behavior, stop editing/order/duration, saved itinerary
restoration, break settings, partial warnings and routing failures. Provider
authentication/rate/network failure simulations use mocks, not live invalid keys.

Live browser verification in Chrome:

- Searched Mumbai and Pune, selected them directly in Journey, set departure,
  and generated a real five-checkpoint journey with available Open-Meteo data.
- Selected Mumbai with Arrow Down/Enter. Observed visible focus styling.
- Used header search for Delhi while Journey remained active; both endpoints
  remained populated. Switched Route/Journey and retained Journey input values.
- Edited Journey origin and confirmed its old timeline and geometry cleared.
- Used contextual Route fields on mobile and calculated a genuine route.
- Used contextual Itinerary search to add Pune after a Mumbai start; generated
  a real session-only plan, with the truthful missing-opening-hours warning.
- Inspected a rendered route and saw no captured browser warnings/errors.
- Checked sidebar scrolling, mobile navigation, input alignment and suggestions.

Viewport inspection:

| Viewport | Map area | Horizontal page overflow |
| --- | --- | --- |
| 1920 x 1080 | 1536 x 1020 | None |
| 1440 x 900 | 1056 x 840 | None |
| 1366 x 768 | 982 x 708 | None |
| 1024 x 768 | 640 x 708 | None |
| 390 x 844 | 390 x 736, drawer overlay | None |

Map/provider attribution stayed in the viewport. At 1440px the suggestion menu
and input row both measured 279.2px; mobile menu width was 344px. Browser viewport
overrides were reset afterward. Screenshots are in the task visualization folder.

Saved-trip CRUD and partial/error edge cases were verified by automated tests;
this browser pass did not create persistent test trips. Typeahead against a
permitted remote Nominatim instance was tested with mocks only, since none is
configured here. Reduced-motion CSS was inspected, without changing the browser
preference. This pass did not repeat live 3D imagery/terrain credential checks.

## F. Remaining work and running locally

Routing credentials now work. No key transfer is needed on this laptop.
Automatic suggestions while typing still require a permitted Nominatim
deployment. Explicit searches already support the full in-panel workflow.

Close the existing development server windows before running `start.bat` again.
Use `setup.bat` if dependencies need installing. The local frontend uses
`http://127.0.0.1:5173`; API documentation is at `http://127.0.0.1:3002/docs`.
QA's replacement API process is stopped during teardown, so a normal fresh
startup loads all final backend edits. No deployment or public launch occurred;
the existing domain and legal-review launch gates remain outstanding.
