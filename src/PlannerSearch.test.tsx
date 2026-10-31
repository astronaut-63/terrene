import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RoutePlanner } from './RoutePlanner';
import { JourneyExplorer } from './JourneyExplorer';
import { ItineraryPlanner } from './ItineraryPlanner';
import { searchLocations } from './services/locationSearch';
import type { ItineraryResult, Trip } from './services/apiContracts';

vi.mock('./services/locationSearch', () => ({ searchLocations: vi.fn() }));
const places = ['Mumbai', 'Pune', 'Museum', 'Park'].map((name, i) => ({ id: name, name, displayName: name + ', India', coordinates: { latitude: 19 - i / 10, longitude: 72 + i / 10 } }));
beforeEach(() => vi.mocked(searchLocations).mockImplementation(async query => places.filter(place => place.name === query)));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function choose(label: string, name: string) {
 const input = screen.getByRole('combobox', { name: label });
 fireEvent.change(input, { target: { value: name } }); fireEvent.keyDown(input, { key: 'Enter' });
 fireEvent.click(await screen.findByRole('option', { name: name + ' ' + name + ', India' }));
}
const geometry = { type: 'LineString', coordinates: [[72, 19], [72.1, 18.9]] };

it('routes searched endpoints, preserves attribution and invalidates geometry immediately on endpoint editing', async () => {
 const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ geometry, distance_km: 10, duration_seconds: 600, limitations: 'Travel estimate.' }) });
 vi.stubGlobal('fetch', fetcher); const onRoute = vi.fn();
 render(<RoutePlanner selected={null} onRoute={onRoute} />);
 await choose('Route origin', 'Mumbai'); await choose('Route destination', 'Pune');
 fireEvent.click(screen.getByText('Calculate route')); await screen.findByText('Route calculated.');
 expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ origin: places[0].coordinates, destination: places[1].coordinates, mode: 'driving' });
 expect(onRoute).toHaveBeenLastCalledWith(geometry); expect(screen.getByText('10.0 km')).toBeTruthy();
 expect(screen.queryByText('Transit routing is unavailable.')).toBeNull();
 fireEvent.change(screen.getByLabelText('Route origin'), { target: { value: 'New origin' } });
 expect(onRoute).toHaveBeenLastCalledWith(null); expect(screen.queryByText('10.0 km')).toBeNull();
 expect((screen.getByLabelText('Route destination') as HTMLInputElement).value).toBe('Pune');
 expect((screen.getByText('Calculate route') as HTMLButtonElement).disabled).toBe(true);
});

it('restores a saved trip into searchable endpoints and displays genuine route failures', async () => {
 vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: !url.endsWith('/routes'), json: async () => url.endsWith('/trips') ? { trips: [{ id: 'trip', name: 'Saved journey', plan: { origin: places[0].coordinates, destination: places[1].coordinates, mode: 'cycling' } }] } : { detail: 'Routing provider timed out.' } })));
 const { rerender } = render(<RoutePlanner selected={null} onRoute={vi.fn()} view="trips" />);
 fireEvent.click(await screen.findByRole('button', { name: 'Saved journey cycling · Load inputs' }));
 rerender(<RoutePlanner selected={null} onRoute={vi.fn()} view="route" />);
 expect((screen.getByLabelText('Route origin') as HTMLInputElement).value).toBe('Saved origin');
 expect((screen.getByLabelText('Travel mode') as HTMLSelectElement).value).toBe('cycling');
 fireEvent.click(screen.getByText('Calculate route')); expect((await screen.findByRole('alert')).textContent).toContain('timed out');
});

it('sends aware departure and distance spacing for searched Journey endpoints, and clears a result on endpoint edit', async () => {
 const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ checkpoints: [], route: { geometry }, limitations: 'Journey estimate.' }) });
 vi.stubGlobal('fetch', fetcher); const onRoute = vi.fn();
 render(<JourneyExplorer selected={null} onSelect={vi.fn()} onRoute={onRoute} />);
 await choose('Journey origin', 'Mumbai'); await choose('Journey destination', 'Pune');
 fireEvent.change(screen.getByLabelText('Departure in your browser timezone'), { target: { value: '2026-11-01T10:00' } });
 fireEvent.change(screen.getByLabelText('Checkpoint placement'), { target: { value: 'spacing' } });
 fireEvent.change(screen.getByLabelText('Checkpoint spacing in metres'), { target: { value: '50000' } });
 fireEvent.click(screen.getByText('Generate journey timeline')); await screen.findByText('Journey estimate.');
 const body = JSON.parse(fetcher.mock.calls[0][1].body);
 expect(body.checkpoint_spacing_m).toBe(50000); expect(body.checkpoint_count).toBeUndefined();
 expect(body.departure).toBe(new Date('2026-11-01T10:00').toISOString());
 fireEvent.change(screen.getByLabelText('Journey destination'), { target: { value: 'Museum' } });
 expect(onRoute).toHaveBeenLastCalledWith(null); expect(screen.queryByText('Journey estimate.')).toBeNull();
 expect((screen.getByLabelText('Journey origin') as HTMLInputElement).value).toBe('Mumbai');
});

it('adds and edits itinerary stops in place without changing their order or visit durations', async () => {
 const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ detail: 'Routing provider timed out.' }) });
 vi.stubGlobal('fetch', fetcher);
 render(<ItineraryPlanner selected={null} poiPlaces={[]} onRoute={vi.fn()} />);
 await choose('Itinerary start', 'Mumbai');
 await choose('Find a stop', 'Museum'); fireEvent.click(screen.getByText('Add stop'));
 await choose('Find a stop', 'Park'); fireEvent.click(screen.getByText('Add stop'));
 fireEvent.change(screen.getByLabelText('Visit minutes for Museum'), { target: { value: '45' } });
 await choose('Stop 1', 'Pune');
 expect((screen.getByLabelText('Visit minutes for Pune') as HTMLInputElement).value).toBe('45');
 expect((screen.getByLabelText('Stop 2') as HTMLInputElement).value).toBe('Park');
 fireEvent.change(screen.getByLabelText('Departure date and time'), { target: { value: '2026-11-01T10:00' } });
 fireEvent.click(screen.getByText('Generate itinerary')); await act(async () => {});
 const body = JSON.parse(fetcher.mock.calls[0][1].body);
 expect(body.stops.map((stop: { name: string }) => stop.name)).toEqual(['Pune', 'Park']);
 expect(body.stops[0].visit_minutes).toBe(45);
 fireEvent.click(screen.getByLabelText('Remove Pune')); expect((screen.getByLabelText('Stop 1') as HTMLInputElement).value).toBe('Park');
});

it('restores itinerary inputs and break settings, displays partial warnings, and updates the original saved trip', async () => {
 const stamp = '2026-11-01T09:00:00Z';
 const itinerary: ItineraryResult = {
   status: 'partial', origin: places[0].coordinates, destination: places[1].coordinates, departure: stamp, available_minutes: 240,
   stops: [{ id: 'Museum', name: 'Museum', coordinates: places[2].coordinates, arrival: stamp, visit_start: stamp, visit_end: stamp, visit_minutes: 45, opening_hours: { status: 'unknown', schedule: null, timestamp: stamp, basis: 'No schedule' }, travel_from_previous: { distance_m: 1000, duration_seconds: 600 } }, { type: 'break', after_stop: 'Museum', duration_minutes: 10, start: stamp, end: stamp }],
   legs: [], omitted_stops: [{ id: 'Park', name: 'Park', reason: 'time_budget_exceeded' }], destination_status: 'omitted', destination_omission: 'time_budget_exceeded', warnings: ['Opening hours could not be confirmed.'], total_duration_minutes: 65, limitations: 'Travel estimates.'
 };
 const trip: Trip = { id: 'saved-itinerary', name: 'Saved plan', plan: { origin: itinerary.origin, destination: places[1].coordinates, mode: 'walking', itinerary } };
 const fetcher = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/generate') ? itinerary : trip }));
 vi.stubGlobal('fetch', fetcher);
 render(<ItineraryPlanner selected={null} poiPlaces={[]} restoredTrip={trip} onRoute={vi.fn()} />);
 expect((screen.getByLabelText('Itinerary start') as HTMLInputElement).value).toBe('Saved starting point');
 expect((screen.getByLabelText('Final destination (optional)') as HTMLInputElement).value).toBe('Saved final destination');
 expect((screen.getByLabelText('Stop 1') as HTMLInputElement).value).toBe('Museum');
 expect((screen.getByLabelText('Visit minutes for Museum') as HTMLInputElement).value).toBe('45');
 expect((screen.getByLabelText('Break minutes') as HTMLInputElement).value).toBe('10');
 fireEvent.click(screen.getByText('Generate itinerary'));
 expect(await screen.findByText('Opening hours could not be confirmed.')).toBeTruthy();
 expect(screen.getByText('Park: time budget exceeded')).toBeTruthy();
 await screen.findByText('Itinerary saved for this browser.');
 expect(fetcher.mock.calls[1][0]).toBe('/api/v1/trips/saved-itinerary');
});
