import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JourneyExplorer } from './JourneyExplorer';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('renders partial weather and clears stale results when departure changes', async () => {
  const onRoute = vi.fn();
  const place = { id: 'place', name: 'Place', coordinates: { latitude: 12, longitude: 34 } };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      route: { geometry: { type: 'LineString', coordinates: [[34, 12], [34.1, 12.1]] } },
      limitations: 'Estimated travel only.',
      checkpoints: [{
        index: 0,
        coordinates: place.coordinates,
        progress: 0,
        distance_m: 0,
        elapsed_seconds: 0,
        arrival: '2026-01-02T03:00:00Z',
        weather: {
          status: 'partially_available',
          reason: 'Wind is unavailable.',
          values: { temperature_2m: 20, precipitation: null },
        },
      }],
    }),
  }));

  render(<JourneyExplorer selected={place} onSelect={vi.fn()} onRoute={onRoute} />);
  fireEvent.click(screen.getByText('Use selected place as journey origin'));
  fireEvent.click(screen.getByText('Use selected place as journey destination'));
  fireEvent.change(screen.getByLabelText('Departure in your browser timezone'), { target: { value: '2026-01-02T08:30' } });
  fireEvent.click(screen.getByText('Generate journey timeline'));

  expect(await screen.findByText('Wind is unavailable.')).toBeTruthy();
  expect(screen.getByText(/20 °C · Unknown mm/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Departure in your browser timezone'), { target: { value: '2026-01-02T09:30' } });
  expect(screen.queryByText('Wind is unavailable.')).toBeNull();
  expect(onRoute).toHaveBeenLastCalledWith(null);
});
