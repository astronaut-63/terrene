import { useState } from 'react';
import type { DiscoveredPlace } from './Discovery';
export function PlaceHours({place}:{place:DiscoveredPlace|null}) {
  const [when,setWhen]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false);
  async function check() {
    if(!place||!when) return; setBusy(true);
    try { const r=await fetch('/api/v1/places/availability',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({coordinates:place.coordinates,schedule:place.metadata?.opening_hours??null,timestamp:new Date(when).toISOString()})}); const data=await r.json(); if(!r.ok) throw new Error('Schedule evaluation unavailable.'); setMessage(`${place.name}: ${data.status.replaceAll('_',' ')}. ${data.basis}`); } catch(e){setMessage(String(e));} finally{setBusy(false);}
  }
  return <aside className="panel"><h2>Published opening schedule</h2><p>{place?.metadata?.opening_hours??'No published hours for the selected place.'}</p><label>Check time (your browser timezone)<input type="datetime-local" value={when} onChange={e=>setWhen(e.target.value)}/></label><button disabled={!place||!when||busy} onClick={check}>Check published hours</button><p role="status">{message}</p></aside>;
}
