import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ItineraryPlanner } from './ItineraryPlanner';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('requires confirmation before importing a City Guide and preserves its order, duration and budget', () => {
 const origin = { id: 'o', name: 'City centre', coordinates: { latitude: 19, longitude: 72 } };
 const draft = { origin, stops: [{ ...origin, id: 'b', name: 'Second-ranked selection', visitMinutes: 45 }, { ...origin, id: 'a', name: 'First-ranked selection', visitMinutes: 20 }], departure: '2026-11-01T09:00', mode: 'walking' as const, availableMinutes: 240, bufferMinutes: 10 };
 render(<ItineraryPlanner selected={null} poiPlaces={[]} onRoute={vi.fn()} guideDraft={draft} />);
 expect((screen.getByLabelText('Itinerary start') as HTMLInputElement).value).toBe('');
 fireEvent.click(screen.getByText('Import City Guide selection'));
 expect((screen.getByLabelText('Stop 1') as HTMLInputElement).value).toBe('Second-ranked selection');
 expect((screen.getByLabelText('Visit minutes for Second-ranked selection') as HTMLInputElement).value).toBe('45');
 expect((screen.getByLabelText('Available minutes') as HTMLInputElement).value).toBe('240');
 expect((screen.getByLabelText('Itinerary travel mode') as HTMLSelectElement).value).toBe('walking');
});

it('keeps a generated itinerary visible when persistence fails and reports the failure', async () => {
  const point = { latitude: 12, longitude: 34 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/generate')) return { ok: true, json: async () => ({ origin: point, destination: point, status: 'ok', destination_status: 'included', destination_omission: null, omitted_stops: [], total_duration_minutes: 60, warnings: [], limitations: 'Estimates', stops: [{ id: 's', name: 'Museum', arrival: '2026-01-02T12:00:00Z', visit_start: '2026-01-02T12:00:00Z', visit_end: '2026-01-02T12:30:00Z', travel_from_previous: { duration_seconds: 600 }, opening_hours: { status: 'unknown' } }], legs: [] }) };
    return { ok: false, json: async () => ({}) };
  }));
  render(<ItineraryPlanner selected={{ id: 'p', name: 'Place', coordinates: point }} poiPlaces={[{ id: 's', name: 'Museum', coordinates: point }]} onRoute={vi.fn()} />);
  fireEvent.click(screen.getByText('Use selected place as start'));
  fireEvent.click(screen.getByText('Use selected place as destination'));
  fireEvent.click(screen.getByRole('button', { name: 'Museum' }));
  fireEvent.change(screen.getByLabelText('Departure date and time'), { target: { value: '2026-01-02T12:00' } });
  fireEvent.click(screen.getByText('Generate itinerary'));
  expect(await screen.findByText(/could not be saved/)).toBeTruthy();
  expect(screen.getByText(/Arrival:/)).toBeTruthy();
});

it('aborts a pending itinerary and clears only its own route after a budget edit', async () => {
 let resolve!: (value: unknown) => void; const fetcher = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })); vi.stubGlobal('fetch', fetcher); const onRoute = vi.fn();
 const place = { id: 'p', name: 'P', coordinates: { latitude: 12, longitude: 34 } };
 render(<ItineraryPlanner selected={place} poiPlaces={[]} onRoute={onRoute} />);
 fireEvent.click(screen.getByText('Use selected place as start')); fireEvent.click(screen.getByText('Add selected place as stop'));
 fireEvent.change(screen.getByLabelText('Departure date and time'), { target: { value: '2026-11-02T10:00' } }); fireEvent.click(screen.getByText('Generate itinerary'));
 const signal = fetcher.mock.calls[0][1].signal; fireEvent.change(screen.getByLabelText('Available minutes'), { target: { value: '120' } }); expect(signal.aborted).toBe(true);
 await act(async () => resolve({ ok: true, json: async () => ({ stops: [], legs: [], total_duration_minutes: 60 }) }));
 expect(onRoute).toHaveBeenLastCalledWith(null); expect(screen.queryByText(/60 minutes estimated/)).toBeNull();
});
