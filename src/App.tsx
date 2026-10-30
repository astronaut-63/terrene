import { lazy, Suspense, type FormEvent, useEffect, useRef, useState } from 'react';
import type { GeoCoordinates, MapCamera2D, MapMode, Place, RouteGeoJSON } from './domain/geo';
import { searchLocations } from './services/locationSearch';
import { MapView } from './map/MapView';
import type { GlobeCamera, GlobeLabelsStatus, GlobeMarker, GlobeStatus } from './globe/contracts';

const EarthGlobe = lazy(() => import('./globe/EarthGlobe').then(module => ({ default: module.EarthGlobe })));
const examples: Place[] = [
  { id: 'example-everest', name: 'Everest', displayName: 'Himalayas · example destination', coordinates: { latitude: 27.9881, longitude: 86.925 } },
  { id: 'example-grand-canyon', name: 'Grand Canyon', displayName: 'Arizona · example destination', coordinates: { latitude: 36.1069, longitude: -112.1129 } },
  { id: 'example-cape-town', name: 'Cape Town', displayName: 'South Africa · example destination', coordinates: { latitude: -33.9249, longitude: 18.4241 } },
];
type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';
type SolarResult = { sunrise_utc: string | null; sunset_utc: string | null; solar_noon_utc: string; day_length_seconds: number | null };
const default2dCamera: MapCamera2D = { center: { latitude: 20, longitude: 20 }, zoom: 2, bearing: 0, pitch: 0 };
const default3dCamera: GlobeCamera = { center: { latitude: 20, longitude: 20 }, rangeMeters: 20_000_000, headingDegrees: 0, pitchDegrees: -60 };
const statusLabel: Record<string, string> = { loading: 'Loading map', ready: 'Map ready', initializing: 'Initialising globe', degraded: 'Globe running with limited resources', error: 'Map unavailable' };
const labelsStatusText: Record<GlobeLabelsStatus, string> = { loading: 'Loading labels…', enabled: 'Labels on', hidden: 'Labels off', unavailable: 'Labels unavailable', failed: 'Labels failed' };
const coordinatesText = (c: GeoCoordinates) => c.latitude.toFixed(4) + '° latitude, ' + c.longitude.toFixed(4) + '° longitude';

export function App() {
  const [activeMode, setActiveMode] = useState<MapMode>('2d');
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]);
  const [routeGeoJSON] = useState<RouteGeoJSON | null>(null);
  const [mapCamera, setMapCamera] = useState<MapCamera2D>(default2dCamera);
  const [globeCamera, setGlobeCamera] = useState<GlobeCamera>(default3dCamera);
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<Place[]>([]);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [globeStatus, setGlobeStatus] = useState<GlobeStatus>('initializing');
  const [globeError, setGlobeError] = useState<{ code: string; message: string } | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [labelsStatus, setLabelsStatus] = useState<GlobeLabelsStatus>('loading');
  const [solarDate, setSolarDate] = useState('2026-11-01');
  const [solarResult, setSolarResult] = useState<SolarResult | null>(null);
  const [solarState, setSolarState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [solarError, setSolarError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  function selectPlace(place: Place) {
    setSelectedPlace(place);
    setMapCamera(camera => ({ ...camera, center: place.coordinates, zoom: Math.max(camera.zoom, 11) }));
    setGlobeCamera(camera => ({ ...camera, center: place.coordinates, rangeMeters: 100_000 }));
  }
  function selectCoordinates(coordinates: GeoCoordinates) { selectPlace({ id: 'picked', name: 'Selected point', coordinates }); }
  function addSavedPlace() { if (selectedPlace) setSavedPlaces(current => current.some(place => place.id === selectedPlace.id) ? current : [...current, selectedPlace]); }
  function removeSavedPlace(id: string) { setSavedPlaces(current => current.filter(place => place.id !== id)); }
  function switchMode(mode: MapMode) {
    if (mode === activeMode) return;
    if (mode === '3d') setGlobeCamera(camera => selectedPlace ? { ...camera, center: selectedPlace.coordinates, rangeMeters: 100_000 } : camera);
    if (mode === '2d') setMapCamera(camera => selectedPlace ? { ...camera, center: selectedPlace.coordinates, zoom: Math.max(camera.zoom, 11) } : camera);
    setActiveMode(mode);
  }
  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim(); controllerRef.current?.abort();
    if (!term) { setResults([]); setSearchError('Enter a place, street or destination to search.'); setSearchState('error'); return; }
    const controller = new AbortController(); controllerRef.current = controller; setSearchState('loading'); setSearchError(null); setResults([]);
    try { const locations = await searchLocations(term, controller.signal); if (controller.signal.aborted) return; setResults(locations); setSearchState(locations.length ? 'success' : 'empty'); }
    catch (error) { if (controller.signal.aborted) return; setSearchError(error instanceof Error ? error.message : 'Location search is unavailable.'); setSearchState('error'); }
  }
  async function calculateDaylight() {
    if (!selectedPlace) return;
    setSolarState('loading'); setSolarError(null); setSolarResult(null);
    try { const { latitude, longitude } = selectedPlace.coordinates; const response = await fetch('/api/solar?lat=' + latitude + '&lon=' + longitude + '&date=' + solarDate, { headers: { Accept: 'application/json' } }); const body = await response.json(); if (!response.ok) throw new Error(body.detail ?? body.error ?? 'Solar calculation failed.'); setSolarResult(body); setSolarState('idle'); }
    catch (error) { setSolarState('error'); setSolarError(error instanceof Error ? error.message : 'Solar backend is unavailable.'); }
  }
  const markerPlaces: GlobeMarker[] = savedPlaces.map(place => ({ id: place.id, label: place.name, coordinates: place.coordinates }));
  const currentStatus = activeMode === '2d' ? mapStatus : globeStatus;
  const formatUtc = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Undefined';
  const formatDuration = (seconds: number | null) => seconds === null ? 'Undefined' : Math.floor(seconds / 3600) + 'h ' + Math.round((seconds % 3600) / 60) + 'm';

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#explore" aria-label="Terrene exploration home"><span className="brand-mark" aria-hidden="true">◉</span> Terrene</a><nav aria-label="Primary navigation"><a href="#explore">Explore</a></nav><div className="mode-switch" role="group" aria-label="Map mode"><button className={activeMode === '2d' ? 'active' : 'quiet'} aria-pressed={activeMode === '2d'} onClick={() => switchMode('2d')}>2D Map</button><button className={activeMode === '3d' ? 'active' : 'quiet'} aria-pressed={activeMode === '3d'} onClick={() => switchMode('3d')}>3D Globe</button></div><span className="status-pill" data-status={currentStatus} role="status"><span aria-hidden="true" />{statusLabel[currentStatus]}</span></header>
    <section className="exploration" id="explore" aria-label="Terrene mapping workspace">
      <div className="map-stage">{activeMode === '2d' ? <MapView camera={mapCamera} selectedPlace={selectedPlace} savedPlaces={savedPlaces} routeGeoJSON={routeGeoJSON} onCameraChange={setMapCamera} onPlaceSelected={selectPlace} onStatusChange={setMapStatus} onError={message => setGlobeError({ code: 'MAP_ERROR', message })} /> : <Suspense fallback={<div className="map-loading">Loading the 3D Earth…</div>}><EarthGlobe initialCamera={globeCamera} selectedLocation={selectedPlace} markers={markerPlaces} routeGeoJSON={routeGeoJSON} showLabels={showLabels} onCameraChange={setGlobeCamera} onCoordinatesSelected={selectCoordinates} onMarkerSelected={id => { const place = savedPlaces.find(item => item.id === id); if (place) selectPlace(place); }} onStatusChange={setGlobeStatus} onError={setGlobeError} onLabelsStatusChange={setLabelsStatus} /></Suspense>}</div>
      <aside className="search-panel panel" aria-label="Location search"><p className="eyebrow">Discover places</p><form onSubmit={submitSearch} noValidate><label htmlFor="location-search">Search places, streets and destinations</label><div className="search-row"><input id="location-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="City, street or attraction" autoComplete="off" maxLength={256} /><button type="submit" disabled={searchState === 'loading'}>{searchState === 'loading' ? 'Searching' : 'Search'}</button></div></form>{searchState === 'loading' && <p className="hint" role="status">Looking for places…</p>}{searchState === 'empty' && <p className="hint">No places matched that search.</p>}{searchState === 'error' && <p className="message error" role="alert">{searchError}</p>}{searchState === 'success' && <ul className="results" aria-label="Search results">{results.map(place => <li key={place.id}><button onClick={() => selectPlace(place)}><strong>{place.name}</strong><span>{place.displayName ?? coordinatesText(place.coordinates)}</span></button></li>)}</ul>}<p className="eyebrow example-title">Explore destinations</p><div className="example-buttons">{examples.map(place => <button className="quiet" key={place.id} onClick={() => selectPlace(place)}>{place.name}</button>)}</div>{activeMode === '3d' && <div className="map-labels-control"><label><input type="checkbox" checked={labelsStatus === 'enabled' ? showLabels : false} disabled={labelsStatus !== 'enabled' && labelsStatus !== 'hidden'} onChange={event => setShowLabels(event.target.checked)} /> Map labels</label><span className="hint">{labelsStatusText[labelsStatus]}</span></div>}</aside>
      <aside className="location-panel panel" aria-label="Selected place"><p className="eyebrow">Selected place</p>{selectedPlace ? <><h2>{selectedPlace.name}</h2>{selectedPlace.displayName && <p className="place-name">{selectedPlace.displayName}</p>}<dl><div><dt>Latitude</dt><dd>{selectedPlace.coordinates.latitude.toFixed(4)}°</dd></div><div><dt>Longitude</dt><dd>{selectedPlace.coordinates.longitude.toFixed(4)}°</dd></div></dl><div className="button-row"><button onClick={addSavedPlace}>Save place</button><button className="quiet" onClick={() => setSelectedPlace(null)}>Clear</button></div></> : <p className="hint">Choose a search result, destination, or point on the map.</p>}</aside>
      <aside className="marker-panel panel" aria-label="Saved places"><p className="eyebrow">Saved places</p>{savedPlaces.length ? <ul className="markers">{savedPlaces.map(place => <li key={place.id} className={selectedPlace?.id === place.id ? 'selected' : ''}><button onClick={() => selectPlace(place)} aria-pressed={selectedPlace?.id === place.id}>{place.name}<span>{coordinatesText(place.coordinates)}</span></button><button className="icon-button" aria-label={'Remove ' + place.name + ' saved place'} onClick={() => removeSavedPlace(place.id)}>×</button></li>)}</ul> : <p className="hint">Saved destinations will appear in both map modes.</p>}</aside>
      <aside className="solar-panel panel" aria-label="Solar explorer"><p className="eyebrow">Solar explorer</p><p className="hint">Daylight context for the selected destination.</p><label htmlFor="solar-date">Date</label><div className="search-row"><input id="solar-date" type="date" value={solarDate} onChange={event => setSolarDate(event.target.value)} /><button onClick={calculateDaylight} disabled={!selectedPlace || solarState === 'loading'}>{solarState === 'loading' ? 'Calculating…' : 'Calculate daylight'}</button></div>{solarError && <p className="message error" role="alert">{solarError}</p>}{solarResult && <dl className="solar-results"><div><dt>Sunrise</dt><dd>{formatUtc(solarResult.sunrise_utc)}</dd></div><div><dt>Sunset</dt><dd>{formatUtc(solarResult.sunset_utc)}</dd></div><div><dt>Solar noon</dt><dd>{formatUtc(solarResult.solar_noon_utc)}</dd></div><div><dt>Day length</dt><dd>{formatDuration(solarResult.day_length_seconds)}</dd></div></dl>}</aside>
      {globeError && activeMode === '3d' && <p className="message engine-message workspace-message" role="status">{globeError.message}</p>}
    </section>
  </main>;
}
