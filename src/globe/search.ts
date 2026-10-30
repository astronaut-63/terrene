import type { Viewer } from 'cesium';
import type { GeographicLocation, LocationSearch } from './contracts';
import { searchTerm } from './logic';

const providers = new Map<symbol, LocationSearch>();

export function attachSearch(_viewer: Viewer, _token: string, _failed: () => void) { return () => undefined; }

export const searchLocations: LocationSearch = async (query, signal) => {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
  const term = searchTerm(query);
  if (!term) return [];
  let response: Response;
  try { response = await fetch(`${(import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')}/api/locations/search?q=${encodeURIComponent(term)}`, { signal, headers: { Accept: 'application/json' } }); }
  catch { if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError'); throw new Error('Location search backend is unavailable.'); }
  let body: { results?: GeographicLocation[]; error?: string } = {};
  try { body = await response.json(); } catch { throw new Error('Location search returned invalid data.'); }
  if (!response.ok) throw new Error(body.error ?? 'Location search failed.');
  if (!Array.isArray(body.results)) throw new Error('Location search returned invalid data.');
  return body.results;
};
