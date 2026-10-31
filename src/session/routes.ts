import type { RouteGeoJSON } from '../domain/geo';
export type RouteOwner = 'route' | 'journey' | 'itinerary' | 'city';
export interface RouteSession { routes: Partial<Record<RouteOwner, RouteGeoJSON>>; active: RouteOwner | null }
export type RouteAction = { type: 'set'; owner: RouteOwner; geometry: RouteGeoJSON | null; activate?: boolean } | { type: 'activate'; owner: RouteOwner };
export const initialRouteSession: RouteSession = { routes: {}, active: null };
export function routeReducer(state: RouteSession, action: RouteAction): RouteSession {
  if (action.type === 'activate') return state.routes[action.owner] ? { ...state, active: action.owner } : state;
  const routes = { ...state.routes };
  if (action.geometry) { routes[action.owner] = action.geometry; return { routes, active: action.activate === false ? state.active : action.owner }; }
  delete routes[action.owner];
  return { routes, active: state.active === action.owner ? null : state.active };
}
