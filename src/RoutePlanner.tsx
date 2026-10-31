import { useEffect, useRef, useState } from 'react';
import type { Place, RouteGeoJSON } from './domain/geo';
import { apiRequest, jsonRequest, messageOf } from './services/apiClient';
import { travelModes, type RouteResult, type Trip, type TravelMode } from './services/apiContracts';
import { Feedback } from './ui/Feedback';

export function RoutePlanner({ selected, onRoute, view = 'route', onRestore }: { selected: Place | null; onRoute: (route: RouteGeoJSON | null) => void; view?: 'route' | 'trips'; onRestore?: (trip: Trip) => void }) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [mode, setMode] = useState<TravelMode>('driving');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [message, setMessage] = useState(''); const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false);
  const [tripName, setTripName] = useState('My trip'); const [tripId, setTripId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]); const [tripsState, setTripsState] = useState('idle');
  const request = useRef<AbortController | null>(null); const tripsRequest = useRef<AbortController | null>(null);
  const saveLock = useRef(false); const editorSession = useRef(0); const revision = useRef(0);
  useEffect(() => () => { request.current?.abort(); tripsRequest.current?.abort(); }, []);
  function invalidate() { revision.current++; request.current?.abort(); setBusy(false); setResult(null); setMessage(''); onRoute(null); }
  async function loadTrips() {
    tripsRequest.current?.abort(); const controller = new AbortController(); tripsRequest.current = controller; setTripsState('loading');
    try { const body = await apiRequest<{ trips: Trip[] }>('/api/v1/trips', { signal: controller.signal }); if (!Array.isArray(body.trips)) throw new Error('Saved trips returned invalid data.'); setTrips(body.trips); setTripsState('success'); }
    catch (e) { if (!controller.signal.aborted) { setTripsState('error'); setError(true); setMessage(messageOf(e)); } }
  }
  useEffect(() => { if (view === 'trips') void loadTrips(); }, [view]);
  async function saveTrip() {
    if (!origin || !destination || saveLock.current || !tripName.trim()) return;
    saveLock.current = true; setSaving(true); setError(false); const currentRevision = revision.current; const currentSession = editorSession.current;
    try {
      const saved = await apiRequest<Trip>('/api/v1/trips' + (tripId ? '/' + encodeURIComponent(tripId) : ''), jsonRequest({ name: tripName.trim(), plan: { origin: origin.coordinates, destination: destination.coordinates, mode } }, undefined, tripId ? 'PUT' : 'POST'));
      if (currentSession === editorSession.current) { setTripId(saved.id); if (currentRevision === revision.current) setMessage('Trip saved for this browser.'); }
      await loadTrips();
    } catch (e) { setError(true); setMessage(messageOf(e)); }
    finally { saveLock.current = false; setSaving(false); }
  }
  async function calculate() {
    if (!origin || !destination) return; invalidate();
    const controller = new AbortController(); request.current = controller; setBusy(true); setError(false); setMessage('Calculating route…');
    try {
      const body = await apiRequest<RouteResult>('/api/v1/routes', jsonRequest({ origin: origin.coordinates, destination: destination.coordinates, mode }, controller.signal));
      if (body.geometry?.type !== 'LineString' || body.geometry.coordinates.length < 2 || !Number.isFinite(body.duration_seconds) || !Number.isFinite(body.distance_km)) throw new Error('The routing provider returned an invalid route.');
      if (controller.signal.aborted) return; setResult(body); onRoute(body.geometry); setMessage('Route calculated.');
    } catch (e) { if (!controller.signal.aborted) { setError(true); setMessage(messageOf(e)); } }
    finally { if (request.current === controller) setBusy(false); }
  }
  function restore(trip: Trip) {
    editorSession.current++; invalidate(); setTripId(trip.id); setTripName(trip.name);
    setOrigin({ id: 'trip-origin', name: 'Saved origin', coordinates: trip.plan.origin });
    setDestination({ id: 'trip-destination', name: 'Saved destination', coordinates: trip.plan.destination });
    setMode(travelModes.includes(trip.plan.mode) ? trip.plan.mode : 'driving'); setError(false);
    setMessage('Trip loaded. Calculate route to refresh directions.'); onRestore?.(trip);
  }
  async function remove(trip: Trip) {
    setError(false);
    try { await apiRequest('/api/v1/trips/' + encodeURIComponent(trip.id), { method: 'DELETE' }); if (tripId === trip.id) setTripId(null); setMessage('Trip deleted.'); await loadTrips(); }
    catch (e) { setError(true); setMessage(messageOf(e)); }
  }
  return <aside className="panel" aria-label={view === 'trips' ? 'Saved trips' : 'Route planner'}>
    <div hidden={view !== 'route'}><p className="eyebrow">Point to point</p><h2>Route planning</h2><p className="hint">Search or select a point on the map, then assign it to your route.</p>
    <div className="endpoint"><span className="endpoint-letter">A</span><div><span className="field-caption">Origin</span><strong>{origin?.name ?? 'Choose an origin'}</strong><button className="text-button" disabled={!selected} onClick={() => { invalidate(); setOrigin(selected); }}>Set origin</button></div></div>
    <div className="endpoint"><span className="endpoint-letter">B</span><div><span className="field-caption">Destination</span><strong>{destination?.name ?? 'Choose a destination'}</strong><button className="text-button" disabled={!selected} onClick={() => { invalidate(); setDestination(selected); }}>Set destination</button></div></div>
    <label>Travel mode<select value={mode} onChange={e => { invalidate(); setMode(e.target.value as TravelMode); }}>{travelModes.map(item => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
    <p className="hint">Transit routing is unavailable.</p><button className="full-width" disabled={busy || !origin || !destination} onClick={calculate}>{busy ? 'Calculating…' : 'Calculate route'}</button>
    {result && <section className="result-block"><dl><div><dt>Distance</dt><dd>{result.distance_km.toFixed(1)} km</dd></div><div><dt>Estimated duration</dt><dd>{Math.round(result.duration_seconds / 60)} min</dd></div></dl><p className="hint">{result.limitations}</p><p className="source"><a href="https://openrouteservice.org/">openrouteservice</a> by HeiGIT · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a></p></section>}
    <section className="form-section"><h3>{tripId ? 'Update trip' : 'Save this trip'}</h3><label>Trip name<input value={tripName} onChange={e => setTripName(e.target.value)} maxLength={120} /></label><div className="button-row"><button className="quiet" disabled={saving || !origin || !destination || !tripName.trim()} onClick={saveTrip}>{saving ? 'Saving…' : tripId ? 'Update trip' : 'Save trip'}</button>{tripId && <button className="text-button" disabled={saving} onClick={() => { editorSession.current++; setTripId(null); setMessage('Ready to save as a new trip.'); }}>Save as new</button>}</div></section></div>
    <div hidden={view !== 'trips'}><p className="eyebrow">Your collection</p><h2>Saved trips</h2><p className="hint">Load a trip to restore its inputs. Recalculate for current directions.</p><button className="quiet" disabled={tripsState === 'loading'} onClick={loadTrips}>Refresh trips</button>{tripsState === 'loading' && <Feedback message="Loading saved trips…" busy />}{tripsState === 'success' && !trips.length && <p className="empty-state">No trips saved. Save a route or an itinerary to find it here.</p>}<ul className="results trip-list">{trips.map(trip => <li key={trip.id}><button onClick={() => restore(trip)}><strong>{trip.name}</strong><span>{trip.plan.itinerary ? 'Itinerary' : trip.plan.mode} · Load inputs</span></button><button className="text-button danger" onClick={() => remove(trip)} aria-label={'Delete ' + trip.name}>Delete</button></li>)}</ul></div>
    <Feedback message={message} error={error} busy={busy || saving} /><p className="footnote">Saved work belongs to this browser’s guest cookie, which lasts 30 days. Clearing cookies loses access.</p>
  </aside>;
}
