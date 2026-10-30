import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { MapCamera2D, Place, RouteGeoJSON } from '../domain/geo';

maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const emptyCollection = { type: 'FeatureCollection' as const, features: [] as Array<never> };

interface MapViewProps {
  camera: MapCamera2D;
  selectedPlace: Place | null;
  savedPlaces: Place[];
  routeGeoJSON: RouteGeoJSON | null;
  onCameraChange: (camera: MapCamera2D) => void;
  onPlaceSelected: (place: Place) => void;
  onError?: (message: string) => void;
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
}

function placesGeoJSON(places: Place[], selectedId: string | null) {
  return {
    type: 'FeatureCollection' as const,
    features: places.map(place => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [place.coordinates.longitude, place.coordinates.latitude] },
      properties: { id: place.id, name: place.name, selected: place.id === selectedId },
    })),
  };
}

export function MapView({ camera, selectedPlace, savedPlaces, routeGeoJSON, onCameraChange, onPlaceSelected, onError, onStatusChange }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const latest = useRef({ camera, selectedPlace, savedPlaces, routeGeoJSON, onCameraChange, onPlaceSelected, onError, onStatusChange });
  latest.current = { camera, selectedPlace, savedPlaces, routeGeoJSON, onCameraChange, onPlaceSelected, onError, onStatusChange };

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_STYLE,
      center: [camera.center.longitude, camera.center.latitude],
      zoom: camera.zoom,
      bearing: 0,
      pitch: 0,
    });
    onStatusChange?.('loading');
    mapRef.current = map;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    const onLoad = () => {
      if (map.getSource('terrene-places')) return;
      map.addSource('terrene-places', { type: 'geojson', data: emptyCollection });
      map.addLayer({ id: 'terrene-place-halo', type: 'circle', source: 'terrene-places', paint: { 'circle-radius': 10, 'circle-color': '#08120f', 'circle-opacity': 0.75 } });
      map.addLayer({ id: 'terrene-places', type: 'circle', source: 'terrene-places', paint: { 'circle-radius': ['case', ['get', 'selected'], 7, 5], 'circle-color': ['case', ['get', 'selected'], '#f0c36b', '#8dd5a0'], 'circle-stroke-width': 2, 'circle-stroke-color': '#07100d' } });
      map.addSource('terrene-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
      map.addLayer({ id: 'terrene-route', type: 'line', source: 'terrene-route', paint: { 'line-color': '#efb85f', 'line-width': 4, 'line-opacity': 0.9 } });
      updateOverlays(map);
      latest.current.onStatusChange?.('ready');
    };
    const updateCamera = () => {
      const center = map.getCenter();
      latest.current.onCameraChange({ center: { latitude: center.lat, longitude: center.lng }, zoom: map.getZoom(), bearing: 0, pitch: 0 });
    };
    const onClick = (event: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ['terrene-places'] });
      const id = features[0]?.properties?.id;
      if (id) {
        const place = latest.current.savedPlaces.find(item => item.id === id);
        if (place) latest.current.onPlaceSelected(place);
        return;
      }
      latest.current.onPlaceSelected({ id: 'picked', name: 'Selected point', coordinates: { latitude: event.lngLat.lat, longitude: event.lngLat.lng } });
    };
    const onError = (event: any) => { latest.current.onStatusChange?.('error'); latest.current.onError?.(event.error?.message ?? 'The 2D map could not load.'); };
    map.on('load', onLoad);
    map.on('style.load', onLoad);
    map.on('moveend', updateCamera);
    map.on('click', onClick);
    map.on('error', onError);
    return () => { map.remove(); mapRef.current = null; };

    function updateOverlays(current: MapLibreMap) {
      const places = current.getSource('terrene-places') as GeoJSONSource | undefined;
      if (places) places.setData(placesGeoJSON(latest.current.savedPlaces, latest.current.selectedPlace?.id ?? null));
      const route = current.getSource('terrene-route') as GeoJSONSource | undefined;
      if (route) route.setData(latest.current.routeGeoJSON ? { type: 'Feature', geometry: latest.current.routeGeoJSON, properties: {} } : { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const places = map.getSource('terrene-places') as GeoJSONSource | undefined;
    if (places) places.setData(placesGeoJSON(savedPlaces, selectedPlace?.id ?? null));
    const route = map.getSource('terrene-route') as GeoJSONSource | undefined;
    if (route) route.setData(routeGeoJSON ? { type: 'Feature', geometry: routeGeoJSON, properties: {} } : { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
  }, [savedPlaces, selectedPlace, routeGeoJSON]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const current = map.getCenter();
    if (Math.abs(current.lat - camera.center.latitude) > 0.0001 || Math.abs(current.lng - camera.center.longitude) > 0.0001 || Math.abs(map.getZoom() - camera.zoom) > 0.01) {
      map.jumpTo({ center: [camera.center.longitude, camera.center.latitude], zoom: camera.zoom, bearing: 0, pitch: 0 });
    }
  }, [camera]);

  return <div ref={container} className="map-view" aria-label="2D tourist map" />;
}
