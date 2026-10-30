import type { GeoCoordinates, GlobeMarker } from './contracts';

export function validCoordinates(c: GeoCoordinates): boolean {
  return !!c && Number.isFinite(c.latitude) && Math.abs(c.latitude) <= 90 &&
    Number.isFinite(c.longitude) && Math.abs(c.longitude) <= 180 &&
    (c.heightMeters === undefined || Number.isFinite(c.heightMeters));
}

export function markerPlan(markers: GlobeMarker[]) {
  const seen = new Set<string>();
  const accepted: GlobeMarker[] = [];
  const rejected: string[] = [];
  for (const marker of markers) {
    if (!marker.id || seen.has(marker.id) || !validCoordinates(marker.coordinates)) {
      rejected.push(marker.id);
      continue;
    }
    seen.add(marker.id);
    accepted.push(marker);
  }
  return { accepted, rejected };
}

export function searchTerm(query: string): string {
  if (typeof query !== 'string') return '';
  const term = query.trim();
  return term.length <= 256 ? term : '';
}

export function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(new DOMException('Search cancelled', 'AbortError')); };
    // Always observe the provider promise, even if cancellation already happened.
    promise.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}
