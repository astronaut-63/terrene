# Globe interface

`src/globe` is Terrene's public boundary for the application shell. Consumers must import its types and functions from `src/globe`, and must not import Cesium classes.

## Coordinates and camera

`GeoCoordinates` uses WGS84 latitude and longitude in decimal degrees. Latitude is in `[-90, 90]`; longitude is conventionally in `[-180, 180]`. `heightMeters` is optional metres above the WGS84 ellipsoid. `GlobeCamera.rangeMeters` is metres; heading and pitch are decimal degrees.

## Controlled inputs

Integration update: selected-location flights now use a 2,500 km regional range when ion detailed imagery is not configured, so bundled imagery remains useful. The 100 km range described below applies when a token and imagery asset ID are supplied. No public type signatures changed.

`selectedLocation` is nullable: `null` cancels an active flight without moving the camera. A valid location triggers a 1.5-second flight at 100 km range. Keep its object identity stable when unchanged. `initialCamera` applies only on mount; default heading is 0 degrees, pitch -60 degrees and range 10,000 km. Explicit pitch must be between -90 and 0; range must be positive. With no camera supplied, a global view is used.

`markers` is controlled by the application; supply a new array after changes. Removed markers are removed from Cesium. First valid occurrence of each ID wins; invalid coordinates and duplicate IDs report `INVALID_MARKERS`. Omitted height clamps markers to available terrain; supplied height is absolute ellipsoid height. The globe owns rendered entities, not application marker state.

## Events and state

`onCoordinatesSelected` emits a valid WGS84 point after a globe click using a ray against loaded terrain with an ellipsoid fallback; sky clicks emit nothing. Heights reflect currently loaded terrain accuracy. Marker clicks emit only `onMarkerSelected(id)`. `onLocationSelected` acknowledges acceptance of a valid selectedLocation prop, not arrival or reverse geocoding. Do not create a fresh selection object inside this callback. `onStatusChange` reports initialization, visible-tile readiness after provider setup, fallback degradation, or fatal failure; ready waits for the current globe tile queue to finish after provider setup; it does not verify geocoding, geographic coverage, visual quality, or promise all future requests will succeed. Runtime provider errors can degrade readiness. Degradation is sticky for the mount. `onError` receives `{code,message}`; invalid inputs do not make the renderer unusable. Error codes include `INITIALIZATION_FAILED`, `RENDER_ERROR`, `INVALID_CAMERA`, `INVALID_LOCATION`, `INVALID_MARKERS`, `ION_UNCONFIGURED`, `ION_IMAGERY_UNCONFIGURED`, `ION_IMAGERY_FAILED`, `FALLBACK_IMAGERY_FAILED`, `TERRAIN_FAILED`, and `GEOCODER_FAILED`.

## Search

`searchLocations(query, signal?): Promise<GeographicLocation[]>` uses the mounted globe's ion geocoder. Submit explicitly, not on every keystroke. Blank or over-256-character input returns []; no results returns []. Missing mount/token or provider failure rejects Error. Cancellation rejects DOMException with name AbortError promptly and discards late responses; Cesium's underlying HTTP request cannot be physically aborted through this API. Rectangle results use their geographic center; invalid destinations are skipped and duplicate results removed. Provider credits are displayed on the globe. Search does not select or fly automatically. A small scoped registry chooses the most recently mounted configured globe for attribution; entries are removed on cleanup. Applications should render one globe.

## Integration

The existing type shapes remain unchanged; `EarthGlobe` is now a runtime export and the search stub is replaced. Give the parent an explicit height, keep attribution unobstructed, and import only the public boundary:

```tsx
import { EarthGlobe, searchLocations } from './globe';
// selectedLocation and markers are application-owned state.
<div style={{ height: '100vh' }}>
  <EarthGlobe selectedLocation={selectedLocation} markers={markers}
    onCoordinatesSelected={setCoordinates}
    onMarkerSelected={setSelectedMarkerId}
    onStatusChange={setGlobeStatus}
    onError={setGlobeError} />
</div>
```

Callbacks can change without recreating the Viewer. Unmount removes event handlers, resize observers, geocoder registrations and GPU resources. React StrictMode mounts are supported. `src/globe/demo.tsx` is a standalone example, not the application shell.


Provider reliability update: geocoder construction errors report `GEOCODER_FAILED`
without stopping the renderer or imagery/terrain setup. Imagery tile errors hide the
hosted layer, exposing bundled imagery; terrain tile errors restore an ellipsoid.
Degradation remains sticky until remount/reload. Search failures can be retried by
submitting again. Unmount discards pending search responses before credit or render
updates. Cancellation observes late rejected provider promises without unhandled
rejections. Imagery asset IDs must be positive safe integers. Public types and
callback signatures are unchanged; no shell or styling changes were required.
