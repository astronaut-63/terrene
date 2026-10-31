import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { EarthGlobe, searchLocations } from './index';
import type { GeographicLocation, GlobeMarker, GlobeStatus } from './contracts';

function Demo() {
  const [status, setStatus] = useState<GlobeStatus>('initializing');
  const [message, setMessage] = useState('');
  const [markers, setMarkers] = useState<GlobeMarker[]>([]);
  const [selected, setSelected] = useState<GeographicLocation | null>(null);
  const [results, setResults] = useState<GeographicLocation[]>([]);
  return <div style={{height: '100vh', background: '#111', color: 'white', fontFamily: 'sans-serif'}}>
    <div style={{height: '80%'}}><EarthGlobe markers={markers} selectedLocation={selected} onStatusChange={setStatus}
      onError={error => setMessage(error.message)} onMarkerSelected={id => setMessage(`Selected marker ${id}`)}
      onCoordinatesSelected={coordinates => { setMessage(`${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}`); setMarkers([{id: 'picked', label: 'Selected point', coordinates}]); }} /></div>
    <div style={{padding: 12}}><strong>{status}</strong> · {message}
      <form onSubmit={async event => {event.preventDefault(); const query = new FormData(event.currentTarget).get('query') as string; try {setResults(await searchLocations(query));} catch(error) {setMessage((error as Error).message);} }}>
        <input name="query" aria-label="Location" placeholder="Search a place" /><button>Search</button>
      </form>
      {results.map(location => <button key={location.id} onClick={() => setSelected(location)}>{location.name}</button>)}
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>);
