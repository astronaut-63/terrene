import { expect, it } from 'vitest';
import { initialRouteSession, routeReducer } from './routes';
const a = { type: 'LineString' as const, coordinates: [[1, 2], [3, 4]] as [number, number][] };
const b = { type: 'LineString' as const, coordinates: [[5, 6], [7, 8]] as [number, number][] };
it('keeps another feature route visible when an inactive feature invalidates', () => {
  const route = routeReducer(initialRouteSession, { type: 'set', owner: 'route', geometry: a });
  const journey = routeReducer(route, { type: 'set', owner: 'journey', geometry: b });
  const invalidated = routeReducer(journey, { type: 'set', owner: 'route', geometry: null });
  expect(invalidated.active).toBe('journey'); expect(invalidated.routes.journey).toBe(b); expect(invalidated.routes.route).toBeUndefined();
});
it('preserves routes across tool switching and only clears the owner', () => {
  let state = routeReducer(initialRouteSession, { type: 'set', owner: 'route', geometry: a });
  state = routeReducer(state, { type: 'set', owner: 'journey', geometry: b });
  state = routeReducer(state, { type: 'activate', owner: 'route' });
  expect(state.active).toBe('route'); expect(state.routes.journey).toBe(b);
  state = routeReducer(state, { type: 'set', owner: 'route', geometry: null });
  expect(state.active).toBeNull(); expect(state.routes.journey).toBe(b);
  state = routeReducer(state, { type: 'activate', owner: 'journey' }); expect(state.active).toBe('journey');
});

it('keeps the current route when an inactive tool finishes a background calculation', () => {
 let state = routeReducer(initialRouteSession, { type: 'set', owner: 'route', geometry: a });
 state = routeReducer(state, { type: 'set', owner: 'journey', geometry: b, activate: false });
 expect(state.active).toBe('route'); expect(state.routes.journey).toBe(b);
 state = routeReducer(state, { type: 'activate', owner: 'journey' }); expect(state.active).toBe('journey');
});
