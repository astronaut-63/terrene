# Globe interface

`src/globe` is Terrene's public boundary for the application shell. Consumers must import its types and functions from `src/globe`, and must not import Cesium classes.

## Coordinates and camera

`GeoCoordinates` uses WGS84 latitude and longitude in decimal degrees. Latitude is in `[-90, 90]`; longitude is conventionally in `[-180, 180]`. `heightMeters` is optional metres above the WGS84 ellipsoid. `GlobeCamera.rangeMeters` is metres; heading and pitch are decimal degrees.

## Controlled inputs

`selectedLocation` is nullable: `null` clears the application selection. `markers` is controlled by the application; the globe renders the supplied list and does not create a second marker store. Marker IDs must be unique. A duplicate ID is an invalid caller input and future engine behavior will report it through `onError`.

## Events and state

`onCoordinatesSelected` emits a valid WGS84 point after a globe click. `onLocationSelected` emits the selected public location. `onMarkerSelected` emits only the marker ID. `onStatusChange` transitions through `initializing`, `ready`, `degraded`, or `error`; degraded means usable fallback capability remains. `onError` uses a stable `{ code, message }` payload and does not imply the globe is unusable.

## Search

`searchLocations(query, signal?)` returns normalized `GeographicLocation` results only. Calls are explicitly initiated by application UI, not on every keystroke. Empty or invalid input resolves to an empty list; cancellation follows `AbortSignal`; unavailable providers reject with a documented error. The foundation exports a deliberate unavailable-provider stub that always rejects and never fabricates results. The Earth-engine task will replace it with a provider adapter without changing the signature.
