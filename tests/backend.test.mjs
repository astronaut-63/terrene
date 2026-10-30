import test from 'node:test';
import assert from 'node:assert/strict';
import { mapNominatimResults, searchNominatim, clearGeocoderCache } from '../server/geocoder.ts';
import { calculateSolar } from '../server/solar.ts';
import { handleRequest } from '../dist-server/server.js';

test('health endpoint returns a small success payload', async () => {
  const result = []; const response = { writeHead(status, headers) { result.push({ status, headers }); }, end(body) { result.push(JSON.parse(body)); } };
  await handleRequest({ method: 'GET', url: '/api/health', headers: {}, signal: new AbortController().signal }, response);
  assert.equal(result[0].status, 200); assert.deepEqual(result[1], { ok: true, service: 'terrene-backend' });
});

test('geocoder maps valid provider rows and drops invalid coordinates', () => {
  assert.deepEqual(mapNominatimResults([{ place_id: 1, display_name: 'Delhi, India', lat: '28.6139', lon: '77.2090', type: 'city' }, { display_name: 'bad', lat: '91', lon: '0' }]), [{ id: '1', name: 'Delhi', displayName: 'Delhi, India', coordinates: { latitude: 28.6139, longitude: 77.209 }, metadata: { type: 'city' } }]);
});

test('geocoder provider failures and cache behavior are explicit', async () => {
  clearGeocoderCache();
  const response = { ok: true, status: 200, async json() { return [{ place_id: 'x', display_name: 'X', lat: '1', lon: '2' }]; } };
  let calls = 0; const fetcher = async () => { calls++; return response; };
  await searchNominatim('X', { fetch: fetcher }); await searchNominatim('x', { fetch: fetcher }); assert.equal(calls, 1);
  await assert.rejects(searchNominatim('Y', { fetch: async () => { throw new Error('offline'); } }), /unavailable/);
});

test('solar output uses UTC and handles ordinary and polar dates', () => {
  const ordinary = calculateSolar('2026-06-21', 40.7128, -74.006);
  assert.equal(ordinary.timezone, 'UTC'); assert.equal(ordinary.sunriseSunsetDefined, true); assert.match(ordinary.sunriseUtc, /Z$/);
  const polar = calculateSolar('2026-06-21', 89, 0);
  assert.equal(polar.condition, 'polar-day'); assert.equal(polar.sunriseUtc, null);
  assert.throws(() => calculateSolar('2026-02-30', 0, 0), /valid/);
  assert.throws(() => calculateSolar('2026-01-01', 91, 0), /latitude/);
});
