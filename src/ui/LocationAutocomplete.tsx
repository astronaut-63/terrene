import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { Place } from '../domain/geo';
import { searchLocations } from '../services/locationSearch';
import { messageOf } from '../services/apiClient';

interface Props {
  label: string;
  value: Place | null;
  onChange: (place: Place | null) => void;
  onSelect?: (place: Place) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  autoSuggest?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

/** The parent owns the chosen place; query/results belong only to this field. */
export function LocationAutocomplete({ label, value, onChange, onSelect, inputRef, autoSuggest = false, disabled, compact }: Props) {
  const id = useId();
  const localRef = useRef<HTMLInputElement>(null);
  const fieldRef = inputRef ?? localRef;
  const [query, setQuery] = useState(value?.name ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const controller = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const editing = useRef(false);
  const editedQuery = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const listRef = useRef<HTMLUListElement>(null);

  function cancel() {
    revision.current++;
    controller.current?.abort();
    clearTimeout(timer.current);
  }
  function resetResults() { setResults([]); setActive(-1); setError(''); setState('idle'); }
  useEffect(() => () => { revision.current++; controller.current?.abort(); clearTimeout(timer.current); }, []);
  useEffect(() => { listRef.current?.children[active]?.scrollIntoView?.({ block: 'nearest' }); }, [active]);
  useEffect(() => {
    // A null value after typing is the parent's acknowledgement, not a new query.
    if (editing.current && !value) { editing.current = false; return; }
    cancel(); resetResults(); setOpen(false); setQuery(value?.name ?? '');
    editedQuery.current = null;
  }, [value]);

  async function search(term: string) {
    cancel(); resetResults(); setOpen(true);
    if (!term.trim()) { setError('Enter a place, street or destination to search.'); setState('error'); return; }
    const request = new AbortController(); controller.current = request;
    const current = revision.current; setState('loading');
    try {
      const places = await searchLocations(term, request.signal);
      if (current !== revision.current || request.signal.aborted) return;
      setResults(places); setState('success'); setActive(-1);
    } catch (e) {
      if (current !== revision.current || request.signal.aborted) return;
      setError(messageOf(e)); setState('error');
    }
  }
  function edit(text: string) {
    cancel(); resetResults(); setQuery(text); setOpen(true); editedQuery.current = text;
    if (value) { editing.current = true; onChange(null); }
    if (autoSuggest && text.trim().length >= 3) timer.current = setTimeout(() => void search(text), 450);
  }
  function choose(place: Place) {
    cancel(); resetResults(); setOpen(false); setQuery(place.name); editedQuery.current = null;
    onChange(place); onSelect?.(place); fieldRef.current?.focus();
  }
  const showMenu = open && !disabled;
  return <div className={'location-autocomplete' + (compact ? ' compact-search' : '')}
    onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) { cancel(); setOpen(false); setState(current => current === 'loading' ? 'idle' : current); } }}>
    <label htmlFor={id}>{label}</label>
    <div className="location-input-row">
      <input id={id} ref={fieldRef} role="combobox" aria-autocomplete="list" aria-expanded={showMenu}
        aria-controls={showMenu ? id + '-results' : undefined} aria-activedescendant={showMenu && active >= 0 ? id + '-option-' + active : undefined}
        aria-describedby={id + '-help'} value={query} placeholder="Search a city, street or place" maxLength={256} autoComplete="off"
        disabled={disabled} onChange={e => edit(e.target.value)} onFocus={() => { if (editedQuery.current !== null) setOpen(true); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { e.preventDefault(); cancel(); setOpen(false); setState(current => current === 'loading' ? 'idle' : current); }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault(); setOpen(true);
            setActive(current => results.length ? (current + (e.key === 'ArrowDown' ? 1 : current < 0 ? 0 : -1) + results.length) % results.length : -1);
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (showMenu && active >= 0 && results[active]) choose(results[active]); else void search(query);
          }
        }} />
      {(query || value) && <button type="button" className="icon-button location-clear" aria-label={'Clear ' + label.toLowerCase()} disabled={disabled}
        onClick={() => { cancel(); resetResults(); editedQuery.current = ''; setQuery(''); setOpen(false); onChange(null); fieldRef.current?.focus(); }}>×</button>}
      <button type="button" className="quiet location-submit" aria-label={compact ? 'Search' : 'Search ' + label.toLowerCase()} disabled={disabled || state === 'loading'} onClick={() => void search(query)}>Search</button>
    </div>
    <span id={id + '-help'} className="search-help">{autoSuggest ? 'Type at least 3 characters for suggestions.' : 'Press Enter or Search to find places.'}</span>
    {showMenu && <div className="search-dropdown">
      <div role="status" className="search-message">{state === 'loading' ? 'Looking for places…' : state === 'success' && !results.length ? 'No places found. Try a more specific name.' : state === 'idle' ? (autoSuggest ? 'Keep typing or press Search.' : 'Press Enter or Search to find places.') : ''}</div>
      {state === 'error' && <div role="alert" className="search-message search-error">{error}</div>}
      <ul ref={listRef} id={id + '-results'} role="listbox" aria-label={label + ' suggestions'}>
        {results.map((place, index) => <li key={place.id} id={id + '-option-' + index} role="option" aria-selected={active === index}
          onPointerMove={() => setActive(index)} onMouseDown={e => e.preventDefault()} onClick={() => choose(place)}>
          <strong>{place.name}</strong><span>{place.displayName ?? `${place.coordinates.latitude.toFixed(4)}, ${place.coordinates.longitude.toFixed(4)}`}</span>
        </li>)}
      </ul>
      <p className="search-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · Nominatim</p>
    </div>}
  </div>;
}
