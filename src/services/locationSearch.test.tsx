import { afterEach, expect, it, vi } from 'vitest';
import { searchLocations } from './locationSearch';

afterEach(() => vi.unstubAllGlobals());

it('parses the canonical results response and sends the expected query', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 'mumbai', name: 'Mumbai', displayName: 'Mumbai, India', coordinates: { latitude: 19.076, longitude: 72.8777 } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(searchLocations(' Mumbai ')).resolves.toHaveLength(1);
  expect(fetchMock).toHaveBeenCalledWith('/api/locations/search?q=Mumbai', expect.objectContaining({ headers: { Accept: 'application/json' } }));
});

it('distinguishes provider errors and malformed successful responses', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Location search is rate-limited; please try again shortly.' }), { status: 429 }))
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'raw-array' }]), { status: 200 })));
  await expect(searchLocations('Mumbai')).rejects.toThrow('rate-limited');
  await expect(searchLocations('Mumbai')).rejects.toThrow('unexpected response structure');
});

it('shows FastAPI detail errors and supports a legacy message response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ detail: 'Search provider timed out.' }), { status: 504 })).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Try later.' }), { status: 503 })));
  await expect(searchLocations('Delhi')).rejects.toThrow('Search provider timed out.');
  await expect(searchLocations('Delhi')).rejects.toThrow('Try later.');
});
