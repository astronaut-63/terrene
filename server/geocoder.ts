export interface GeocodedLocation {
  id: string;
  name: string;
  displayName: string;
  coordinates: { latitude: number; longitude: number };
  metadata?: Record<string, string>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
interface CacheEntry { expiresAt: number; value: GeocodedLocation[] }

const MAX_QUERY_LENGTH = 256;
const MAX_CACHE_ENTRIES = 100;
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, CacheEntry>();

export function normalizeQuery(input: unknown): string {
  return typeof input === 'string' && input.trim().length <= MAX_QUERY_LENGTH ? input.trim() : '';
}

function validCoordinate(latitude: unknown, longitude: unknown): boolean {
  return typeof latitude === 'number' && Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    typeof longitude === 'number' && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

function boundedCacheSet(key: string, value: GeocodedLocation[]) {
  if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
}

export function mapNominatimResults(payload: unknown): GeocodedLocation[] {
  if (!Array.isArray(payload)) throw new Error('Geocoding provider returned malformed data.');
  const output: GeocodedLocation[] = [];
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const latitude = typeof row.lat === 'string' ? Number(row.lat) : row.lat;
    const longitude = typeof row.lon === 'string' ? Number(row.lon) : row.lon;
    if (!validCoordinate(latitude, longitude) || typeof row.display_name !== 'string' || !row.display_name.trim()) continue;
    const id = typeof row.place_id === 'number' || typeof row.place_id === 'string' ? String(row.place_id) : `${latitude}:${longitude}:${row.display_name}`;
    const metadata: Record<string, string> = {};
    for (const key of ['type', 'category', 'osm_type', 'osm_id']) if (typeof row[key] === 'string' || typeof row[key] === 'number') metadata[key] = String(row[key]);
    output.push({ id, name: row.display_name.split(',')[0].trim(), displayName: row.display_name, coordinates: { latitude: latitude as number, longitude: longitude as number }, ...(Object.keys(metadata).length ? { metadata } : {}) });
  }
  return output;
}

export async function searchNominatim(query: string, options: { fetch?: FetchLike; signal?: AbortSignal } = {}): Promise<GeocodedLocation[]> {
  const normalized = normalizeQuery(query);
  if (!normalized) return [];
  const cached = cache.get(normalized.toLowerCase());
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) cache.delete(normalized.toLowerCase());
  const fetcher = options.fetch ?? fetch;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(normalized)}`;
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.any([options.signal ?? new AbortController().signal, AbortSignal.timeout(5000)]), headers: { Accept: 'application/json', 'User-Agent': 'Terrene/0.1 (geographical exploration demo)' } });
  } catch (error) {
    if (options.signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
    throw new Error('Location search provider is unavailable.');
  }
  if (response.status === 429) throw new Error('Location search is rate-limited; please try again shortly.');
  if (!response.ok) throw new Error('Location search provider returned an error.');
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new Error('Location search provider returned invalid data.'); }
  const results = mapNominatimResults(payload);
  boundedCacheSet(normalized.toLowerCase(), results);
  return results;
}

export function clearGeocoderCache() { cache.clear(); }
