import { useEffect, useRef, useState } from 'react';
import type { Place, RouteGeoJSON } from './domain/geo';
import { apiRequest, jsonRequest, messageOf } from './services/apiClient';
import { travelModes, type Checkpoint, type JourneyRequest, type JourneyResult, type TravelMode } from './services/apiContracts';
import { Feedback } from './ui/Feedback';
import { LocationAutocomplete } from './ui/LocationAutocomplete';

export function JourneyExplorer({ selected, onSelect, onRoute, onPlaceSelected, autoSuggest }: { selected: Place | null; onSelect: (p: Place) => void; onRoute: (r: RouteGeoJSON | null) => void; onPlaceSelected?: (p: Place) => void; autoSuggest?: boolean }) {
  const [origin, setOrigin] = useState<Place | null>(null); const [destination, setDestination] = useState<Place | null>(null);
  const [departure, setDeparture] = useState(''); const [mode, setMode] = useState<TravelMode>('driving');
  const [points, setPoints] = useState<Checkpoint[]>([]); const [activePoint, setActivePoint] = useState<number | null>(null);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState(false);
  const [count, setCount] = useState(5); const requestRef = useRef<AbortController | null>(null);
  const [checkpointOption, setCheckpointOption] = useState('count'); const [spacing, setSpacing] = useState(30000);
  useEffect(() => () => requestRef.current?.abort(), []);
  function invalidate() { requestRef.current?.abort(); requestRef.current = null; setBusy(false); setPoints([]); setActivePoint(null); setMessage(''); onRoute(null); }
  async function run() {
    if (!origin || !destination || !departure) return; invalidate(); const controller = new AbortController(); requestRef.current = controller; setBusy(true); setError(false); setMessage('Calculating journey…');
    try {
      const data = await apiRequest<JourneyResult>('/api/v1/journeys/simulate', jsonRequest({ origin: origin.coordinates, destination: destination.coordinates, mode, departure: new Date(departure).toISOString(), ...(checkpointOption === 'count' ? { checkpoint_count: count } : { checkpoint_spacing_m: spacing }) } satisfies JourneyRequest, controller.signal));
      if (!Array.isArray(data.checkpoints) || data.route?.geometry?.type !== 'LineString') throw new Error('The journey service returned invalid data.');
      if (controller.signal.aborted) return; setPoints(data.checkpoints); onRoute(data.route.geometry); setMessage(data.limitations);
    } catch (e) { if (!controller.signal.aborted) { setError(true); setMessage(messageOf(e)); } }
    finally { if (requestRef.current === controller) setBusy(false); }
  }
  return <aside className="panel" aria-label="Journey simulation"><p className="eyebrow">Weather along the way</p><h2>Journey simulation</h2><p className="hint">Estimate arrivals and see the forecast at checkpoints along a real route.</p>
    <div className="planner-endpoint"><LocationAutocomplete label="Journey origin" value={origin} onChange={place => { invalidate(); setOrigin(place); }} onSelect={onPlaceSelected} autoSuggest={autoSuggest} /><button className="text-button" disabled={!selected} onClick={() => { setOrigin(selected); invalidate(); }}>Use selected place as journey origin</button></div>
    <div className="planner-endpoint"><LocationAutocomplete label="Journey destination" value={destination} onChange={place => { invalidate(); setDestination(place); }} onSelect={onPlaceSelected} autoSuggest={autoSuggest} /><button className="text-button" disabled={!selected} onClick={() => { setDestination(selected); invalidate(); }}>Use selected place as journey destination</button></div>
    <label>Journey mode<select value={mode} onChange={e => { setMode(e.target.value as TravelMode); invalidate(); }}>{travelModes.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}</select></label>
    <label>Departure in your browser timezone<input type="datetime-local" value={departure} onInput={e => { setDeparture(e.currentTarget.value); invalidate(); }} onChange={e => { setDeparture(e.target.value); invalidate(); }} /></label>
    <details className="advanced"><summary>Checkpoint settings</summary><label>Checkpoint placement<select value={checkpointOption} onChange={e => { invalidate(); setCheckpointOption(e.target.value); }}><option value="count">By count</option><option value="spacing">By distance</option></select></label>{checkpointOption === 'count' ? <label>Number of checkpoints<input type="number" min="2" max="25" value={count} onChange={e => { setCount(Number(e.target.value)); invalidate(); }} /></label> : <label>Checkpoint spacing in metres<input type="number" min="100" max="1000000" value={spacing} onChange={e => { invalidate(); setSpacing(Number(e.target.value)); }} /></label>}<p className="hint">Five checkpoints by default, up to 25. Distance spacing must also fit within that limit.</p></details>
    <button className="full-width" disabled={busy || !origin || !destination || !departure || (checkpointOption === 'count' ? !Number.isInteger(count) || count < 2 || count > 25 : !Number.isFinite(spacing) || spacing < 100 || spacing > 1000000)} onClick={run}>Generate journey timeline</button><Feedback message={message} error={error} busy={busy} />
    <ol className="timeline">{points.map((p, i) => <li key={p.index ?? i} className={activePoint === i ? 'selected' : ''}><button className="timeline-select" aria-pressed={activePoint === i} onClick={() => { setActivePoint(i); onSelect({ id: 'checkpoint-' + (p.index ?? i), name: 'Checkpoint ' + (i + 1), coordinates: p.coordinates }); }}><span className="field-caption">Checkpoint {i + 1} · {Math.round(p.progress * 100)}%</span><strong>{(p.distance_m / 1000).toFixed(1)} km from origin</strong><span>{new Date(p.arrival).toLocaleString()} (browser time)</span></button><p className="weather-status">Weather: {p.weather.status.replaceAll('_', ' ')}</p>{p.weather.reason && <p className="hint">{p.weather.reason}</p>}{p.weather.values && <p>{p.weather.values.temperature_2m ?? 'Unknown'} °C · {p.weather.values.precipitation ?? 'Unknown'} mm precipitation · <a href="https://open-meteo.com/">Open-Meteo forecast</a></p>}</li>)}</ol>
    <p className="footnote">Travel estimates exclude live traffic and closures. Weather is limited to the available forecast horizon.</p>
  </aside>;
}
