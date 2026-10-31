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
  fitRouteRequest?: number;
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

export function MapView({ camera, selectedPlace, savedPlaces, routeGeoJSON, fitRouteRequest = 0, onCameraChange, onPlaceSelected, onError, onStatusChange }: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const latest = useRef({ camera, selectedPlace, savedPlaces, routeGeoJSON, onCameraChange, onPlaceSelected, onError, onStatusChange });
  latest.current = { camera, selectedPlace, savedPlaces, routeGeoJSON, onCameraChange, onPlaceSelected, onError, onStatusChange };

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let map: MapLibreMap;
    try { map = new maplibregl.Map({
      container: container.current,
      style: import.meta.env.VITE_MAP_STYLE_URL || DEFAULT_STYLE,
      center: [camera.center.longitude, camera.center.latitude],
      zoom: camera.zoom,
      bearing: 0,
      pitch: 0,
    }); } catch { onStatusChange?.('error'); latest.current.onError?.('The map could not initialize. WebGL support is required.'); return; }
    onStatusChange?.('loading');
    mapRef.current = map;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => map.resize()) : null;
    observer?.observe(container.current);
    const palette = getComputedStyle(document.documentElement);
    const routeColor = palette.getPropertyValue('--color-route').trim() || '#b77e3d';
    const forestColor = palette.getPropertyValue('--color-forest').trim() || '#435a4c';
    const onLoad = () => {
      if (map.getSource('terrene-places')) return;
      map.addSource('terrene-places', { type: 'geojson', data: emptyCollection, cluster: true, clusterMaxZoom: 14, clusterRadius: 40 });
      map.addSource('terrene-selection', { type: 'geojson', data: emptyCollection });
      map.addLayer({ id: 'terrene-place-halo', type: 'circle', source: 'terrene-places', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': 8, 'circle-color': '#08120f', 'circle-opacity': 0.75 } });
      map.addLayer({ id: 'terrene-places', type: 'circle', source: 'terrene-places', filter: ['!', ['has', 'point_count']], paint: { 'circle-radius': ['case', ['get', 'selected'], 7, 5], 'circle-color': ['case', ['get', 'selected'], routeColor, forestColor], 'circle-stroke-width': 2, 'circle-stroke-color': '#fbfaf6' } });
      map.addSource('terrene-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
      map.addLayer({ id: 'terrene-route', type: 'line', source: 'terrene-route', paint: { 'line-color': routeColor, 'line-width': 4, 'line-opacity': 0.9 } });
      map.addLayer({ id: 'terrene-clusters', type: 'circle', source: 'terrene-places', filter: ['has', 'point_count'], paint: { 'circle-color': forestColor, 'circle-radius': 16, 'circle-stroke-width': 2, 'circle-stroke-color': '#fbfaf6' } });
      map.addLayer({ id: 'terrene-cluster-count', type: 'symbol', source: 'terrene-places', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 11 }, paint: { 'text-color': '#fbfaf6' } });
      map.addLayer({ id: 'terrene-selection', type: 'circle', source: 'terrene-selection', paint: { 'circle-radius': 7, 'circle-color': routeColor, 'circle-stroke-width': 2, 'circle-stroke-color': '#fbfaf6' } });
      updateOverlays(map);
      latest.current.onStatusChange?.('ready');
    };
    const updateCamera = () => {
      const center = map.getCenter();
      latest.current.onCameraChange({ center: { latitude: center.lat, longitude: center.lng }, zoom: map.getZoom(), bearing: 0, pitch: 0 });
    };
    const onClick = (event: MapMouseEvent) => {
      if (!map.getSource('terrene-places')) return;
      const features = map.queryRenderedFeatures(event.point, { layers: ['terrene-selection', 'terrene-clusters', 'terrene-places'] });
      const cluster = features.find(feature => feature.properties?.cluster_id !== undefined);
      if (cluster && cluster.geometry.type === 'Point') {
        const center = cluster.geometry.coordinates as [number, number];
        const source = map.getSource('terrene-places') as GeoJSONSource;
        void source.getClusterExpansionZoom(Number(cluster.properties.cluster_id)).then(zoom => {
          if (mapRef.current === map) map.easeTo({ center, zoom, duration: 0 });
        }).catch(() => { if (mapRef.current === map) latest.current.onError?.('This group of places could not be expanded. Zoom in to see its places.'); });
        return;
      }
      const id = features[0]?.properties?.id;
      if (id) {
        const place = mergeSelection(latest.current.savedPlaces, latest.current.selectedPlace).find(item => item.id === id);
        if (place) latest.current.onPlaceSelected(place);
        return;
      }
      latest.current.onPlaceSelected({ id: 'picked', name: 'Selected point', coordinates: { latitude: event.lngLat.lat, longitude: event.lngLat.lng } });
    };
    const onError = (event: { error?: { message?: string } }) => { latest.current.onStatusChange?.('error'); latest.current.onError?.(event.error?.message ?? 'The 2D map could not load.'); };
    map.on('load', onLoad);
    map.on('style.load', onLoad);
    map.on('moveend', updateCamera);
    map.on('click', onClick);
    map.on('error', onError);
    return () => { observer?.disconnect(); map.remove(); mapRef.current = null; };

    function updateOverlays(current: MapLibreMap) {
      const places = current.getSource('terrene-places') as GeoJSONSource | undefined;
      if (places) places.setData(placesGeoJSON(latest.current.savedPlaces, latest.current.selectedPlace?.id ?? null));
      const selection = current.getSource('terrene-selection') as GeoJSONSource | undefined;
      selection?.setData(placesGeoJSON(latest.current.selectedPlace ? [latest.current.selectedPlace] : [], latest.current.selectedPlace?.id ?? null));
      const route = current.getSource('terrene-route') as GeoJSONSource | undefined;
      if (route) route.setData(latest.current.routeGeoJSON ? { type: 'Feature', geometry: latest.current.routeGeoJSON, properties: {} } : { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
    }
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const places = map.getSource('terrene-places') as GeoJSONSource | undefined;
    if (places) places.setData(placesGeoJSON(savedPlaces, selectedPlace?.id ?? null));
    const selection = map.getSource('terrene-selection') as GeoJSONSource | undefined;
    selection?.setData(placesGeoJSON(selectedPlace ? [selectedPlace] : [], selectedPlace?.id ?? null));
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitRouteRequest || !routeGeoJSON?.coordinates.length) return;
    const bounds = routeGeoJSON.coordinates.reduce((b, [lon, lat]) => [Math.min(b[0], lon), Math.min(b[1], lat), Math.max(b[2], lon), Math.max(b[3], lat)], [Infinity, Infinity, -Infinity, -Infinity]);
    map.fitBounds([[bounds[0], bounds[1]], [bounds[2], bounds[3]]], { padding: 60, maxZoom: 15, duration: 0 });
  }, [fitRouteRequest]);

  return <div ref={container} className="map-view" aria-label="2D tourist map" />;
}

function mergeSelection(places: Place[], selected: Place | null) {
  return selected && !places.some(place => place.id === selected.id) ? [...places, selected] : places;
}
