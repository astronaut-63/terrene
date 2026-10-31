# Demo reliability repair audit — 2026-10-31

## Preflight and scope

Changes are uncommitted in `terrene-journey-integration`, branch `codex/frontend-experience`, HEAD `ccec2b5`. Fetch verified remote primary `feat/earth-engine` at `cacaa0a83611fcbab4a0620d71b001312a6e8cde`; this worktree's starting tree matched that remote exactly (`git diff HEAD origin/feat/earth-engine` was empty). The original `terrene` checkout remains on `codex/dual-mode-mapping`, ahead one local commit `65f926c`; it was preserved. No branch switch, reset, stash, merge, commit, push, dependency upgrade, schema migration, or deployment was performed. Existing database contents remain intact.

## Actual Discover findings

UI endpoint paths, JSON serialization and Vite `/api` forwarding were correct. The reproduced live failure was upstream Overpass timeout, not a frontend endpoint mismatch. Both nearby and along-route failed against the configured provider during real local verification. This does not establish why the remote provider/network was slow; no successful live-provider result is claimed.

The existing design amplified slow service: twelve samples, three concurrent requests, two attempts with 25-second individual timeouts could queue roughly four waves of retries. Cache expired after five minutes with no stale fallback, simultaneous identical calls were not shared, and rate limits were retried after only 0.2 seconds. Completed Discover results and markers survived location/route changes. Custom category selection left the preset label unchanged. Invalid one-vertex routes could enable Along route. These issues were repaired.

## Files changed

- `backend/places.py`: union up to four sample circles per Overpass query, at most three queries per route; retain successful batches when others fail; distance-based bounded sampling of the supplied complete polyline with antimeridian wrapping; explicit coverage gaps and per-batch result limit. Eighteen-second provider-operation budget includes semaphore queue and retries, eight-second HTTP timeouts, at most two attempts, no immediate 429 retry, preserve Retry-After. Fresh cache five minutes, stale-if-error up to thirty minutes, 100 entries, deterministic endpoint/coordinate/category/radius keys, identical in-flight task sharing and bounded background lifetime when a caller cancels. Status/cache age metadata and safe diagnostic operation IDs. Malformed OSM tags are dropped.
- `src/Discovery.tsx`: cancel and invalidate completed/pending results on context edits, preserve own POI selection, send complete route geometry for backend sampling, validate geometry before enabling Along route, custom preset label, visible partial/fresh/stale status and age, existing search buttons permit retry after failure.
- `src/App.tsx`: separate Discover markers from City Guide/journey markers so invalidation cannot erase another tool's results; combine for map/globe display and itinerary choices.
- `src/services/apiContracts.ts`: additive cache/age response metadata.
- `backend/main.py`: readiness queries the database and checks expected model tables/columns, returns 503 on missing schema/connectivity failure, reports configuration independently of external availability; liveness stays process-only. SQLAlchemy failures return a safe retryable 503 without SQL/provider bodies.
- `backend/database.py`: connection pre-ping and explicit five-second SQLite busy timeout; preserve sessions, ownership and database location.
- `backend/test_places.py`, `backend/test_readiness.py`, `src/Discovery.test.tsx`, `src/App.test.tsx`: regression coverage for success/empty/failure, rate limit, server failure, malformed response, timeout, partial/all-failed batches, duplicate requests, stale cache, deadline, context cancellation, repeated clicks, custom categories, invalid short route, map-marker delivery/selection, and readiness with present/missing schema.
- `IMPLEMENTATION_STATUS.md` and this report: current evidence supersedes historical status entries.

## Other feature audit

Solar stale-result handling is already fixed in this checkout: selected location/date changes clear output and abort pending work. Its three existing tests pass; no redundant change was made. Existing tests cover search/autocomplete, route modes and errors, journey timing/weather, itinerary budget/breaks/destination, Mumbai/Bengaluru City Guide, opening-hours states, saved-place/trip CRUD and guest isolation, map marker/route updates, globe provider fallback and lifecycle, and route ownership. Existing ORM sessions use context managers and commit before returning success; exceptional exits close/roll back sessions. No speculative architecture changes were made.

Outbound adapters inspected: Nominatim has a five-second timeout and serialized rate spacing; routing has a twenty-second timeout and distinct authentication/rate-limit/provider errors; weather uses ten-second requests and retains journeys through weather failure; itinerary/city routing delegates to those adapters. Discover now has structured failure/duration/operation logging. Cross-provider correlation IDs and distributed caches/rate limits are not implemented.

## Verification evidence

- Full Python suite: **69 passed**.
- `npm test`: **10 Node tests and 77 Vitest tests passed**, 14 Vitest files.
- `npm run typecheck`: passed.
- `npm run build`: passed; existing large MapLibre/Cesium bundle warning remains.
- `git diff --check`: passed.
- Canonical `backend.main:app` started successfully. Port 3002 was already occupied; no existing process was stopped. Isolated smoke used API 3102 and Vite 5174 with a temporary proxy override, subsequently removed.
- Real requests through Vite: `/api/v1/health` 200 and `/api/v1/ready` 200, expected database schema present; routing configuration reported configured without exposing its credential.
- Actual configured SQLite database: inserted/flushed/read a uniquely identified temporary trip inside a transaction, rolled back and verified absent. No test record retained.
- Actual Overpass through Vite: public Cape Town nearby returned 504, corridor returned 503 (all batches failed) in about 16.45 seconds. Browser retry also timed out. No fixture/alternate public endpoint was silently substituted.
- Chrome smoke: 2D map ready; public Cape Town shortcut selection; Discover loading/error/retry with no misleading empty-success message; 3D globe initialized and reported detailed tiles, return to 2D preserved selection. Route, Journey, Itinerary, City Guide, Solar, Opening Hours, Saved Places, Saved Trips and Map Settings panels opened. Captured browser warning/error log was empty.
- Successful/partial Discover, stale cache, recovery after retry and marker selection are verified with deterministic mocks, not a successful live Overpass run. Real routed journeys, live geocoding, current opening status, and live itinerary generation were not exercised. Existing browser smoke is panel-level, not exhaustive end-to-end coverage of every edit/save operation.

## Remaining demonstration limitations

Live Discover success is still **unverified** because the provider timed out. This repair improves bounded, honest degradation but cannot guarantee public infrastructure availability; acceptance requiring a successful live result is not yet satisfied. Cache is process-local and initially empty; stale fallback requires a previous successful same-query response and cannot survive restart. Route discovery is sampled and capped at twelve circles, with at most 150 matches per combined batch, not exhaustive corridor coverage. Partial success is retained at batch granularity. Multiple workers would have separate caches/concurrency limits. No optional demo fixture or secondary provider was added. Readiness checks connectivity/schema, not ongoing external health or write permissions; write capability was verified separately. Existing 3002/5173 processes must be identified before a demo to avoid testing an older backend.

## Start and test

In PowerShell, from the repaired checkout:

```powershell
cd 'C:\Users\YAYATI DATTA KANTETI\Documents\Terrene\terrene-journey-integration'
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 3002
```

In a second terminal from the same directory:

```powershell
npm run dev
```

Ensure ports 3002 and 5173 are free or intentionally served by this checkout. Backend configuration loads `.env` without overriding supplied environment values. Existing migrations were not altered or reapplied. For a new database only, use the existing documented `python -m alembic upgrade head` workflow.

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s backend -p 'test_*.py'
npm test
npm run typecheck
npm run build
git diff --check
```
