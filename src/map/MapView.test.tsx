import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MapView } from './MapView';

const mock = vi.hoisted(() => ({ instances: [] as any[] }));
vi.mock('maplibre-gl', () => {
  class MapMock {
    events: Record<string, (event?: any) => void> = {};
    sources = new Map<string, any>();
    layers: any[] = [];
    dragRotate = { disable: vi.fn() };
    touchZoomRotate = { disableRotation: vi.fn() };
    center = { lat: 20, lng: 20 };
    zoom = 2;
    constructor(public options: any) { mock.instances.push(this); }
    on(type: string, listener: (event?: any) => void) { this.events[type] = listener; return this; }
    addSource(id: string, source: any) { this.sources.set(id, { ...source, setData: vi.fn() }); }
    getSource(id: string) { return this.sources.get(id); }
    addLayer(layer: any) { this.layers.push(layer); }
    queryRenderedFeatures() { return []; }
    getCenter() { return this.center; }
    getZoom() { return this.zoom; }
    isStyleLoaded() { return true; }
    jumpTo(options: any) { this.center = { lat: options.center[1], lng: options.center[0] }; this.zoom = options.zoom; }
    remove = vi.fn();
  }
  return { Map: MapMock, setWorkerUrl: vi.fn() };
});

afterEach(() => { cleanup(); mock.instances.length = 0; });

it('initializes a flat Liberty map, disables rotation, and cleans up', async () => {
  const view = render(<MapView camera={{ center: { latitude: 20, longitude: 20 }, zoom: 2, bearing: 0, pitch: 0 }} selectedPlace={null} savedPlaces={[]} routeGeoJSON={null} onCameraChange={vi.fn()} onPlaceSelected={vi.fn()} />);
  const map = mock.instances[0];
  expect(map.options.style).toBe('https://tiles.openfreemap.org/styles/liberty');
  expect(map.options.pitch).toBe(0); expect(map.options.bearing).toBe(0);
  expect(map.dragRotate.disable).toHaveBeenCalled(); expect(map.touchZoomRotate.disableRotation).toHaveBeenCalled();
  map.events.load();
  await waitFor(() => expect(map.layers.map((layer: any) => layer.id)).toEqual(['terrene-place-halo', 'terrene-places', 'terrene-route']));
  view.unmount(); expect(map.remove).toHaveBeenCalled();
});

it('updates shared place and route overlays without creating another map', async () => {
  const view = render(<MapView camera={{ center: { latitude: 20, longitude: 20 }, zoom: 2, bearing: 0, pitch: 0 }} selectedPlace={null} savedPlaces={[]} routeGeoJSON={null} onCameraChange={vi.fn()} onPlaceSelected={vi.fn()} />);
  const map = mock.instances[0]; map.events.load();
  view.rerender(<MapView camera={{ center: { latitude: 20, longitude: 20 }, zoom: 2, bearing: 0, pitch: 0 }} selectedPlace={{ id: 'p', name: 'Paris', coordinates: { latitude: 48.85, longitude: 2.35 } }} savedPlaces={[{ id: 'p', name: 'Paris', coordinates: { latitude: 48.85, longitude: 2.35 } }]} routeGeoJSON={{ type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] }} onCameraChange={vi.fn()} onPlaceSelected={vi.fn()} />);
  expect(mock.instances).toHaveLength(1);
  expect(map.sources.get('terrene-places').setData).toHaveBeenCalled();
  expect(map.sources.get('terrene-route').setData).toHaveBeenCalled();
});
