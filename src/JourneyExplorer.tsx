import { useEffect, useRef, useState } from 'react';
import type { Place, RouteGeoJSON } from './domain/geo';

export type Checkpoint = {
  index: number;
  coordinates: Place['coordinates'];
  arrival: string;
  progress: number;
  distance_m: number;
  elapsed_seconds: number;
  weather: {
    status: string;
    reason: string | null;
    forecast_timestamp: string | null;
    values: Record<string, number | null>;
    units: Record<string, string>;
  };
};

export function JourneyExplorer({ selected, onSelect, onRoute }: {
  selected: Place | null;
  onSelect: (p: Place) => void;
  onRoute: (r: RouteGeoJSON | null) => void;
}) {
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [departure, setDeparture] = useState('');
  const [mode, setMode] = useState('driving');
  const [points, setPoints] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  function invalidate() {
    setPoints([]);
    setMessage('');
    onRoute(null);
  }

  async function run() {
    if (!origin || !destination || !departure) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    invalidate();
    setMessage('Calculating journey…');
    try {
      const r = await fetch('/api/v1/journeys/simulate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body: JSON.stringify({ origin: origin.coordinates, destination: destination.coordinates, mode, departure: new Date(departure).toISOString() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Check your journey inputs and departure time.');
      if (controller.signal.aborted) return;
      setPoints(data.checkpoints);
      onRoute(data.route.geometry);
      setMessage(data.limitations);
    } catch (e) {
      if (!controller.signal.aborted) setMessage(e instanceof Error ? e.message : 'Journey unavailable.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <aside className="panel">
    <h2>Journey weather timeline</h2>
    <button disabled={busy || !selected} onClick={() => { setOrigin(selected); invalidate(); }}>Use selected place as journey origin</button>
    <p>{origin?.name ?? 'Select an origin'}</p>
    <button disabled={busy || !selected} onClick={() => { setDestination(selected); invalidate(); }}>Use selected place as journey destination</button>
    <p>{destination?.name ?? 'Select a destination'}</p>
    <label>Journey mode<select disabled={busy} value={mode} onChange={e => { setMode(e.target.value); invalidate(); }}>
      {['driving', 'walking', 'cycling', 'wheelchair'].map(m => <option key={m}>{m}</option>)}
    </select></label>
    <label>Departure in your browser timezone<input disabled={busy} type="datetime-local" value={departure} onChange={e => { setDeparture(e.target.value); invalidate(); }} /></label>
    <button disabled={busy || !origin || !destination || !departure} onClick={run}>Generate journey timeline</button>
    <p role="status">{message}</p>
    <ol>{points.map(p => <li key={p.index}>
      <button onClick={() => onSelect({ id: 'checkpoint-' + p.index, name: 'Checkpoint ' + (p.index + 1), coordinates: p.coordinates })}>
        {Math.round(p.progress * 100)}% · {(p.distance_m / 1000).toFixed(1)} km · {new Date(p.arrival).toLocaleString()}
      </button>
      <p>Weather: {p.weather.status.replaceAll('_', ' ')}</p>
      {p.weather.reason && <p>{p.weather.reason}</p>}
      {['available', 'partially_available'].includes(p.weather.status) && <p>
        {p.weather.values.temperature_2m ?? 'Unknown'} °C · {p.weather.values.precipitation ?? 'Unknown'} mm precipitation · Open-Meteo forecast
      </p>}
      {p.weather.forecast_timestamp && <small>Forecast hour: {new Date(p.weather.forecast_timestamp).toLocaleString()}</small>}
    </li>)}</ol>
  </aside>;
}
