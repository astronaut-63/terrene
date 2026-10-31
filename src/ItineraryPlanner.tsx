import { useEffect, useState } from 'react';
import type { Place, RouteGeoJSON } from './domain/geo';

type Stop = Place & { metadata?: Record<string, string> };
type ItineraryResult = { status: string; stops: Array<any>; warnings: string[]; total_duration_minutes: number; limitations: string; origin: Place['coordinates']; destination: Place['coordinates'] | null; departure: string };

export function ItineraryPlanner({ selected, poiPlaces, onRoute }: { selected: Place | null; poiPlaces: Place[]; onRoute: (route: RouteGeoJSON) => void }) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [departure, setDeparture] = useState('');
  const [availableMinutes, setAvailableMinutes] = useState(480);
  const [breakMinutes, setBreakMinutes] = useState(0);
  const [result, setResult] = useState<ItineraryResult | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    void window.fetch('/api/v1/trips').then(response => response.ok ? response.json() : null).then(body => {
      const saved = body?.trips?.find((trip: any) => trip.plan?.itinerary);
      if (saved) setResult(saved.plan.itinerary);
    }).catch(() => undefined);
  }, []);

  function addSelectedAsOrigin() { if (selected) setOrigin(selected); }
  function addSelectedAsDestination() { if (selected) setDestination(selected); }
  function addPoi(place: Place) { setStops(current => current.some(item => item.id === place.id) ? current : [...current, place]); }
  function removeStop(id: string) { setStops(current => current.filter(stop => stop.id !== id)); }
  function moveStop(index: number, direction: -1 | 1) {
    setStops(current => { const next = index + direction; if (next < 0 || next >= current.length) return current; const copy = [...current]; [copy[index], copy[next]] = [copy[next], copy[index]]; return copy; });
  }
  async function generate() {
    if (!origin || !departure || !stops.length) return;
    setBusy(true); setMessage('Building itinerary…');
    try {
      const response = await fetch('/api/v1/itineraries/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: origin.coordinates, destination: destination?.coordinates ?? null, stops: stops.map(stop => ({ id: stop.id, name: stop.name, coordinates: stop.coordinates, opening_hours: stop.metadata?.opening_hours ?? null })), departure: new Date(departure).toISOString(), available_minutes: availableMinutes, break_minutes: breakMinutes, break_after_stop: breakMinutes ? 1 : null }) });
      const body = await response.json(); if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Itinerary unavailable.');
      setResult(body); setMessage(body.warnings?.join(' ') || body.limitations);
      const coordinates = body.legs?.flatMap((leg: any, index: number) => index ? leg.geometry.coordinates.slice(1) : leg.geometry.coordinates) ?? [];
      if (coordinates.length >= 2) onRoute({ type: 'LineString', coordinates });
      if (destination) {
        void fetch('/api/v1/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Itinerary ' + new Date(departure).toLocaleDateString(), plan: { origin: body.origin, destination: body.destination, mode: 'driving', itinerary: body } }) });
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Itinerary unavailable.'); }
    finally { setBusy(false); }
  }

  return <aside className="panel" aria-label="Itinerary planner"><h2>Itinerary planner</h2><button disabled={!selected} onClick={addSelectedAsOrigin}>Use selected place as start</button><p>{origin?.name ?? 'Select a start'}</p><button disabled={!selected} onClick={addSelectedAsDestination}>Use selected place as destination</button><p>{destination?.name ?? 'Optional final destination'}</p><label>Departure date and time<input type="datetime-local" value={departure} onChange={event => setDeparture(event.target.value)} /></label><label>Available minutes<input type="number" min="1" max="1440" value={availableMinutes} onChange={event => setAvailableMinutes(Number(event.target.value))} /></label><label>Break minutes<input type="number" min="0" max="240" value={breakMinutes} onChange={event => setBreakMinutes(Number(event.target.value))} /></label><p>Discovered stops</p><ul>{poiPlaces.map(place => <li key={place.id}><button onClick={() => addPoi(place)}>{place.name}</button></li>)}</ul><p>Stops in order</p><ol>{stops.map((stop, index) => <li key={stop.id}>{stop.name} <button onClick={() => moveStop(index, -1)} aria-label={'Move ' + stop.name + ' up'}>↑</button><button onClick={() => moveStop(index, 1)} aria-label={'Move ' + stop.name + ' down'}>↓</button><button onClick={() => removeStop(stop.id)} aria-label={'Remove ' + stop.name}>×</button></li>)}</ol><button disabled={busy || !origin || !departure || !stops.length} onClick={generate}>Generate itinerary</button>{result && <><p role="status">{result.total_duration_minutes.toFixed(0)} minutes estimated. {message}</p><ol>{result.stops.filter(stop => stop.type !== 'break').map(stop => <li key={stop.id}>{stop.name} · arrival {new Date(stop.arrival).toLocaleString()} · hours {stop.opening_hours?.status ?? 'unknown'}</li>)}</ol></>}</aside>;
}
