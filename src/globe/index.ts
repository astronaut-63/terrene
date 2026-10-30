export type {
  EarthGlobeProps,
  GeoCoordinates,
  GeographicLocation,
  GlobeCamera,
  GlobeError,
  GlobeMarker,
  GlobeStatus,
  LocationSearch,
} from "./contracts";

/**
 * Reserved public search entry point. The Earth engine will register a real
 * provider adapter; this foundation deliberately never invents locations.
 */
export const searchLocations = async (
  _query: string,
  _signal?: AbortSignal,
): Promise<never[]> => {
  throw new Error("Location search is not configured. Add an Earth engine provider adapter.");
};
