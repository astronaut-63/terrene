import { useState } from 'react';
import type { Place, RouteGeoJSON } from './domain/geo';

export function RoutePlanner({ selected, onRoute }: { selected: Place | null; onRoute: (route: RouteGeoJSON) => void }) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [mode, setMode] = useState('driving');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [tripName, setTripName] = useState('My trip');
  const [trips, setTrips] = useState<Array<{ id: string; name: string; plan: { origin: Place['coordinates']; destination: Place['coordinates']; mode: string } }>>([]);
  async function loadTrips() {
    try { const r = await fetch('/api/v1/trips'); if (!r.ok) throw new Error('Trips unavailable. Check backend and migrations.'); setTrips((await r.json()).trips); }
    catch (e) { setMessage(String(e)); }
  }
  async function saveTrip() {
    if (!origin || !destination) return;
    try {
      const r = await fetch('/api/v1/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: tripName, plan: { origin: origin.coordinates, destination: destination.coordinates, mode } }) });
      if (!r.ok) throw new Error('Could not save trip.');
      setMessage('Trip saved for this browser.'); await loadTrips();
    } catch (e) { setMessage(String(e)); }
  }
  async function calculate() {
    if (!origin || !destination) return;
    setBusy(true); setMessage('Calculating route…');
    try {
      const response = await fetch('/api/v1/routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: origin.coordinates, destination: destination.coordinates, mode }) });
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Route calculation failed.');
      onRoute(body.geometry);
      setMessage(`${body.distance_km.toFixed(1)} km · ${Math.round(body.duration_seconds / 60)} minutes estimated. ${body.limitations} ${body.attribution}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Routing unavailable.'); }
    finally { setBusy(false); }
  }
  return <aside className="panel" aria-label="Route planner"><p className="eyebrow">Directions</p><p>Select a place on the map or through search, then assign it below.</p><button disabled={!selected} onClick={() => setOrigin(selected)}>Set origin</button><p>{origin?.name ?? 'No origin selected'}</p><button disabled={!selected} onClick={() => setDestination(selected)}>Set destination</button><p>{destination?.name ?? 'No destination selected'}</p><label>Travel mode <select value={mode} onChange={e => setMode(e.target.value)}>{['driving', 'walking', 'cycling', 'wheelchair', 'transit'].map(item => <option key={item}>{item}</option>)}</select></label><button disabled={busy || !origin || !destination} onClick={calculate}>Calculate route</button><p role="status">{message}</p><h2>Trips</h2><label>Trip name<input value={tripName} onChange={e => setTripName(e.target.value)} maxLength={120} /></label><button disabled={!origin || !destination || !tripName.trim()} onClick={saveTrip}>Save trip</button><button onClick={loadTrips}>Load trips</button><p>Guest trips are private to this browser for 30 days. Clearing cookies loses access.</p>{trips.map(trip => <div key={trip.id}><button onClick={() => { setOrigin({ id: 'origin', name: 'Saved origin', coordinates: trip.plan.origin }); setDestination({ id: 'destination', name: 'Saved destination', coordinates: trip.plan.destination }); setMode(trip.plan.mode); setTripName(trip.name); setMessage('Trip loaded. Calculate route to refresh directions.'); }}>{trip.name}</button><button onClick={async () => { try { const r = await fetch('/api/v1/trips/' + trip.id, { method: 'DELETE' }); if (!r.ok) throw new Error('Delete failed.'); await loadTrips(); } catch (e) { setMessage(String(e)); } }}>Delete trip</button></div>)}</aside>;
}
