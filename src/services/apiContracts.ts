import type { GeoCoordinates, Place, RouteGeoJSON } from '../domain/geo';
export type TravelMode = 'driving' | 'walking' | 'cycling' | 'wheelchair';
export const travelModes: TravelMode[] = ['driving', 'walking', 'cycling', 'wheelchair'];
export interface RoutePlan { origin: GeoCoordinates; destination: GeoCoordinates; mode: TravelMode; itinerary?: ItineraryResult | null }
export interface RouteResult { geometry: RouteGeoJSON; distance_m: number; distance_km: number; duration_seconds: number; attribution: string; limitations: string }
export interface Weather { status: string; reason?: string | null; values?: Record<string, number | null> }
export interface Checkpoint { index?: number; coordinates: GeoCoordinates; arrival: string; progress: number; distance_m: number; elapsed_seconds?: number; weather: Weather }
export interface JourneyResult { checkpoints: Checkpoint[]; route: RouteResult; limitations: string }
export interface DiscoveryResult { results: Place[]; status?: 'ok' | 'partial'; attribution: string; coverage?: string; warning?: string | null; failed_samples?: number; successful_samples?: number }
export interface HoursResult { status: 'open' | 'closed' | 'unknown' | 'not_provided'; schedule: string | null; timestamp: string; basis: string }
export interface Trip { id: string; name: string; plan: RoutePlan }
export interface ItineraryVisit { type?: undefined; id: string; name: string; coordinates: GeoCoordinates; arrival: string; visit_start: string; visit_end: string; visit_minutes: number; opening_hours: HoursResult; travel_from_previous: { distance_m: number; duration_seconds: number } }
export interface ItineraryBreak { type: 'break'; after_stop: string; start: string; end: string; duration_minutes: number }
export interface ItineraryResult { guide_buffer_minutes?: number; status: 'ok' | 'partial'; origin: GeoCoordinates; destination: GeoCoordinates | null; departure: string; available_minutes: number; stops: Array<ItineraryVisit | ItineraryBreak>; legs: RouteResult[]; omitted_stops: Array<{ id: string; name: string; reason: string }>; destination_status: 'included' | 'omitted' | 'not_requested'; destination_omission: string | null; warnings: string[]; total_duration_minutes: number; limitations: string }
export interface SolarResult { sunrise_utc: string | null; sunset_utc: string | null; solar_noon_utc: string; day_length_seconds: number | null; solar_elevation_degrees: number; solar_azimuth_degrees: number; observation_utc: string; accuracy: string; condition?: string }

export interface JourneyRequest { origin: GeoCoordinates; destination: GeoCoordinates; mode: TravelMode; departure: string; checkpoint_count?: number; checkpoint_spacing_m?: number }
export interface ItineraryRequest { origin: GeoCoordinates; destination: GeoCoordinates | null; stops: Array<{ id: string; name: string; coordinates: GeoCoordinates; visit_minutes: number; opening_hours: string | null }>; mode: TravelMode; departure: string; available_minutes: number; break_minutes: number; break_after_stop: number | null }
export interface HoursRequest { coordinates: GeoCoordinates; schedule: string | null; timestamp: string }
