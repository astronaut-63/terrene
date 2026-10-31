import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RoutePlanner } from './RoutePlanner';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const place = { id: 'a', name: 'A', coordinates: { latitude: 10, longitude: 20 } };
it('aborts an old route when inputs change and never restores its stale geometry', async () => {
 let resolve!: (value: unknown) => void; const fetcher = vi.fn().mockImplementation(() => new Promise(r => { resolve = r; })); vi.stubGlobal('fetch', fetcher); const onRoute = vi.fn();
 render(<RoutePlanner selected={place} onRoute={onRoute} />);
 fireEvent.click(screen.getByText('Set origin')); fireEvent.click(screen.getByText('Set destination')); fireEvent.click(screen.getByText('Calculate route'));
 const signal = fetcher.mock.calls[0][1].signal; fireEvent.change(screen.getByLabelText('Travel mode'), { target: { value: 'walking' } }); expect(signal.aborted).toBe(true);
 await act(async () => resolve({ ok: true, json: async () => ({ geometry: { type: 'LineString', coordinates: [[20, 10], [21, 11]] }, distance_km: 1, duration_seconds: 60 }) }));
 expect(onRoute).toHaveBeenLastCalledWith(null); expect(screen.queryByText('Route calculated.')).toBeNull();
});
it('updates the saved trip instead of creating duplicates on repeated saves', async () => {
 const fetcher = vi.fn(async (url: string, _options?: RequestInit) => ({ ok: true, json: async () => url === '/api/v1/trips' ? { id: 'saved', trips: [] } : { id: 'saved' } })); vi.stubGlobal('fetch', fetcher);
 render(<RoutePlanner selected={place} onRoute={vi.fn()} />); fireEvent.click(screen.getByText('Set origin')); fireEvent.click(screen.getByText('Set destination'));
 fireEvent.click(screen.getByText('Save trip')); await screen.findByText('Trip saved for this browser.');
 fireEvent.click(screen.getByRole('button', { name: 'Update trip' }));
 await act(async () => {});
 expect(fetcher.mock.calls.filter(([, options]) => (options as RequestInit | undefined)?.method === 'POST')).toHaveLength(1);
 expect(fetcher.mock.calls.some(([url, options]) => url === '/api/v1/trips/saved' && (options as RequestInit | undefined)?.method === 'PUT')).toBe(true);
});
