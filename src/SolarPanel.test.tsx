import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { localDate, SolarPanel } from './SolarPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const place = { id: 'a', name: 'A', coordinates: { latitude: 10, longitude: 20 } };
const result = { sunrise_utc: '2026-10-31T06:00:00Z', sunset_utc: '2026-10-31T18:00:00Z', solar_noon_utc: '2026-10-31T12:00:00Z', day_length_seconds: 43200, solar_elevation_degrees: 60, solar_azimuth_degrees: 180, observation_utc: '2026-10-31T12:00:00Z', accuracy: 'Approximation' };
it('uses the current local date and ignores an old place response after selection changes', async () => {
 let resolve!: (value: unknown) => void; const fetcher = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })); vi.stubGlobal('fetch', fetcher);
 const view = render(<SolarPanel place={place} />); expect((screen.getByLabelText('Date') as HTMLInputElement).value).toBe(localDate());
 fireEvent.click(screen.getByText('Calculate daylight')); const signal = fetcher.mock.calls[0][1].signal;
 view.rerender(<SolarPanel place={{ ...place, id: 'b', name: 'B', coordinates: { latitude: 30, longitude: 40 } }} />);
 expect(signal.aborted).toBe(true);
 await act(async () => resolve({ ok: true, json: async () => result }));
 expect(screen.queryByText('Sunrise')).toBeNull(); expect((screen.getByText('Calculate daylight') as HTMLButtonElement).disabled).toBe(false);
});
it('invalidates a displayed success and aborts pending work when date changes', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => result })); render(<SolarPanel place={place} />);
 fireEvent.click(screen.getByText('Calculate daylight')); expect(await screen.findByText('Sunrise')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-03' } }); expect(screen.queryByText('Sunrise')).toBeNull();
});

it('aborts a pending solar calculation when its date changes', async () => {
 let resolve!: (value: unknown) => void; const fetcher = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })); vi.stubGlobal('fetch', fetcher);
 render(<SolarPanel place={place} />); fireEvent.click(screen.getByText('Calculate daylight')); const signal = fetcher.mock.calls[0][1].signal;
 fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-05' } }); expect(signal.aborted).toBe(true);
 await act(async () => resolve({ ok: true, json: async () => result })); expect(screen.queryByText('Sunrise')).toBeNull();
});
