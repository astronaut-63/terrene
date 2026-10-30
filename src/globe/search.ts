import { Cartesian3, Cartographic, GeocoderService, IonGeocoderService, Math as CesiumMath, Rectangle } from 'cesium';
import type { Viewer } from 'cesium';
import type { GeographicLocation, LocationSearch } from './contracts';
import { abortable, searchTerm, validCoordinates } from './logic';

const providers = new Map<symbol, LocationSearch>();

export function attachSearch(viewer: Viewer, token: string, failed: () => void) {
  const key = Symbol();
  let disposed = false;
  const service = new IonGeocoderService({ scene: viewer.scene, accessToken: token });
  providers.set(key, async (query, signal) => {
    try {
      const results = await abortable(service.geocode(query), signal);
      if (disposed || viewer.isDestroyed()) throw new DOMException('Search cancelled', 'AbortError');
      if (!Array.isArray(results)) throw new Error('Invalid geocoder response.');
      const locations: GeographicLocation[] = [];
      for (const result of results) {
        if (!result || typeof result.displayName !== 'string' || !result.displayName.trim()) continue;
        for (const credit of GeocoderService.getCreditsFromResult(result) ?? []) {
          viewer.cesiumWidget.creditDisplay.addStaticCredit(credit);
        }
        const destination = result.destination;
        const point = destination instanceof Rectangle ? Rectangle.center(destination) :
          destination instanceof Cartesian3 ? Cartographic.fromCartesian(destination) : undefined;
        if (!point || !result.displayName) continue;
        const coordinates = { latitude: CesiumMath.toDegrees(point.latitude), longitude: CesiumMath.toDegrees(point.longitude) };
        if (!validCoordinates(coordinates)) continue;
        const id = `${result.displayName}:${coordinates.latitude}:${coordinates.longitude}`;
        if (!locations.some(location => location.id === id)) locations.push({ id, name: result.displayName, displayName: result.displayName, coordinates });
      }
      viewer.scene.requestRender();
      return locations;
    } catch (error) {
      if (disposed || signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
      failed();
      throw new Error('Cesium ion location search failed. Check token geocode permissions and network access.');
    }
  });
  return () => { disposed = true; providers.delete(key); };
}

export const searchLocations: LocationSearch = async (query, signal) => {
  if (signal?.aborted) throw new DOMException('Search cancelled', 'AbortError');
  const term = searchTerm(query);
  if (!term) return [];
  const provider = Array.from(providers.values()).at(-1);
  if (!provider) throw new Error('Location search requires a mounted EarthGlobe and VITE_CESIUM_ION_TOKEN with geocode permission.');
  return provider(term, signal);
};
