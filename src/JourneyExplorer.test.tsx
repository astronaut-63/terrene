import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JourneyExplorer } from './JourneyExplorer';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('sends UTC, displays partial weather, selects map checkpoints and clears a failed refresh', async () => {
  const onRoute = vi.fn(), onSelect = vi.fn();
  const geometry = { type: 'LineString', coordinates: [[0, 0], [1, 1]] };
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({
    route: { geometry }, limitations: 'Estimated travel only.', checkpoints: [{
      index: 0, coordinates: { latitude: 0, longitude: 0 }, progress: 0, distance_m: 0,
      elapsed_seconds: 0, arrival: '2026-10-31T12:00:00Z', weather: {
        status: 'partially_available', reason: 'Wind missing.', values: { temperature_2m: 20, precipitation: null },
        forecast_timestamp: '2026-10-31T12:00:00Z', units: {},
      },
    }],
  }) }).mockResolvedValueOnce({ ok: false, json: async () => ({ detail: 'Routing provider timed out.' }) });
  vi.stubGlobal('fetch', fetcher);
  render(<JourneyExplorer selected={{ id: 'a', name: 'Place', coordinates: { latitude: 0, longitude: 0 } }} onRoute={onRoute} onSelect={onSelect} />);
  fireEvent.click(screen.getByText('Use selected place as journey origin'));
  fireEvent.click(screen.getByText('Use selected place as journey destination'));
  fireEvent.change(screen.getByLabelText('Departure in your browser timezone'), { target: { value: '2026-10-31T12:00' } });
  fireEvent.click(screen.getByText('Generate journey timeline'));
  expect(await screen.findByText('Wind missing.')).toBeTruthy();
  expect(screen.getByText(/20 °C · Unknown mm/)).toBeTruthy();
  expect(JSON.parse(fetcher.mock.calls[0][1].body).departure).toBe(new Date('2026-10-31T12:00').toISOString());
  fireEvent.click(screen.getByRole('button', { name: /0%/ }));
  expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'checkpoint-0' }));
  expect(onRoute).toHaveBeenCalledWith(geometry);
  fireEvent.click(screen.getByText('Generate journey timeline'));
  expect(await screen.findByText('Routing provider timed out.')).toBeTruthy();
  expect(screen.queryByText('Wind missing.')).toBeNull();
  expect(onRoute).toHaveBeenLastCalledWith(null);
});
