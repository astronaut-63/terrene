import { useState } from 'react';
import type { Place, RouteGeoJSON } from './domain/geo';
export type DiscoveredPlace = Place & {metadata?: Record<string,string>; accessibility?: string};
const presets: Record<string,string[]> = {General:['tourism','nature'], Student:['education','food'], 'Senior Citizen':['health','nature','public'], Health:['health'], Accessibility:['accessibility','public']};
export function Discovery({selected, route, onPlaces, onSelect}: {selected: Place|null; route: RouteGeoJSON|null; onPlaces:(p:Place[])=>void; onSelect:(p:Place)=>void}) {
  const [categories,setCategories] = useState(['tourism','nature']);
  const [places,setPlaces] = useState<DiscoveredPlace[]>([]);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  async function discover(along=false) {
    if (!selected || !categories.length) return;
    setBusy(true); setMessage('Discovering mapped places…');
    try {
      let r:Response;
      if (along && route) {
        const points = Array.from({length:5},(_,i)=>route.coordinates[Math.round(i*(route.coordinates.length-1)/4)]).map(([longitude,latitude])=>({latitude,longitude}));
        r = await fetch('/api/v1/places/along-route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({points,categories:categories.join(',')})});
      } else r = await fetch(`/api/v1/places/nearby?latitude=${selected.coordinates.latitude}&longitude=${selected.coordinates.longitude}&categories=${categories.join(',')}`);
      const data=await r.json(); if(!r.ok) throw new Error(typeof data.detail==='string'?data.detail:'Discovery failed.');
      setPlaces(data.results); onPlaces(data.results); setMessage(`${data.results.length} places · ${data.attribution}. ${data.coverage??''}`);
    } catch(e) {setMessage(String(e));} finally {setBusy(false);}
  }
  const detail=selected as DiscoveredPlace|null;
  return <aside className="panel"><h2>Explore nearby</h2><label>Viewing mode<select onChange={e=>{setCategories(presets[e.target.value]);setPlaces([]);onPlaces([]);}}>{Object.keys(presets).map(p=><option key={p}>{p}</option>)}</select></label><fieldset><legend>Place categories</legend>{['tourism','nature','education','health','food','hotels','public','accessibility'].map(c=><label key={c}><input type="checkbox" checked={categories.includes(c)} onChange={e=>{setCategories(e.target.checked?[...categories,c]:categories.filter(x=>x!==c));setPlaces([]);onPlaces([]);}} />{c}</label>)}</fieldset><button disabled={busy||!selected||!categories.length} onClick={()=>discover()}>Discover nearby</button><button disabled={busy||!selected||!route||!categories.length} onClick={()=>discover(true)}>Discover along route</button><button onClick={()=>onPlaces([])}>Hide POI markers</button><p role="status">{message}</p><ul>{places.map(p=><li key={p.id}><button onClick={()=>onSelect(p)}>{p.name}</button></li>)}</ul>{detail?.metadata&&<section><h3>{detail.name}</h3><p>Wheelchair access: {detail.accessibility??'unknown'}</p><p>Published opening hours: {detail.metadata.opening_hours??'Not provided'}</p><p>Schedule only; exceptional closures may be unrecorded.</p>{['website','phone','addr:street','wheelchair:description'].map(k=>detail.metadata?.[k]&&<p key={k}>{k}: {detail.metadata[k]}</p>)}</section>}</aside>;
}
