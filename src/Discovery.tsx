import { useEffect, useRef, useState } from 'react';
import type { Place, RouteGeoJSON } from './domain/geo';
import { apiRequest, jsonRequest, messageOf } from './services/apiClient';
import type { DiscoveryResult } from './services/apiContracts';
import { Feedback } from './ui/Feedback';
export type DiscoveredPlace = Place;
const presets: Record<string, string[]> = { General: ['tourism', 'nature'], Student: ['education', 'food'], 'Senior Citizen': ['health', 'nature', 'public'], Health: ['health'], Accessibility: ['accessibility', 'public'] };
const categoryNames: Record<string, string> = { tourism: 'Tourism', nature: 'Nature', education: 'Education', health: 'Health', food: 'Food', hotels: 'Hotels', public: 'Public facilities', accessibility: 'Accessibility' };
export function Discovery({ selected, route, onPlaces, onSelect }: { selected: Place | null; route: RouteGeoJSON | null; onPlaces: (p: Place[]) => void; onSelect: (p: Place) => void }) {
  const [categories, setCategories] = useState(['tourism', 'nature']); const [preset, setPreset] = useState('General');
  const [places, setPlaces] = useState<Place[]>([]); const [message, setMessage] = useState(''); const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false); const [queried, setQueried] = useState(false); const [contextName, setContextName] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  const callbacks = useRef(onPlaces); callbacks.current = onPlaces;
  const previousRoute = useRef(route);
  useEffect(() => {
    const sameRoute = previousRoute.current === route; previousRoute.current = route;
    const ownSelection = places.some(p => p.id === selected?.id && p.coordinates.latitude === selected.coordinates.latitude && p.coordinates.longitude === selected.coordinates.longitude);
    if (sameRoute && ownSelection) return;
    request.current?.abort(); setBusy(false); setPlaces([]); setQueried(false); setError(false);
    setMessage(current => current ? 'Search cancelled because the map context changed. Search again for this location.' : ''); callbacks.current([]);
  }, [selected?.coordinates.latitude, selected?.coordinates.longitude, route]);
  const validRoute = !!route && route.type === 'LineString' && route.coordinates.length >= 2 && route.coordinates.every(p => p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90);
  function invalidate() { request.current?.abort(); setBusy(false); setPlaces([]); setQueried(false); setMessage(''); onPlaces([]); }
  async function discover(along = false) {
    if ((!along && !selected) || (along && !validRoute) || !categories.length) return;
    invalidate(); const controller = new AbortController(); request.current = controller; setBusy(true); setError(false); setMessage('Discovering mapped places…');
    setContextName(along ? 'the active route' : selected!.name);
    try {
      let data: DiscoveryResult;
      if (along && route) {
        const points = route.coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
        data = await apiRequest('/api/v1/places/along-route', jsonRequest({ points, categories: categories.join(',') }, controller.signal));
      } else data = await apiRequest('/api/v1/places/nearby?latitude=' + selected!.coordinates.latitude + '&longitude=' + selected!.coordinates.longitude + '&categories=' + categories.join(','), { signal: controller.signal });
      if (!Array.isArray(data.results)) throw new Error('Discovery returned invalid data.');
      if (controller.signal.aborted) return; setPlaces(data.results); onPlaces(data.results); setQueried(true); setMessage(data.results.length + ' places. ' + (data.status === 'partial' ? 'Partial results. ' : '') + (data.cache === 'stale' ? 'Stale cached results (' + data.age_seconds + ' seconds old). ' : data.cache === 'fresh' ? 'Cached results (' + data.age_seconds + ' seconds old). ' : '') + (data.warning ?? '') + ' ' + (data.coverage ?? 'Nearby search within 1.5 km; coverage depends on mapped data.'));
    } catch (e) { if (!controller.signal.aborted) { setError(true); setMessage(messageOf(e)); } }
    finally { if (request.current === controller && !controller.signal.aborted) setBusy(false); }
  }
  return <aside className="panel" aria-label="Discover places"><p className="eyebrow">OpenStreetMap places</p><h2>Discover places</h2><p className="hint">Find mapped places near a selected point or along your active route.</p><label>Category preset<select value={preset} onChange={e => { invalidate(); setPreset(e.target.value); setCategories(presets[e.target.value]); }}><option value="Custom" disabled>Custom</option>{Object.keys(presets).map(p => <option key={p}>{p}</option>)}</select></label><p className="hint">Presets select categories. They do not personalise routing or rank recommendations.</p><fieldset className="category-grid"><legend>Place categories</legend>{Object.entries(categoryNames).map(([key, label]) => <label key={key}><input type="checkbox" checked={categories.includes(key)} onChange={e => { invalidate(); setPreset('Custom'); setCategories(e.target.checked ? [...categories, key] : categories.filter(x => x !== key)); }} />{label}</label>)}</fieldset><div className="button-row"><button disabled={busy || !selected || !categories.length} onClick={() => discover()}>Discover nearby</button><button className="quiet" disabled={busy || !validRoute || !categories.length} onClick={() => discover(true)}>Along route</button></div><Feedback message={message} error={error} busy={busy} />{queried && <p className="field-caption">Results around {contextName}</p>}{queried && !places.length && <p className="empty-state">No mapped places matched these categories in the searched area.</p>}<ul className="results">{places.map(p => <li key={p.id}><button aria-pressed={selected?.id === p.id} onClick={() => onSelect(p)}><strong>{p.name}</strong><span>{p.metadata?.tourism ?? p.metadata?.amenity ?? p.metadata?.leisure ?? 'Mapped place'}</span></button></li>)}</ul>{places.length > 0 && <button className="text-button" onClick={() => onPlaces([])}>Hide POI markers</button>}
    {selected?.metadata && <section className="result-block"><h3>{selected.name}</h3><p>Wheelchair access: {(selected.accessibility ?? 'unknown').replaceAll('_', ' ')}</p><p>Published opening hours: {selected.metadata.opening_hours ?? 'Not provided'}</p>{['website', 'phone', 'addr:street', 'wheelchair:description'].map(k => selected.metadata?.[k] && <p className="metadata-row" key={k}>{k.replaceAll('_', ' ')}: {selected.metadata[k]}</p>)}</section>}<p className="footnote">Published data may be incomplete. Accessibility tags and schedules do not guarantee current conditions.</p><p className="source">© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> · <a href="https://wiki.openstreetmap.org/wiki/Overpass_API">Overpass</a></p></aside>;
}
