import { lazy, Suspense, type FormEvent, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { GeoCoordinates, MapCamera2D, MapMode, Place, RouteGeoJSON } from './domain/geo';
import { searchLocations } from './services/locationSearch';
import { apiRequest, jsonRequest, messageOf } from './services/apiClient';
import type { Trip } from './services/apiContracts';
import { MapView } from './map/MapView';
import { RoutePlanner } from './RoutePlanner';
import { Discovery } from './Discovery';
import { PlaceHours } from './PlaceHours';
import { JourneyExplorer } from './JourneyExplorer';
import { ItineraryPlanner } from './ItineraryPlanner';
import { SolarPanel } from './SolarPanel';
import { AppHeader } from './shell/AppHeader';
import { Sidebar, type Feature } from './shell/Sidebar';
import { Icon } from './ui/Icon';
import { Feedback } from './ui/Feedback';
import { LegalPage } from './LegalPage';
import { initialRouteSession, routeReducer, type RouteOwner } from './session/routes';
import type { GlobeCamera, GlobeLabelsStatus, GlobeMarker, GlobeStatus } from './globe/contracts';
const EarthGlobe = lazy(() => import('./globe/EarthGlobe').then(module => ({ default: module.EarthGlobe })));
const shortcuts: Place[] = [
  { id: 'reference-everest', name: 'Everest', displayName: 'Himalayas · Map shortcut', coordinates: { latitude: 27.9881, longitude: 86.925 } },
  { id: 'reference-grand-canyon', name: 'Grand Canyon', displayName: 'Arizona, United States · Map shortcut', coordinates: { latitude: 36.1069, longitude: -112.1129 } },
  { id: 'reference-cape-town', name: 'Cape Town', displayName: 'South Africa · Map shortcut', coordinates: { latitude: -33.9249, longitude: 18.4241 } },
];
const default2dCamera: MapCamera2D = { center: { latitude: 22, longitude: 35 }, zoom: 2.3, bearing: 0, pitch: 0 };
const default3dCamera: GlobeCamera = { center: { latitude: 22, longitude: 35 }, rangeMeters: 20_000_000, headingDegrees: 0, pitchDegrees: -60 };
const statusLabel: Record<string, string> = { loading: 'Loading map', ready: 'Map ready', initializing: 'Initialising globe', degraded: 'Globe using fallback resources', error: 'Map unavailable' };
const labelText: Record<GlobeLabelsStatus, string> = { loading: 'Loading labels…', enabled: 'Labels on', hidden: 'Labels off', unavailable: 'Labels unavailable', failed: 'Labels failed' };
const coordinatesText = (c: GeoCoordinates) => c.latitude.toFixed(4) + '°, ' + c.longitude.toFixed(4) + '°';
export function App() {
  const path = window.location.pathname.replace(/\/$/, '');
  if (path === '/privacy' || path === '/terms') return <LegalPage page={path === '/privacy' ? 'privacy' : 'terms'} />;
  return <ExplorationApp />;
}
function ExplorationApp() {
  const [activeMode, setActiveMode] = useState<MapMode>('2d'); const [feature, setFeature] = useState<Feature>('explore');
  const featureRef = useRef<Feature>(feature); featureRef.current = feature;
  const [collapsed, setCollapsed] = useState(false); const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([]); const [savedError, setSavedError] = useState(''); const [savedMessage, setSavedMessage] = useState('');
  const [savedLoading, setSavedLoading] = useState(true); const [saving, setSaving] = useState(false);
  const savedRevision = useRef(0); const saveLock = useRef(false); const loadRequest = useRef<AbortController | null>(null);
  const [poiPlaces, setPoiPlaces] = useState<Place[]>([]); const [routes, dispatch] = useReducer(routeReducer, initialRouteSession);
  const [mapCamera, setMapCamera] = useState<MapCamera2D>(default2dCamera); const [globeCamera, setGlobeCamera] = useState<GlobeCamera>(default3dCamera);
  const [query, setQuery] = useState(''); const [searchState, setSearchState] = useState<'idle' | 'loading' | 'success' | 'empty' | 'error'>('idle');
  const [searchError, setSearchError] = useState(''); const [results, setResults] = useState<Place[]>([]);
  const [mapStatus, setMapStatus] = useState<'loading' | 'ready' | 'error'>('loading'); const [mapError, setMapError] = useState('');
  const [globeStatus, setGlobeStatus] = useState<GlobeStatus>('initializing'); const [globeError, setGlobeError] = useState<{ code: string; message: string } | null>(null);
  const [showLabels, setShowLabels] = useState(true); const [labelsStatus, setLabelsStatus] = useState<GlobeLabelsStatus>('loading');
  const [fitRequest, setFitRequest] = useState(0); const [restoredTrip, setRestoredTrip] = useState<Trip | null>(null);
  const controllerRef = useRef<AbortController | null>(null); const searchRef = useRef<HTMLInputElement>(null);
  const routeGeoJSON = routes.active ? routes.routes[routes.active] ?? null : null;
  const routeCallback = useCallback((geometry: RouteGeoJSON | null) => dispatch({ type: 'set', owner: 'route', geometry, activate: !['journey', 'itinerary'].includes(featureRef.current) }), []);
  const itineraryCallback = useCallback((geometry: RouteGeoJSON | null) => dispatch({ type: 'set', owner: 'itinerary', geometry, activate: !['route', 'journey'].includes(featureRef.current) }), []);
  const journeyCallback = useCallback((geometry: RouteGeoJSON | null) => {
    dispatch({ type: 'set', owner: 'journey', geometry, activate: !['route', 'itinerary'].includes(featureRef.current) });
    if (!geometry) { setPoiPlaces(current => current.filter(p => !p.id.startsWith('checkpoint-'))); setSelectedPlace(current => current?.id.startsWith('checkpoint-') ? null : current); }
  }, []);
  useEffect(() => () => { controllerRef.current?.abort(); loadRequest.current?.abort(); }, []);
  async function loadSaved() {
    loadRequest.current?.abort(); const controller = new AbortController(); loadRequest.current = controller;
    const revision = savedRevision.current; setSavedLoading(true); setSavedError('');
    try { const body = await apiRequest<{ results: Place[] }>('/api/v1/places/saved', { signal: controller.signal }); if (!Array.isArray(body.results)) throw new Error('Saved places returned invalid data.'); if (revision === savedRevision.current) setSavedPlaces(body.results); }
    catch (e) { if (!controller.signal.aborted) setSavedError('Saved places could not be loaded. ' + messageOf(e)); }
    finally { if (!controller.signal.aborted) setSavedLoading(false); }
  }
  useEffect(() => { void loadSaved(); }, []);
  function openFeature(next: Feature) { setFeature(next); setCollapsed(false); if (['route', 'journey', 'itinerary'].includes(next)) dispatch({ type: 'activate', owner: next as RouteOwner }); }
  function selectPlace(place: Place) {
    const normalized = place.id === 'picked' ? { ...place, id: 'point-' + place.coordinates.latitude.toFixed(6) + '-' + place.coordinates.longitude.toFixed(6) } : place;
    setSelectedPlace(normalized); setSavedMessage('');
    setMapCamera(camera => ({ ...camera, center: place.coordinates, zoom: Math.max(camera.zoom, 11) }));
    setGlobeCamera(camera => ({ ...camera, center: place.coordinates, rangeMeters: 100_000 }));
  }
  async function addSavedPlace() {
    if (!selectedPlace || saveLock.current) return; const place = selectedPlace; saveLock.current = true; setSaving(true);
    savedRevision.current++; setSavedError(''); setSavedMessage('Saving place…');
    setSavedPlaces(current => current.some(p => p.id === place.id) ? current : [...current, place]);
    try { await apiRequest('/api/v1/places/saved', jsonRequest(place)); setSavedMessage(place.name + ' saved for this browser.'); }
    catch (e) { setSavedMessage(''); setSavedError('Place could not be saved. Its marker is only stored in this session. Use Save place to retry. ' + messageOf(e)); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function removeSavedPlace(id: string) {
    savedRevision.current++; setSavedError(''); setSavedMessage(''); setSavedPlaces(current => current.filter(p => p.id !== id));
    try { await apiRequest('/api/v1/places/saved/' + encodeURIComponent(id), { method: 'DELETE' }); setSavedMessage('Saved place removed.'); }
    catch (e) { setSavedError('Place could not be deleted from storage. Refresh saved places to restore it and retry. ' + messageOf(e)); }
  }
  function switchMode(mode: MapMode) { if (mode !== activeMode) { setActiveMode(mode); setMapError(''); setGlobeError(null); } }
  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); openFeature('explore'); const term = query.trim(); controllerRef.current?.abort();
    if (!term) { setResults([]); setSearchError('Enter a place, street or destination to search.'); setSearchState('error'); return; }
    const controller = new AbortController(); controllerRef.current = controller; setSearchState('loading'); setSearchError(''); setResults([]);
    try { const locations = await searchLocations(term, controller.signal); if (controller.signal.aborted) return; setResults(locations); setSearchState(locations.length ? 'success' : 'empty'); }
    catch (e) { if (!controller.signal.aborted) { setSearchError(messageOf(e)); setSearchState('error'); } }
  }
  const visiblePlaces = useMemo(() => [...new Map([...savedPlaces, ...poiPlaces].map(p => [p.id, p])).values()], [savedPlaces, poiPlaces]);
  const markerPlaces: GlobeMarker[] = useMemo(() => visiblePlaces.map(place => ({ id: place.id, label: place.name, coordinates: place.coordinates })), [visiblePlaces]);
  const currentStatus = activeMode === '2d' ? mapStatus : globeStatus;
  return <main className="app-shell"><a className="skip-link" href="#workspace-controls">Skip to tools</a><AppHeader mode={activeMode} onMode={switchMode} status={statusLabel[currentStatus]} query={query} onQuery={value => { controllerRef.current?.abort(); setQuery(value); if (searchState === 'loading') setSearchState('idle'); }} onSearch={submitSearch} busy={searchState === 'loading'} searchRef={searchRef} collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} />
    <section className={'workspace' + (collapsed ? ' tools-collapsed' : '')} aria-label="Terrene mapping workspace"><Sidebar feature={feature} collapsed={collapsed} onFeature={openFeature} onToggle={() => setCollapsed(true)}><div id="workspace-controls" tabIndex={-1}>
      {selectedPlace && feature !== 'explore' && <div className="shared-selection"><Icon name="pin" size={17} /><div><span className="field-caption">Selected on map</span><strong>{selectedPlace.name}</strong><span className="coordinates">{coordinatesText(selectedPlace.coordinates)}</span></div></div>}
      <div hidden={feature !== 'explore'}><aside className="panel" aria-label="Location search"><p className="eyebrow">Your map, in context</p><h1>Explore the map</h1><p className="hint">Find a place. Plan a route. See what’s along the way.</p>{searchState === 'loading' && <Feedback message="Looking for places…" busy />}{searchState === 'empty' && <p className="empty-state">No places matched that search. Try a nearby city or a more specific name.</p>}{searchState === 'error' && <Feedback message={searchError} error />}{searchState === 'success' && <><div className="section-heading"><h3>Search results</h3><span className="hint">{results.length} found</span></div><ul className="results" aria-label="Search results">{results.map(place => <li key={place.id}><button aria-pressed={selectedPlace?.id === place.id} onClick={() => selectPlace(place)}><strong>{place.name}</strong><span>{place.displayName ?? coordinatesText(place.coordinates)}</span></button></li>)}</ul><p className="source">Search: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> / Nominatim</p></>}</aside>
      <aside className="panel selected-place" aria-label="Selected place"><div className="section-heading"><p className="eyebrow">Selected place</p><Icon name="pin" size={18} /></div>{selectedPlace ? <><h2>{selectedPlace.name}</h2>{selectedPlace.displayName && <p className="place-name">{selectedPlace.displayName}</p>}<dl><div><dt>Latitude</dt><dd>{selectedPlace.coordinates.latitude.toFixed(4)}°</dd></div><div><dt>Longitude</dt><dd>{selectedPlace.coordinates.longitude.toFixed(4)}°</dd></div></dl><div className="button-row"><button disabled={saving} onClick={addSavedPlace}>{saving ? 'Saving…' : 'Save place'}</button><button className="quiet" onClick={() => setSelectedPlace(null)}>Clear</button></div><div className="context-actions"><button className="text-button" onClick={() => openFeature('route')}>Plan a route here</button><button className="text-button" onClick={() => openFeature('discover')}>Find nearby places</button></div></> : <div className="empty-selection"><Icon name="pin" size={28} /><p>Choose a search result or a point on the map.</p><span className="hint">Your selection connects every tool.</span></div>}</aside><aside className="panel shortcuts"><h3>Map shortcuts</h3><p className="hint">Jump to a known location to begin exploring.</p><ul className="shortcut-list">{shortcuts.map(place => <li key={place.id}><button className="quiet" onClick={() => selectPlace(place)}><span>{place.name}</span><Icon name="chevron" size={14} style={{ transform: 'rotate(180deg)' }} /></button></li>)}</ul></aside></div>
      <div hidden={feature !== 'route' && feature !== 'trips'}><RoutePlanner selected={selectedPlace} onRoute={routeCallback} view={feature === 'trips' ? 'trips' : 'route'} onRestore={trip => { if (trip.plan.itinerary) { setRestoredTrip(trip); openFeature('itinerary'); } else openFeature('route'); }} /></div>
      <div hidden={feature !== 'journey'}><JourneyExplorer selected={selectedPlace} onSelect={place => { setPoiPlaces(current => [...current.filter(p => !p.id.startsWith('checkpoint-')), place]); selectPlace(place); }} onRoute={journeyCallback} /></div>
      <div hidden={feature !== 'itinerary'}><ItineraryPlanner selected={selectedPlace} poiPlaces={poiPlaces} onRoute={itineraryCallback} restoredTrip={restoredTrip} /></div>
      <div hidden={feature !== 'discover'}><Discovery selected={selectedPlace} route={routeGeoJSON} onPlaces={setPoiPlaces} onSelect={selectPlace} /></div>
      <div hidden={feature !== 'saved'}><aside className="panel" aria-label="Saved places"><p className="eyebrow">Your collection</p><h2>Saved places</h2><p className="hint">Select a place to return to it in either map mode.</p><button className="quiet" disabled={savedLoading} onClick={loadSaved}>Refresh saved places</button>{savedLoading && <Feedback message="Loading saved places…" busy />}{savedPlaces.length ? <ul className="markers">{savedPlaces.map(place => <li key={place.id} className={selectedPlace?.id === place.id ? 'selected' : ''}><button onClick={() => selectPlace(place)} aria-pressed={selectedPlace?.id === place.id}>{place.name}<span>{coordinatesText(place.coordinates)}</span></button><button className="icon-button" aria-label={'Remove ' + place.name + ' saved place'} onClick={() => removeSavedPlace(place.id)}><Icon name="close" size={16} /></button></li>)}</ul> : <p className="empty-state">Saved destinations will appear in both map modes.</p>}<p className="footnote">Guest cookie lasts 30 days. Clearing cookies loses access. Saved places retain names and coordinates; full POI metadata is not preserved.</p></aside></div>
      <div hidden={feature !== 'sun'}><SolarPanel place={selectedPlace} /></div><div hidden={feature !== 'clock'}><PlaceHours place={selectedPlace} /></div>
      <div hidden={feature !== 'settings'}><aside className="panel" aria-label="Map settings"><p className="eyebrow">Map and data</p><h2>Map settings</h2><h3>Current view</h3><p>{activeMode === '2d' ? '2D vector map' : '3D globe'} · {statusLabel[currentStatus]}</p><p className="hint">2D uses the configured vector style, OpenFreeMap by default. The 3D globe loads only when selected.</p><h3>Globe labels</h3><label className="checkbox-label"><input type="checkbox" checked={showLabels} disabled={activeMode !== '3d' || !['enabled', 'hidden'].includes(labelsStatus)} onChange={e => setShowLabels(e.target.checked)} /> Show map labels</label><p className="hint">{activeMode === '3d' ? labelText[labelsStatus] : 'Open 3D to check label availability.'}</p><p className="hint">Without configured imagery and terrain, the globe uses bundled Natural Earth II imagery and ellipsoid terrain.</p><h3>Data sources</h3><p className="source"><a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://cesium.com/">Cesium</a> · <a href="https://openrouteservice.org/">openrouteservice</a> · <a href="https://open-meteo.com/">Open-Meteo</a></p><h3>Before launch</h3><p className="hint">A custom domain, HTTPS, provider configuration, reviewed privacy policy and terms, and verified primary workflows are still required.</p><a href="/privacy">Review privacy draft</a><br /><a href="/terms">Review terms draft</a></aside></div>
      {(savedError || savedMessage) && <div className="persistence-feedback"><Feedback message={savedError || savedMessage} error={!!savedError} busy={saving} /></div>}
    </div></Sidebar>
    <section className="map-workspace" aria-label="Interactive map"><div className="map-stage">{activeMode === '2d' ? <MapView camera={mapCamera} selectedPlace={selectedPlace} savedPlaces={visiblePlaces} routeGeoJSON={routeGeoJSON} fitRouteRequest={fitRequest} onCameraChange={setMapCamera} onPlaceSelected={selectPlace} onStatusChange={setMapStatus} onError={setMapError} /> : <Suspense fallback={<div className="map-loading" role="status">Loading the 3D globe…</div>}><EarthGlobe initialCamera={globeCamera} selectedLocation={selectedPlace} markers={markerPlaces} routeGeoJSON={routeGeoJSON} showLabels={showLabels} onCameraChange={setGlobeCamera} onCoordinatesSelected={coordinates => selectPlace({ id: 'picked', name: 'Selected point', coordinates })} onMarkerSelected={id => { const place = visiblePlaces.find(p => p.id === id); if (place) selectPlace(place); }} onStatusChange={setGlobeStatus} onError={setGlobeError} onLabelsStatusChange={setLabelsStatus} /></Suspense>}</div>
      <div className="map-context"><Icon name="layers" size={16} /><span>{activeMode === '2d' ? 'Liberty / 2D' : 'Earth / 3D'}</span>{routeGeoJSON && <span className="route-context">{routes.active === 'route' ? 'Route planning' : routes.active === 'journey' ? 'Journey' : 'Itinerary'} route</span>}</div>
      {activeMode === '2d' && <div className="map-toolbar" role="group" aria-label="Map controls"><button className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => setMapCamera(c => ({ ...c, zoom: Math.min(20, c.zoom + 1) }))}><Icon name="plus" /></button><button className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => setMapCamera(c => ({ ...c, zoom: Math.max(0, c.zoom - 1) }))}><Icon name="minus" /></button><button className="icon-button" aria-label="Fit route to map" title="Fit route to map" disabled={!routeGeoJSON} onClick={() => setFitRequest(n => n + 1)}><Icon name="fit" /></button><button className="icon-button north-button" aria-label="Reset map to world view" title="Reset map to world view" onClick={() => setMapCamera(default2dCamera)}>N<span aria-hidden="true">↑</span></button></div>}
      {(activeMode === '2d' ? mapError : globeError?.message) && <div className="map-error" role="status">{activeMode === '2d' ? 'Map resources could not load. Check your connection or configured style provider.' : globeError?.message}</div>}
      <div className="map-coordinate-readout" aria-label="Map centre">{activeMode === '2d' ? coordinatesText(mapCamera.center) : coordinatesText(globeCamera.center)}<span>WGS84</span></div>
    </section></section></main>;
}
