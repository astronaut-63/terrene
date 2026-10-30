import { FormEvent, useEffect, useRef, useState } from "react";
import { searchLocations, type GeoCoordinates, type GeographicLocation, type GlobeMarker, type GlobeStatus } from "./globe";

type SearchState = "idle" | "loading" | "success" | "empty" | "error";
const coordinatesText = (c: GeoCoordinates) => `${c.latitude.toFixed(4)}° latitude, ${c.longitude.toFixed(4)}° longitude`;
const statusLabel: Record<GlobeStatus, string> = { initializing: "Initialising globe", ready: "Globe ready", degraded: "Globe running with limited resources", error: "Globe unavailable" };

export function App() {
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState<SearchState>("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<GeographicLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<GeographicLocation | null>(null);
  const [markers, setMarkers] = useState<GlobeMarker[]>([]);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [globeStatus] = useState<GlobeStatus>("initializing");
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const term = query.trim();
    controllerRef.current?.abort();
    if (!term) { setResults([]); setSearchError("Enter a place, city, or set of coordinates to search."); setSearchState("error"); return; }
    const controller = new AbortController(); controllerRef.current = controller;
    setSearchState("loading"); setSearchError(null); setResults([]);
    try {
      const locations: GeographicLocation[] = await searchLocations(term, controller.signal);
      if (controller.signal.aborted) return;
      setResults(locations); setSearchState(locations.length ? "success" : "empty");
    } catch (error) {
      if (controller.signal.aborted) return;
      setSearchError(error instanceof Error ? error.message : "Location search is unavailable."); setSearchState("error");
    }
  }
  function selectLocation(location: GeographicLocation) { setSelectedLocation(location); setSelectedMarkerId(null); }
  function addMarker() { if (!selectedLocation) return; const marker = { id: `marker-${Date.now()}`, label: selectedLocation.name, coordinates: selectedLocation.coordinates }; setMarkers((current) => [...current, marker]); setSelectedMarkerId(marker.id); }
  function removeMarker(markerId: string) { setMarkers((current) => current.filter((marker) => marker.id !== markerId)); if (selectedMarkerId === markerId) setSelectedMarkerId(null); }

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#explore" aria-label="Terrene exploration home"><span className="brand-mark" aria-hidden="true">◉</span> Terrene</a><nav aria-label="Primary navigation"><a href="#explore">Explore</a></nav><span className="status-pill" data-status={globeStatus} role="status"><span aria-hidden="true" />{statusLabel[globeStatus]}</span></header>
    <section className="exploration" id="explore" aria-label="Globe exploration">
      <div className="globe-stage" aria-live="polite"><div className="globe-unavailable"><p className="eyebrow">Earth view</p><h1>Awaiting the globe engine</h1><p>The application shell is ready, but the published globe contract does not yet export an EarthGlobe component.</p></div><div className="stage-grid" aria-hidden="true" /><p className="attribution">Imagery and terrain attribution will appear here when the Earth engine is connected.</p></div>
      <aside className="search-panel panel" aria-label="Location search"><p className="eyebrow">Find a place</p><form onSubmit={submitSearch} noValidate><label htmlFor="location-search">Search the Earth</label><div className="search-row"><input id="location-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="City, place, or coordinates" autoComplete="off" /><button type="submit" disabled={searchState === "loading"}>{searchState === "loading" ? "Searching" : "Search"}</button></div></form>{searchState === "loading" && <p className="hint" role="status">Looking for locations…</p>}{searchState === "empty" && <p className="hint">No locations matched that search.</p>}{searchState === "error" && <p className="message error" role="alert">{searchError}</p>}{searchState === "success" && <ul className="results" aria-label="Search results">{results.map((location) => <li key={location.id}><button type="button" onClick={() => selectLocation(location)}><strong>{location.name}</strong><span>{location.displayName ?? coordinatesText(location.coordinates)}</span></button></li>)}</ul>}</aside>
      <aside className="location-panel panel" aria-label="Selected location"><p className="eyebrow">Selected location</p>{selectedLocation ? <><h2>{selectedLocation.name}</h2>{selectedLocation.displayName && <p className="place-name">{selectedLocation.displayName}</p>}<dl><div><dt>Latitude</dt><dd>{selectedLocation.coordinates.latitude.toFixed(4)}°</dd></div><div><dt>Longitude</dt><dd>{selectedLocation.coordinates.longitude.toFixed(4)}°</dd></div>{selectedLocation.coordinates.heightMeters !== undefined && <div><dt>Height</dt><dd>{selectedLocation.coordinates.heightMeters.toFixed(0)} m</dd></div>}</dl><div className="button-row"><button type="button" onClick={addMarker}>Add marker</button><button type="button" className="quiet" onClick={() => setSelectedLocation(null)}>Clear</button></div></> : <p className="hint">Choose a search result or a point on the globe when it becomes available.</p>}</aside>
      <aside className="marker-panel panel" aria-label="Map markers"><p className="eyebrow">Markers</p>{markers.length ? <ul className="markers">{markers.map((marker) => <li key={marker.id} className={selectedMarkerId === marker.id ? "selected" : ""}><button type="button" onClick={() => setSelectedMarkerId(marker.id)}>{marker.label}<span>{coordinatesText(marker.coordinates)}</span></button><button type="button" className="icon-button" aria-label={`Remove ${marker.label} marker`} onClick={() => removeMarker(marker.id)}>×</button></li>)}</ul> : <p className="hint">Saved points will appear here.</p>}</aside>
    </section>
  </main>;
}
