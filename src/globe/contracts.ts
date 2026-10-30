import type { GeoCoordinates, Place, RouteGeoJSON } from '../domain/geo';

export type { GeoCoordinates, MapCamera2D, MapCamera3D, MapMode, Place, RouteGeoJSON } from '../domain/geo';
export type GeographicLocation = Place;

export interface GlobeMarker {
  id: string;
  label: string;
  coordinates: GeoCoordinates;
}

export interface GlobeCamera {
  center: GeoCoordinates;
  rangeMeters?: number;
  headingDegrees?: number;
  pitchDegrees?: number;
}

export type GlobeStatus = "initializing" | "ready" | "degraded" | "error";

export type GlobeLabelsStatus = "loading" | "enabled" | "hidden" | "unavailable" | "failed";

export interface GlobeError {
  code: string;
  message: string;
}

export interface EarthGlobeProps {
  initialCamera?: GlobeCamera;
  selectedLocation?: GeographicLocation | null;
  markers?: GlobeMarker[];
  routeGeoJSON?: RouteGeoJSON | null;
  onCameraChange?: (camera: GlobeCamera) => void;
  onCoordinatesSelected?: (coordinates: GeoCoordinates) => void;
  onLocationSelected?: (location: GeographicLocation) => void;
  onMarkerSelected?: (markerId: string) => void;
  onStatusChange?: (status: GlobeStatus) => void;
  onError?: (error: GlobeError) => void;
  showLabels?: boolean;
  onLabelsStatusChange?: (status: GlobeLabelsStatus) => void;
}

export type LocationSearch = (
  query: string,
  signal?: AbortSignal,
) => Promise<GeographicLocation[]>;
