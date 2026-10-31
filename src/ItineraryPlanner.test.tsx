import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ItineraryPlanner } from './ItineraryPlanner';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('keeps a generated itinerary visible when persistence fails and reports the failure', async () => {
  const point = { latitude: 12, longitude: 34 };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/generate')) return { ok: true, json: async () => ({ origin: point, destination: point, total_duration_minutes: 60, warnings: [], limitations: 'Estimates', stops: [{ id: 's', name: 'Museum', arrival: '2026-01-02T12:00:00Z' }], legs: [] }) };
    return { ok: false, json: async () => ({}) };
  }));
  render(<ItineraryPlanner selected={{ id: 'p', name: 'Place', coordinates: point }} poiPlaces={[{ id: 's', name: 'Museum', coordinates: point }]} onRoute={vi.fn()} />);
  fireEvent.click(screen.getByText('Use selected place as start'));
  fireEvent.click(screen.getByText('Use selected place as destination'));
  fireEvent.click(screen.getByRole('button', { name: 'Museum' }));
  fireEvent.change(screen.getByLabelText('Departure date and time'), { target: { value: '2026-01-02T12:00' } });
  fireEvent.click(screen.getByText('Generate itinerary'));
  expect(await screen.findByText(/could not be saved/)).toBeTruthy();
  expect(screen.getByText(/Museum · arrival/)).toBeTruthy();
});
