import { afterEach, expect, it, vi } from 'vitest';
import { searchLocations } from './locationSearch';

afterEach(() => vi.unstubAllGlobals());

it('distinguishes proxy failures, non-JSON success, malformed JSON and empty success', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('', { status: 500, headers: { 'content-type': 'text/plain' } }))
    .mockResolvedValueOnce(new Response('<html>private upstream details</html>', { headers: { 'content-type': 'text/html' } }))
    .mockResolvedValueOnce(new Response('{', { headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response('{"results":[],"attribution":"OSM"}', { headers: { 'content-type': 'application/json' } })));
  await expect(searchLocations('Mumbai')).rejects.toThrow('HTTP 500');
  await expect(searchLocations('Mumbai')).rejects.toThrow('non-JSON response');
  await expect(searchLocations('Mumbai')).rejects.toThrow('malformed JSON');
  await expect(searchLocations('Mumbai')).resolves.toEqual([]);
});

it('parses the canonical results response and sends the expected query', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 'mumbai', name: 'Mumbai', displayName: 'Mumbai, India', coordinates: { latitude: 19.076, longitude: 72.8777 } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(searchLocations(' Mumbai ')).resolves.toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/locations/search?q=Mumbai', expect.objectContaining({ headers: { Accept: 'application/json' } }));
});

it('distinguishes provider errors and malformed successful responses', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Location search is rate-limited; please try again shortly.' }), { status: 429, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'raw-array' }]), { status: 200, headers: { 'content-type': 'application/json' } })));
  await expect(searchLocations('Mumbai')).rejects.toThrow('rate-limited');
  await expect(searchLocations('Mumbai')).rejects.toThrow('unexpected response structure');
});

it('shows FastAPI detail errors and supports a legacy message response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Search provider timed out.' }), { status: 504, headers: { 'content-type': 'application/json' } })).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Try later.' }), { status: 503, headers: { 'content-type': 'application/json' } })));
  await expect(searchLocations('Delhi')).rejects.toThrow('Search provider timed out.');
  await expect(searchLocations('Delhi')).rejects.toThrow('Try later.');
});
