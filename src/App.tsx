import { type FormEvent, useEffect, useRef, useState } from 'react';
import { EarthGlobe, searchLocations, type GeoCoordinates, type GeographicLocation, type GlobeLabelsStatus, type GlobeMarker, type GlobeStatus, type GlobeError } from './globe';

const examples: GeographicLocation[] = [
  { id: 'example-everest', name: 'Everest', displayName: 'Himalayas · example destination', coordinates: { latitude: 27.9881, longitude: 86.925 } },
  { id: 'example-grand-canyon', name: 'Grand Canyon', displayName: 'Arizona · example destination', coordinates: { latitude: 36.1069, longitude: -112.1129 } },
  { id: 'example-cape-town', name: 'Cape Town', displayName: 'South Africa · example destination', coordinates: { latitude: -33.9249, longitude: 18.4241 } },
];
type SearchState = 'idle' | 'loading' | 'success' | 'empty' | 'error';
type SolarResult = { sunrise_utc: string | null; sunset_utc: string | null; solar_noon_utc: string; day_length_seconds: number | null; condition?: string; solar_elevation_degrees: number | null; solar_azimuth_degrees: number | null };
const coordinatesText = (c: GeoCoordinates) => `${c.latitude.toFixed(4)}° latitude, ${c.longitude.toFixed(4)}° longitude`;
const statusLabel: Record<GlobeStatus, string> = { initializing: 'Initialising globe', ready: 'Globe ready', degraded: 'Globe running with limited resources', error: 'Globe unavailable' };
const labelsStatusText: Record<GlobeLabelsStatus, string> = { loading: 'Loading labels…', enabled: 'Labels on', hidden: 'Labels off', unavailable: 'Configure a labels-only ion asset', failed: 'Labels unavailable' };

export function App() {
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<GeographicLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GeographicLocation | null>(null);
  // Picking updates information without forcing a camera flight.
  const [flightLocation, setFlightLocation] = useState<GeographicLocation | null>(null);
  const [markers, setMarkers] = useState<GlobeMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [globeStatus, setGlobeStatus] = useState<GlobeStatus>('initializing');
  const [globeError, setGlobeError] = useState<GlobeError | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [labelsStatus, setLabelsStatus] = useState<GlobeLabelsStatus>('loading');
  const [solarDate, setSolarDate] = useState('2026-11-01');
  const [solarResult, setSolarResult] = useState<SolarResult | null>(null);
  const [solarState, setSolarState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [solarError, setSolarError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    controllerRef.current?.abort();
    if (!term) { setResults([]); setSearchError('Enter a place or city to search.'); setSearchState('error'); return; }
    const controller = new AbortController(); controllerRef.current = controller;
    setSearchState('loading'); setSearchError(null); setResults([]);
    try {
      const locations = await searchLocations(term, controller.signal);
      if (controller.signal.aborted) return;
      setResults(locations); setSearchState(locations.length ? 'success' : 'empty');
    } catch (error) {
      if (controller.signal.aborted) return;
      setSearchError(error instanceof Error ? error.message : 'Location search is unavailable.'); setSearchState('error');
    }
  }
  function selectLocation(location: GeographicLocation) {
    setSelectedLocation(location); setFlightLocation({ ...location }); setSelectedMarkerId(null);
  }
  function selectCoordinates(coordinates: GeoCoordinates) {
    setSelectedLocation({ id: 'picked', name: 'Selected point', coordinates }); setFlightLocation(null); setSelectedMarkerId(null);
  }
  function selectMarker(id: string) {
    const marker = markers.find(item => item.id === id);
    if (!marker) return;
    selectLocation({ id: marker.id, name: marker.label, coordinates: marker.coordinates }); setSelectedMarkerId(id);
  }
  function addMarker() {
    if (!selectedLocation) return;
    const marker = { id: crypto.randomUUID(), label: selectedLocation.name, coordinates: selectedLocation.coordinates };
    setMarkers(current => [...current, marker]); setSelectedMarkerId(marker.id);
  }
  function removeMarker(id: string) { setMarkers(current => current.filter(marker => marker.id !== id)); if (selectedMarkerId === id) setSelectedMarkerId(null); }
  async function calculateDaylight() {
    if (!selectedLocation) return;
    setSolarState('loading'); setSolarError(null); setSolarResult(null);
    try {
      const { latitude, longitude } = selectedLocation.coordinates;
      const response = await fetch(`/api/solar?lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&date=${encodeURIComponent(solarDate)}`, { headers: { Accept: 'application/json' } });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? body.error ?? 'Solar calculation failed.');
      setSolarResult(body); setSolarState('idle');
    } catch (error) { setSolarState('error'); setSolarError(error instanceof Error ? error.message : 'Solar backend is unavailable.'); }
  }
  const formatUtc = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Undefined';
  const formatDuration = (seconds: number | null) => seconds === null ? 'Undefined' : `${Math.floor(seconds / 3600)}h ${Math.round((seconds % 3600) / 60)}m`;

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#explore" aria-label="Terrene exploration home"><span className="brand-mark" aria-hidden="true">◉</span> Terrene</a><nav aria-label="Primary navigation"><a href="#explore">Explore</a></nav><span className="status-pill" data-status={globeStatus} role="status"><span aria-hidden="true" />{statusLabel[globeStatus]}</span></header>
    <section className="exploration" id="explore" aria-label="Globe exploration">
      <div className="globe-stage" aria-label="Interactive Earth">
        <EarthGlobe selectedLocation={flightLocation} markers={markers} showLabels={showLabels} onCoordinatesSelected={selectCoordinates}
          onMarkerSelected={selectMarker} onStatusChange={setGlobeStatus} onError={setGlobeError} onLabelsStatusChange={setLabelsStatus} />
      </div>
      <aside className="search-panel panel" aria-label="Location search">
        <p className="eyebrow">Find a place</p>
        <form onSubmit={submitSearch} noValidate><label htmlFor="location-search">Search the Earth</label><div className="search-row"><input id="location-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="City or place" autoComplete="off" maxLength={256} /><button type="submit" disabled={searchState === 'loading'}>{searchState === 'loading' ? 'Searching' : 'Search'}</button></div></form>
        {searchState === 'loading' && <p className="hint" role="status">Looking for locations…</p>}
        {searchState === 'empty' && <p className="hint">No locations matched that search.</p>}
        {searchState === 'error' && <p className="message error" role="alert">{searchError}</p>}
        {searchState === 'success' && <ul className="results" aria-label="Search results">{results.map(location => <li key={location.id}><button onClick={() => selectLocation(location)}><strong>{location.name}</strong><span>{location.displayName ?? coordinatesText(location.coordinates)}</span></button></li>)}</ul>}
        <p className="eyebrow example-title">Explore example destinations</p>
        <div className="example-buttons">{examples.map(location => <button className="quiet" key={location.id} onClick={() => selectLocation(location)}>{location.name}</button>)}</div>
        <p className="hint">Examples work without search credentials. Drag to rotate, scroll to zoom, middle-drag to tilt. Click the Earth to inspect a point.</p>
        <div className="map-labels-control">
          <label><input type="checkbox" checked={showLabels} disabled={labelsStatus !== 'enabled' && labelsStatus !== 'hidden'} onChange={event => setShowLabels(event.target.checked)} /> Map labels</label>
          <span className="hint">{labelsStatusText[labelsStatus]}</span>
        </div>
        {globeError && <p className="message engine-message" role="status">{globeError.message}</p>}
      </aside>
      <aside className="location-panel panel" aria-label="Selected location"><p className="eyebrow">Selected location</p>
        {selectedLocation ? <><h2>{selectedLocation.name}</h2>{selectedLocation.displayName && <p className="place-name">{selectedLocation.displayName}</p>}<dl><div><dt>Latitude</dt><dd>{selectedLocation.coordinates.latitude.toFixed(4)}°</dd></div><div><dt>Longitude</dt><dd>{selectedLocation.coordinates.longitude.toFixed(4)}°</dd></div>{selectedLocation.coordinates.heightMeters !== undefined && <div><dt>Ellipsoid height</dt><dd>{selectedLocation.coordinates.heightMeters.toFixed(0)} m</dd></div>}</dl><div className="button-row"><button onClick={addMarker}>Add marker</button><button className="quiet" onClick={() => {setSelectedLocation(null); setFlightLocation(null); setSelectedMarkerId(null);}}>Clear</button></div></> : <p className="hint">Choose an example, a search result, or a point on the globe.</p>}
      </aside>
      <aside className="marker-panel panel" aria-label="Map markers"><p className="eyebrow">Markers</p>{markers.length ? <ul className="markers">{markers.map(marker => <li key={marker.id} className={selectedMarkerId === marker.id ? 'selected' : ''}><button onClick={() => selectMarker(marker.id)} aria-pressed={selectedMarkerId === marker.id}>{marker.label}<span>{coordinatesText(marker.coordinates)}</span></button><button className="icon-button" aria-label={`Remove ${marker.label} marker`} onClick={() => removeMarker(marker.id)}>×</button></li>)}</ul> : <p className="hint">Saved points will appear here.</p>}</aside>
      <aside className="solar-panel panel" aria-label="Solar explorer"><p className="eyebrow">Solar explorer</p><p className="hint">Calculate daylight in UTC for the selected coordinates.</p><label htmlFor="solar-date">Date</label><div className="search-row"><input id="solar-date" type="date" value={solarDate} onChange={event => setSolarDate(event.target.value)} /><button onClick={calculateDaylight} disabled={!selectedLocation || solarState === 'loading'}>{solarState === 'loading' ? 'Calculating…' : 'Calculate daylight'}</button></div>{solarError && <p className="message error" role="alert">{solarError}</p>}{solarResult && <dl className="solar-results"><div><dt>Sunrise</dt><dd>{formatUtc(solarResult.sunrise_utc)}</dd></div><div><dt>Sunset</dt><dd>{formatUtc(solarResult.sunset_utc)}</dd></div><div><dt>Solar noon</dt><dd>{formatUtc(solarResult.solar_noon_utc)}</dd></div><div><dt>Day length</dt><dd>{formatDuration(solarResult.day_length_seconds)}</dd></div></dl>}{solarResult?.condition && <p className="hint">{solarResult.condition === 'polar-day' ? 'Polar day: sunrise and sunset are undefined.' : 'Polar night: sunrise and sunset are undefined.'}</p>}</aside>
    </section>
  </main>;
}
