import { useEffect, useRef, useState } from 'react';
import type { Place } from './domain/geo';
import { apiRequest, jsonRequest, messageOf } from './services/apiClient';
import type { HoursRequest, HoursResult } from './services/apiContracts';
import { Feedback } from './ui/Feedback';
export function PlaceHours({ place }: { place: Place | null }) {
  const [when, setWhen] = useState(''); const [result, setResult] = useState<HoursResult | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { request.current?.abort(); setResult(null); setError(''); setBusy(false); return () => request.current?.abort(); }, [place, when]);
  async function check() {
    if (!place || !when) return; request.current?.abort(); const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setResult(null);
    try { const data = await apiRequest<HoursResult>('/api/v1/places/availability', jsonRequest({ coordinates: place.coordinates, schedule: place.metadata?.opening_hours ?? null, timestamp: new Date(when).toISOString() } satisfies HoursRequest, controller.signal)); if (!controller.signal.aborted) setResult(data); }
    catch (e) { if (!controller.signal.aborted) setError(messageOf(e)); }
    finally { if (request.current === controller && !controller.signal.aborted) setBusy(false); }
  }
  return <aside className="panel" aria-label="Opening hours"><p className="eyebrow">Published schedules</p><h2>Opening hours</h2><p>{place?.name ?? 'Select a place to check its schedule.'}</p><p className="schedule">{place?.metadata?.opening_hours ?? 'No published hours for the selected place.'}</p><label>Check time (your browser timezone)<input type="datetime-local" value={when} onInput={e => { request.current?.abort(); setWhen(e.currentTarget.value); setResult(null); }} onChange={e => { request.current?.abort(); setWhen(e.target.value); setResult(null); }} /></label><button className="full-width" disabled={!place || !when || busy} onClick={check}>Check published hours</button><Feedback message={error || (busy ? 'Evaluating schedule…' : '')} error={!!error} busy={busy} />{result && <section className="result-block"><h3>{result.status.replaceAll('_', ' ')}</h3><p className="hint">{result.basis}</p></section>}<p className="footnote">Evaluated in the place’s timezone. Unknown hours never mean open. Exceptional closures may be unrecorded.</p></aside>;
}
