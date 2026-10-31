# Frontend implementation

## Preflight, 31 October 2026

- Checkout: terrene-journey-integration. Clean working tree before edits.
- Starting branch: feat/earth-engine. HEAD and remote default HEAD: 25c679afa09e67b3f7d230c3e9a8183b560872ac.
- Working branch: codex/frontend-experience. Other worktrees contain existing changes and are untouched.
- No AGENTS.md found in the workspace. No local listening services found on 3002, 5173, 5174 or 4173.
- Architecture: React 19, TypeScript, Vite, MapLibre default, lazy Cesium secondary; canonical FastAPI backend.main:app, SQLAlchemy and existing Alembic migrations.
- Inventory: App, MapView, EarthGlobe and its contracts, RoutePlanner, JourneyExplorer, ItineraryPlanner, Discovery, PlaceHours; search, routing, journeys, itineraries, places, saved places, trip CRUD, solar and availability APIs inspected.

## Implementation checklist

1. Regression fixes: errors, route ownership, solar cancellation, break budgets, final destination omission, partial discovery failures.
2. Warm semantic design tokens, reusable SVG icons and inline feedback.
3. Persistent map, contextual navigation and preserved feature panels.
4. Integrated search, selected place, route/trip editor, journeys, itineraries, discovery and secondary tools.
5. Responsive and keyboard verification, backend suite, npm tests, typecheck and build.
6. Favicon, truthful draft legal pages, provider attribution and production/launch checklist.

## Risks and external gates

- Live routing requires a backend credential; mocks do not verify providers.
- Map/imagery and public data services depend on network access, coverage and provider terms.
- Guest identity cookie lasts 30 days; saved data does not expire automatically in current database code.
- Domain, hosting operator, legal approval and production retention policy are undecided. No deployment authorized.
- Map and globe bundles remain large. Preserve lazy globe loading and map cleanup.
