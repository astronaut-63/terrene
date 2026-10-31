export interface GeoCoordinates {
  latitude: number;
  longitude: number;
  heightMeters?: number;
}

export interface Place {
  priority?: number;
  id: string;
  name: string;
  displayName?: string;
  coordinates: GeoCoordinates;
  category?: string;
  metadata?: Record<string, string>;
  accessibility?: string;
}

export interface GeographicLocation extends Place {
  displayName: string;
}

export interface LocationSearchResponse {
  results: GeographicLocation[];
}

export type MapMode = '2d' | '3d';

export interface MapCamera2D {
  center: GeoCoordinates;
  zoom: number;
  bearing: number;
  pitch: 0;
}

export interface MapCamera3D {
  center: GeoCoordinates;
  rangeMeters: number;
  headingDegrees: number;
  pitchDegrees: number;
}

export interface RouteGeoJSON {
  type: 'LineString';
  coordinates: Array<[longitude: number, latitude: number]>;
}
