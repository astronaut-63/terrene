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
