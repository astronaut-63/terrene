import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Discovery } from './Discovery';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const place = { id: 'a', name: 'A', coordinates: { latitude: 10, longitude: 20 } };
it('discards pending discovery after a map context change and explains cancellation', async () => {
 let resolve!: (value: unknown) => void; const fetcher = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })); vi.stubGlobal('fetch', fetcher); const onPlaces = vi.fn();
 const view = render(<Discovery selected={place} route={null} onPlaces={onPlaces} onSelect={vi.fn()} />);
 fireEvent.click(screen.getByText('Discover nearby')); const signal = fetcher.mock.calls[0][1].signal;
 view.rerender(<Discovery selected={{ ...place, id: 'b', coordinates: { latitude: 30, longitude: 40 } }} route={null} onPlaces={onPlaces} onSelect={vi.fn()} />);
 expect(signal.aborted).toBe(true); expect(screen.getByText(/Search cancelled/)).toBeTruthy();
 await act(async () => resolve({ ok: true, json: async () => ({ results: [place] }) })); expect(onPlaces).toHaveBeenLastCalledWith([]);
});
it('keeps real partial results and exposes the provider failure warning', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [place], status: 'partial', warning: 'One route sample failed.', coverage: 'Sampled route coverage.' }) }));
 render(<Discovery selected={place} route={{ type: 'LineString', coordinates: [[20,10], [21,11]] }} onPlaces={vi.fn()} onSelect={vi.fn()} />);
 fireEvent.click(screen.getByText('Along route')); expect(await screen.findByText(/One route sample failed/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'A Mapped place' })).toBeTruthy();
});

it('clears completed results and markers on location changes', async () => {
 vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [place] }) }));
 const onPlaces = vi.fn(); const view = render(<Discovery selected={place} route={null} onPlaces={onPlaces} onSelect={vi.fn()} />);
 fireEvent.click(screen.getByText('Discover nearby')); await screen.findByRole('button', { name: 'A Mapped place' });
 view.rerender(<Discovery selected={{ ...place, coordinates: { latitude: 11, longitude: 22 } }} route={null} onPlaces={onPlaces} onSelect={vi.fn()} />);
 expect(screen.queryByRole('button', { name: 'A Mapped place' })).toBeNull(); expect(onPlaces).toHaveBeenLastCalledWith([]);
});
it('aborts route requests and rejects invalid short geometry', async () => {
 const fetcher = vi.fn().mockImplementation(() => new Promise(() => {})); vi.stubGlobal('fetch', fetcher);
 const view = render(<Discovery selected={place} route={{ type: 'LineString', coordinates: [[20,10], [21,11]] }} onPlaces={vi.fn()} onSelect={vi.fn()} />);
 fireEvent.click(screen.getByText('Along route')); const signal = fetcher.mock.calls[0][1].signal;
 view.rerender(<Discovery selected={place} route={{ type: 'LineString', coordinates: [[20,10]] }} onPlaces={vi.fn()} onSelect={vi.fn()} />);
 expect(signal.aborted).toBe(true); expect((screen.getByText('Along route') as HTMLButtonElement).disabled).toBe(true);
});
it('distinguishes failure from empty success and lets retry succeed with custom categories', async () => {
 const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ detail: 'Provider unavailable' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) }); vi.stubGlobal('fetch', fetcher);
 render(<Discovery selected={place} route={null} onPlaces={vi.fn()} onSelect={vi.fn()} />);
 fireEvent.click(screen.getByLabelText('Food')); expect((screen.getByLabelText('Category preset') as HTMLSelectElement).value).toBe('Custom');
 fireEvent.click(screen.getByText('Discover nearby')); await screen.findByText('Provider unavailable'); expect(screen.queryByText(/No mapped places matched/)).toBeNull();
 fireEvent.click(screen.getByText('Retry nearby search')); expect(await screen.findByText(/No mapped places matched/)).toBeTruthy(); expect(fetcher.mock.calls[1][0]).toContain('food');
});
it('labels stale results with age and blocks duplicate clicks while loading', async () => {
 let resolve!: (value: unknown) => void; const fetcher = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })); vi.stubGlobal('fetch', fetcher);
 render(<Discovery selected={place} route={null} onPlaces={vi.fn()} onSelect={vi.fn()} />);
 fireEvent.click(screen.getByText('Discover nearby')); fireEvent.click(screen.getByText('Discover nearby')); expect(fetcher).toHaveBeenCalledTimes(1);
 await act(async () => resolve({ ok: true, json: async () => ({ results: [place], cache: 'stale', age_seconds: 320 }) })); expect(screen.getByText(/Stale cached results \(320 seconds old\)/)).toBeTruthy();
});
