import type { GeographicLocation, LocationSearchResponse } from '../domain/geo';

export type LocationSearch = (query: string, signal?: AbortSignal) => Promise<GeographicLocation[]>;

function isLocationSearchResponse(body: unknown): body is LocationSearchResponse {
  if (!body || typeof body !== 'object' || !Array.isArray((body as { results?: unknown }).results)) return false;
  return (body as LocationSearchResponse).results.every(location => {
    const coordinates = location?.coordinates;
    return typeof location?.id === 'string' && typeof location?.name === 'string' && typeof location?.displayName === 'string' &&
      typeof coordinates?.latitude === 'number' && Number.isFinite(coordinates.latitude) && coordinates.latitude >= -90 && coordinates.latitude <= 90 &&
      typeof coordinates?.longitude === 'number' && Number.isFinite(coordinates.longitude) && coordinates.longitude >= -180 && coordinates.longitude <= 180;
  });
}

export const searchLocations: LocationSearch = async (query, signal) => {
  const term = query.trim();
  if (!term || term.length > 256) return [];
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
  let response: Response;
  try {
    response = await fetch(`/api/locations/search?q=${encodeURIComponent(term)}`, { signal, headers: { Accept: 'application/json' } });
  } catch {
    if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    throw new Error('Location search backend is unavailable. Start the Node backend.');
  }
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('Location search returned invalid data.'); }
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : 'Location search failed.';
    throw new Error(message);
  }
  if (!isLocationSearchResponse(body)) throw new Error('Location search returned an unexpected response structure.');
  return body.results;
};
