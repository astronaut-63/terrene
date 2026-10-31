# Cesium imagery quality repair

31 October 2026. Worktree `terrene-journey-integration`, branch
`codex/frontend-experience`. Existing uncommitted routing, search, Journey,
City Guide and other changes were preserved. Nothing committed or pushed.

## Diagnosis

The blurry surface is the bundled Natural Earth II texture, not failed route
geometry. The immediate cause is missing detailed-imagery configuration:

| Check | Observed |
| --- | --- |
| Root `.env` | Exists; ion token empty and imagery asset ID not configured |
| Root `.env.local` | Does not exist |
| Vite `loadEnv('development', cwd, 'VITE_')` | Token absent, imagery ID invalid/absent, labels absent |
| Running Vite working directory | This exact integration checkout |
| Natural Earth tile metadata | HTTP 200, `text/xml`, 780 bytes |
| Representative worker chunk | HTTP 200, `text/javascript`, 4502 bytes |
| Natural Earth JPEG | HTTP 200, `image/jpeg`, 8157 bytes |

Credential values were never printed or put in files under source control.
There is no configured ion asset to authenticate, inspect for resolution, or
verify for India coverage. No claim is made that a token was rejected, that an
asset lacks permission, or that a particular commercial asset is available to
the account. The token/ID prerequisites are absent, before those checks can run.

Chrome visibly rendered Natural Earth and explicitly reported regional fallback.
No captured console errors/warnings were observed during the live checks. The
browser-control surface did not expose the Network response panel; the HTTP
status/content-type checks above were made directly against the same local
Vite server. No token-bearing browser request URLs were collected or logged.

## Code fixes

Changed `src/globe/EarthGlobe.tsx`, `src/globe/contracts.ts`, `src/App.tsx` and
`src/globe/providers.test.tsx`, plus this report.

- Selection no longer assumes detailed imagery is usable because a token and
  positive asset ID exist. It starts with a 5,000 km regional viewing range.
- The imagery provider's public `requestImage` method is observed. A fulfilled,
  non-discarded tile plus a completed render with `globe.tilesLoaded` is needed
  before reporting received imagery and allowing closer camera input.
- The wrapper preserves arguments, `this`, undefined/back-pressure returns,
  failures and returned images. Cleanup restores the original method. Late
  completions after unmount cannot update status or the Viewer.
- Provider coverage rectangles are checked for selected locations. Out-of-
  coverage selections retain regional fallback behavior.
- Fallback camera input has a 2,500 km minimum distance. Once usable ion tiles
  arrive this is relaxed to 100m; actual useful imagery resolution still depends
  on the asset. A tile failure disables the failed ion layer, restores the
  fallback limit, and backs out of a close view when necessary.
- Saved close eye positions are clamped during fallback initialization. The
  camera does not automatically fly closer when imagery finishes loading.
- Header imagery states distinguish regional fallback, loading, received tiles,
  failure, outside coverage and fatal renderer failure. HTTP 401/403/404/429
  initialization failures have safe, distinct explanations. Unknown failures
  remain explicitly ambiguous rather than guessing authentication failure.
- The 3D Fit route action uses a bounding sphere of the actual route coordinates.
  Its request counter is consumed once, so remounting does not replay an old fit.

Layer order remains Natural Earth fallback, configured ion base, optional labels.
Labels still toggle independently and cannot replace the base layer. A failed
labels layer does not remove the base imagery or trigger a fatal renderer error.
Lazy loading, request-render mode, resize handling, credits and lifecycle cleanup
are preserved. No sharpening, unrelated basemap or fabricated imagery was added.

Received tile data is stronger evidence than provider construction, but is not
proof of satellite content, city-scale resolution or coverage at every zoom.
The application deliberately reports "Detailed tiles received" rather than
claiming a measured imagery resolution. Cache hits, asset maximum levels and
local missing-tile behavior still require visual verification with the real
configured asset. A regional-only ion asset cannot acquire city detail through
this code change.

## Actual verification

| Scenario | Live result |
| --- | --- |
| Initial global view | Natural Earth globe renders with fallback status |
| Mumbai | Real search selection; regional Natural Earth visible |
| Kolkata | Real search selection; regional Natural Earth visible |
| Delhi | Real search selection; regional Natural Earth visible |
| Cape Town | Real search selection; regional Natural Earth visible |
| Mumbai–Kolkata route | Genuine backend route, 1895.9 km, displayed on globe |
| Fit route | Full real route shown; no route geometry changes |
| 2D/3D switching | Route and regional camera remain usable |
| City/close imagery quality | Not available: no configured ion imagery |
| Live labels/ion terrain | Not verified: credentials/assets absent |

Screenshots confirm regional fallback, not successful high-resolution rendering.
The prior pass verified rotation. This pass does not claim exhaustive live tilt,
memory profiling, every worker request or every simulated provider failure.

Automated checks: 72 Vitest tests across 14 files and 10 Node compatibility
tests passed; typecheck and production build passed. The existing large bundle
warning remains. No backend code was changed for this imagery task, so Python
tests were not rerun for it.

Regressions verify that metadata alone is not tile success, a configured but
unloaded provider cannot cause a close selection flight, discarded/outside-
coverage imagery does not qualify, tile errors restore fallback limits, real
route geometry is fitted without a second Viewer, and HTTP error messages do
not echo private URLs. Existing labels, terrain, token, lifecycle, route and
search tests remain intact. Remote failure/success cases are mocks; they do not
establish live account authorization or resolution.

## Local configuration needed to finish

1. In the user's Cesium ion account, select a **base imagery** asset with the
   required India/city coverage. A labels-only asset is not a base surface.
   Verify its preview, licence, maximum useful zoom and geographic coverage.
2. Create/use an application token with `assets:read` for that asset and the
   terrain/labels assets actually needed. The legacy ion geocoder additionally
   needs `geocode`. Do not grant private management scopes to a browser token.
3. Configure the exact development origins when restricting Allowed URLs,
   including `http://127.0.0.1:5173/` and, if used, `http://localhost:5173/`.
   Restricted tokens require an appropriate Referer header.
4. Put `VITE_CESIUM_ION_TOKEN` and the actual
   `VITE_CESIUM_ION_IMAGERY_ASSET_ID` into ignored `.env.local`, or fill their
   existing entries in `.env`. Optional labels use a separate compatible asset
   ID in `VITE_CESIUM_ION_LABELS_ASSET_ID`. Do not paste the token into chat.
5. Restart Vite after configuration changes. FastAPI's dotenv load is separate
   and cannot configure the already-running frontend.
6. Repeat the city/close-zoom visual and network checks. Only then can detailed
   imagery acceptance be marked complete. If the asset is regional/coarse,
   choose an account-available higher-resolution imagery asset; no universal
   asset ID is assumed or fabricated here.

Official references:
[ion access tokens](https://cesium.com/learn/ion/cesium-ion-access-tokens/),
[IonImageryProvider](https://cesium.com/learn/cesiumjs/ref-doc/IonImageryProvider.html).

**Acceptance remains blocked on account-specific configuration.** The fallback
and camera/status fixes are complete and tested. High-resolution ion imagery
has not been loaded or verified on this laptop during this task.
