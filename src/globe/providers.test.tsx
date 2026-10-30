import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EarthGlobe } from './EarthGlobe';
import { searchLocations, attachSearch } from './search';
import { Cartesian3, Rectangle, EllipsoidTerrainProvider } from 'cesium';

const mock = vi.hoisted(() => ({ imagery: vi.fn(), terrain: vi.fn(), resource: vi.fn(), fallback: vi.fn(), geocode: vi.fn(), setup: vi.fn(), viewers: [] as any[] }));
vi.mock('cesium', async importOriginal => {
  const actual = await importOriginal<typeof import('cesium')>();
  class Viewer {
    scene = { globe: { ellipsoid: actual.Ellipsoid.WGS84, tilesLoaded: false }, renderError: new actual.Event(), postRender: new actual.Event(), requestRender: vi.fn() };
    camera = { setView: vi.fn(), cancelFlight: vi.fn(), flyToBoundingSphere: vi.fn() };
    imageryLayers = { layers: [] as any[], addImageryProvider: (provider: any) => { const layer = { provider, show: true }; this.imageryLayers.layers.push(layer); return layer; }, remove: (layer: any) => { const index = this.imageryLayers.layers.indexOf(layer); if (index >= 0) this.imageryLayers.layers.splice(index, 1); return index >= 0; } };
    entities = { values: [], remove: vi.fn(), removeById: vi.fn(), add: vi.fn() };
    cesiumWidget = { creditDisplay: { addStaticCredit: vi.fn() } };
    terrainProvider: any;
    dead = false;
    constructor(_element: any, options: any) { this.terrainProvider = options.terrainProvider; mock.viewers.push(this); }
    isDestroyed() { return this.dead; }
    destroy() { this.dead = true; }
    resize() {}
  }
  return { ...actual, Viewer, ScreenSpaceEventHandler: class { setInputAction() {} destroy() {} },
    IonImageryProvider: { fromAssetId: mock.imagery }, IonResource: { fromAssetId: mock.resource },
    CesiumTerrainProvider: { fromUrl: mock.terrain }, TileMapServiceImageryProvider: { fromUrl: mock.fallback },
    IonGeocoderService: class { constructor() { mock.setup(); } geocode = mock.geocode; }, buildModuleUrl: (s: string) => s };
});

let imagery: any, terrain: any;
beforeEach(async () => {
  vi.clearAllMocks(); mock.viewers.length = 0;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubEnv('VITE_CESIUM_ION_TOKEN', 'test-only-token');
  vi.stubEnv('VITE_CESIUM_ION_IMAGERY_ASSET_ID', '42');
  const { Event } = await import('cesium');
  imagery = { errorEvent: new Event() }; terrain = { errorEvent: new Event() };
  mock.fallback.mockResolvedValue({ errorEvent: new Event() });
  mock.imagery.mockResolvedValue(imagery); mock.resource.mockResolvedValue({}); mock.terrain.mockResolvedValue(terrain);
  mock.setup.mockImplementation(() => {}); mock.geocode.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each([undefined, '', '   '])('keeps fallback and reports absent token %s', async token => {
  vi.stubEnv('VITE_CESIUM_ION_TOKEN', token);
  const error = vi.fn(); render(<EarthGlobe onError={error} />);
  await waitFor(() => expect(mock.viewers[0].imageryLayers.layers).toHaveLength(1));
  expect(mock.imagery).not.toHaveBeenCalled(); expect(mock.resource).not.toHaveBeenCalled();
  expect(mock.viewers[0].terrainProvider).toBeInstanceOf(EllipsoidTerrainProvider);
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'ION_UNCONFIGURED' }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ id: 'paris', name: 'Paris', coordinates: { latitude: 48.85, longitude: 2.35 } }] }), { status: 200, headers: { 'content-type': 'application/json' } })));
  await expect(searchLocations('Paris')).resolves.toHaveLength(1);
});
it('waits for visible tile loading and never treats provider metadata as ready', async () => {
  const status = vi.fn(); render(<EarthGlobe onStatusChange={status} />);
  await waitFor(() => expect(mock.viewers[0].terrainProvider).toBe(terrain));
  const v = mock.viewers[0]; v.scene.postRender.raiseEvent();
  expect(status).not.toHaveBeenCalledWith('ready');
  v.scene.globe.tilesLoaded = true; v.scene.postRender.raiseEvent();
  expect(status).toHaveBeenLastCalledWith('ready');
  expect(mock.imagery).toHaveBeenCalledWith(42, { accessToken: 'test-only-token' });
  expect(mock.resource).toHaveBeenCalledWith(1, { accessToken: 'test-only-token' });
});
it('adds a labels overlay above the base and toggles it without duplication', async () => {
  vi.stubEnv('VITE_CESIUM_ION_LABELS_ASSET_ID', '3830185');
  const statuses: string[] = [];
  const view = render(<EarthGlobe showLabels onLabelsStatusChange={status => statuses.push(status)} />);
  await waitFor(() => expect(mock.viewers[0].imageryLayers.layers).toHaveLength(3));
  const layers = mock.viewers[0].imageryLayers.layers;
  expect(layers[0].provider).toBeInstanceOf(Object);
  expect(layers[2].show).toBe(true);
  view.rerender(<EarthGlobe showLabels={false} onLabelsStatusChange={status => statuses.push(status)} />);
  expect(mock.viewers[0].imageryLayers.layers).toHaveLength(3);
  expect(layers[2].show).toBe(false);
  view.rerender(<EarthGlobe showLabels onLabelsStatusChange={status => statuses.push(status)} />);
  expect(layers[2].show).toBe(true);
  expect(statuses).toContain('enabled');
  expect(statuses).toContain('hidden');
  view.unmount();
  expect(mock.viewers[0].imageryLayers.layers).toHaveLength(2);
});
it('keeps the base imagery when the labels asset is not configured', async () => {
  const status = vi.fn();
  render(<EarthGlobe onLabelsStatusChange={status} />);
  await waitFor(() => expect(mock.viewers[0].imageryLayers.layers).toHaveLength(2));
  expect(status).toHaveBeenCalledWith('unavailable');
});
it('keeps the base imagery when the labels provider fails', async () => {
  vi.stubEnv('VITE_CESIUM_ION_LABELS_ASSET_ID', '3830185');
  mock.imagery.mockResolvedValueOnce(imagery).mockRejectedValueOnce(new Error('labels unavailable'));
  const status = vi.fn();
  render(<EarthGlobe onLabelsStatusChange={status} />);
  await waitFor(() => expect(status).toHaveBeenCalledWith('failed'));
  expect(mock.viewers[0].imageryLayers.layers).toHaveLength(2);
});
it.each(['imagery', 'terrain'])('survives %s authentication/network initialization failure without leaking details', async provider => {
  mock[provider as 'imagery' | 'terrain'].mockRejectedValueOnce(new Error('private-token-url'));
  const error = vi.fn(), status = vi.fn(); render(<EarthGlobe onError={error} onStatusChange={status} />);
  await waitFor(() => expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: provider === 'imagery' ? 'ION_IMAGERY_FAILED' : 'TERRAIN_FAILED' })));
  expect(JSON.stringify(error.mock.calls)).not.toContain('private-token-url');
  expect(status).not.toHaveBeenCalledWith('ready'); expect(mock.viewers[0].dead).toBe(false);
});
it('falls back independently after tile failures and removes handlers on unmount', async () => {
  const error = vi.fn(); const view = render(<EarthGlobe onError={error} />);
  await waitFor(() => expect(mock.viewers[0].terrainProvider).toBe(terrain));
  const v = mock.viewers[0]; imagery.errorEvent.raiseEvent({}); terrain.errorEvent.raiseEvent({});
  expect(v.imageryLayers.layers[1].show).toBe(false);
  expect(v.terrainProvider).toBeInstanceOf(EllipsoidTerrainProvider);
  view.unmount(); expect(imagery.errorEvent.numberOfListeners).toBe(0); expect(terrain.errorEvent.numberOfListeners).toBe(0);
  expect(v.dead).toBe(true);
});
it('isolates geocoder construction failure from renderer initialization', async () => {
  mock.setup.mockImplementationOnce(() => { throw new Error('secret'); });
  const error = vi.fn(); render(<EarthGlobe onError={error} />);
  await waitFor(() => expect(mock.viewers[0].terrainProvider).toBe(terrain));
  expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'GEOCODER_FAILED' }));
  expect(error).not.toHaveBeenCalledWith(expect.objectContaining({ code: 'INITIALIZATION_FAILED' }));
});
it.each(['-1', 'NaN', '1.5', '9007199254740992'])('rejects invalid imagery asset ID %s', async id => {
  vi.stubEnv('VITE_CESIUM_ION_IMAGERY_ASSET_ID', id); render(<EarthGlobe />);
  await waitFor(() => expect(mock.terrain).toHaveBeenCalled()); expect(mock.imagery).not.toHaveBeenCalled();
});
it('normalizes real Cesium coordinate types, skips malformed results and deduplicates', async () => {
  render(<EarthGlobe />);
  mock.geocode.mockResolvedValue([{ displayName: 'Paris', destination: Cartesian3.fromDegrees(2.35, 48.85) }, { displayName: 'Region', destination: Rectangle.fromDegrees(10, 20, 12, 22) }, null, { displayName: 'Bad', destination: {} }, { displayName: 123, destination: {} }]);
  const results = await searchLocations(' Paris ');
  expect(mock.geocode).toHaveBeenCalledWith('Paris'); expect(results).toHaveLength(2);
  expect(results[0].coordinates.latitude).toBeCloseTo(48.85); expect(results[0].coordinates.longitude).toBeCloseTo(2.35);
  expect(results[1].coordinates.latitude).toBeCloseTo(21);
  mock.geocode.mockResolvedValue([{ displayName: 'A', destination: Rectangle.fromDegrees(0, 0, 2, 2) }, { displayName: 'A', destination: Rectangle.fromDegrees(0, 0, 2, 2) }]);
  expect(await searchLocations('A')).toHaveLength(1);
});
it('handles blank, empty, malformed, authentication, rate limit and network responses safely', async () => {
  render(<EarthGlobe />);
  expect(await searchLocations('  ')).toEqual([]); expect(mock.geocode).not.toHaveBeenCalled();
  expect(await searchLocations('No match')).toEqual([]);
  for (const failure of [401, 403, 429, 'network']) {
    mock.geocode.mockRejectedValueOnce(new Error(`${failure}: secret`));
    await expect(searchLocations('Paris')).rejects.toThrow('Cesium ion location search failed');
  }
  mock.geocode.mockResolvedValueOnce({ unexpected: true });
  await expect(searchLocations('Paris')).rejects.toThrow('Cesium ion location search failed');
});
it('discards aborted and unmounted searches without provider failure callbacks', async () => {
  render(<EarthGlobe />); const v = mock.viewers[0], failed = vi.fn();
  const detach = attachSearch(v, 'test-only-token', failed);
  let finish!: (value: any) => void;
  mock.geocode.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const controller = new AbortController(); const pending = searchLocations('Old', controller.signal);
  controller.abort(); await expect(pending).rejects.toMatchObject({ name: 'AbortError' }); finish([]);
  mock.geocode.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const closed = searchLocations('Closed'); detach(); finish([]);
  await expect(closed).rejects.toMatchObject({ name: 'AbortError' }); expect(failed).not.toHaveBeenCalled();
});
it('keeps a navigable ellipsoid when bundled imagery fails', async () => {
  vi.stubEnv('VITE_CESIUM_ION_TOKEN', ''); mock.fallback.mockRejectedValueOnce(new Error('offline'));
  const error = vi.fn(); render(<EarthGlobe onError={error} />);
  await waitFor(() => expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: 'FALLBACK_IMAGERY_FAILED' })));
  expect(mock.viewers[0].dead).toBe(false);
  expect(mock.viewers[0].terrainProvider).toBeInstanceOf(EllipsoidTerrainProvider);
});
it('does not recreate providers on camera or marker changes and ignores late initialization after unmount', async () => {
  let finish!: (value: any) => void;
  mock.imagery.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const view = render(<EarthGlobe />);
  await waitFor(() => expect(mock.imagery).toHaveBeenCalledTimes(1));
  const location = { id: 'a', name: 'A', coordinates: { latitude: 12, longitude: 34 } };
  view.rerender(<EarthGlobe selectedLocation={location} markers={[{ id: 'a', label: 'A', coordinates: location.coordinates }]} />);
  expect(mock.viewers).toHaveLength(1); expect(mock.imagery).toHaveBeenCalledTimes(1);
  expect(mock.viewers[0].camera.flyToBoundingSphere).toHaveBeenCalled();
  expect(mock.viewers[0].entities.add).toHaveBeenCalledWith(expect.objectContaining({ id: 'marker:a' }));
  view.unmount(); finish(imagery); await Promise.resolve();
  expect(mock.viewers[0].imageryLayers.layers).toHaveLength(1);
  expect(mock.terrain).not.toHaveBeenCalled();
});
