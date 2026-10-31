import { useEffect, useRef, useState } from 'react';
import type { Place } from './domain/geo';
import { apiRequest, messageOf } from './services/apiClient';
import type { SolarResult } from './services/apiContracts';
import { Feedback } from './ui/Feedback';
export function localDate() { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
const utc = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Not defined';
export function SolarPanel({ place }: { place: Place | null }) {
  const [date, setDate] = useState(localDate); const [result, setResult] = useState<SolarResult | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const request = useRef<AbortController | null>(null);
  const context = place ? place.coordinates.latitude + ',' + place.coordinates.longitude + ',' + date : '';
  useEffect(() => { request.current?.abort(); setResult(null); setError(''); setBusy(false); return () => request.current?.abort(); }, [context]);
  function changeDate(value: string) { request.current?.abort(); setDate(value); setResult(null); setBusy(false); setError(''); }
  async function calculate() {
    if (!place || !date) return; request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setResult(null);
    try { const body = await apiRequest<SolarResult>('/api/solar?lat=' + place.coordinates.latitude + '&lon=' + place.coordinates.longitude + '&date=' + date, { signal: controller.signal }); if (!controller.signal.aborted) setResult(body); }
    catch (e) { if (!controller.signal.aborted) setError(messageOf(e)); }
    finally { if (request.current === controller && !controller.signal.aborted) setBusy(false); }
  }
  return <aside className="panel" aria-label="Solar explorer"><p className="eyebrow">Light and time</p><h2>Solar and daylight</h2><p className="hint">{place ? 'Daylight for ' + place.name : 'Select a place on the map to calculate daylight.'}</p><label htmlFor="solar-date">Date</label><input id="solar-date" type="date" value={date} onInput={e => changeDate(e.currentTarget.value)} onChange={e => changeDate(e.target.value)} /><button className="full-width" disabled={!place || !date || busy} onClick={calculate}>{busy ? 'Calculating…' : 'Calculate daylight'}</button><Feedback message={error || (busy ? 'Calculating daylight…' : '')} error={!!error} busy={busy} />{result && <section className="result-block"><dl><div><dt>Sunrise</dt><dd>{utc(result.sunrise_utc)}</dd></div><div><dt>Sunset</dt><dd>{utc(result.sunset_utc)}</dd></div><div><dt>Solar noon</dt><dd>{utc(result.solar_noon_utc)}</dd></div><div><dt>Day length</dt><dd>{result.day_length_seconds === null ? 'Not defined' : Math.floor(result.day_length_seconds / 3600) + ' h ' + Math.round(result.day_length_seconds % 3600 / 60) + ' min'}</dd></div><div><dt>Solar elevation</dt><dd>{result.solar_elevation_degrees?.toFixed(1)}°</dd></div><div><dt>Azimuth</dt><dd>{result.solar_azimuth_degrees?.toFixed(1)}°</dd></div></dl>{result.condition && <p>{result.condition.replaceAll('-', ' ')}</p>}<p className="hint">Position at {utc(result.observation_utc)}. {result.accuracy}</p></section>}<p className="footnote">Times are UTC. These approximations exclude terrain, weather and local civil-time rules.</p></aside>;
}
