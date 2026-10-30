import test from 'node:test';
import assert from 'node:assert/strict';
import { validCoordinates, markerPlan, searchTerm, abortable } from '../src/globe/logic.ts';

test('WGS84 bounds, finite values, optional and negative heights', () => {
  for (const c of [{latitude: 90, longitude: 180}, {latitude: -90, longitude: -180}, {latitude: 27.9881, longitude: 86.925, heightMeters: 8849}, {latitude: 31.5, longitude: 35.5, heightMeters: -430}]) assert.equal(validCoordinates(c), true);
  for (const c of [{latitude: 91, longitude: 0}, {latitude: 0, longitude: -181}, {latitude: NaN, longitude: 0}, {latitude: 0, longitude: Infinity}, {latitude: 0, longitude: 0, heightMeters: NaN}]) assert.equal(validCoordinates(c), false);
});
test('marker plan retains first valid unique ID and geographic mapping', () => {
  const point = {latitude: 51.5, longitude: -0.12};
  const first = {id: 'london', label: 'London', coordinates: point};
  const result = markerPlan([first, {...first, label: 'duplicate'}, {id: 'bad', label: '', coordinates: {latitude: 100, longitude: 0}}]);
  assert.deepEqual(result.accepted, [first]);
  assert.deepEqual(result.rejected, ['london', 'bad']);
  assert.deepEqual(markerPlan([]), {accepted: [], rejected: []});
});
test('search trims input and rejects empty and oversized queries', () => {
  assert.equal(searchTerm('  Paris  '), 'Paris');
  assert.equal(searchTerm('   '), '');
  assert.equal(searchTerm('x'.repeat(257)), '');
});
test('cancellation rejects promptly while provider is pending', async () => {
  const controller = new AbortController();
  const pending = abortable(new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(pending, {name: 'AbortError'});
  await assert.rejects(abortable(Promise.resolve([]), controller.signal), {name: 'AbortError'});
});
test('provider success, empty results and failures propagate', async () => {
  assert.deepEqual(await abortable(Promise.resolve([])), []);
  await assert.rejects(abortable(Promise.reject(new Error('provider failed'))), /provider failed/);
});

test('already cancelled requests still observe a rejecting provider promise', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(abortable(Promise.reject(new Error('late failure')), controller.signal), {name: 'AbortError'});
  await new Promise(resolve => setImmediate(resolve));
});
