import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./services/locationSearch", () => ({ searchLocations: vi.fn() }));
vi.mock("./map/MapView", () => ({ MapView: (props: any) => <div>
  <button onClick={() => props.onPlaceSelected?.({ id: 'picked', name: 'Selected point', coordinates: {latitude: 12, longitude: 34} })}>Pick test point</button>
  <button onClick={() => props.onStatusChange?.('error')}>Report map error</button>
  <span data-testid="flight">{props.selectedPlace?.name ?? 'no flight'}</span>
  <span data-testid="marker-count">{props.savedPlaces?.length ?? 0}</span>
</div> }));

import { searchLocations } from "./services/locationSearch";

afterEach(() => cleanup());

describe("App", () => {
  it('connects picking, marker state, flights and truthful engine status', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Report map error'}));
    expect(screen.getByText('Map unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Everest'}));
    expect(screen.getByTestId('flight').textContent).toBe('Everest');
    fireEvent.click(screen.getByRole('button', {name: 'Pick test point'}));
    expect(screen.getByText('12.0000°')).toBeTruthy();
    expect(screen.getByTestId('flight').textContent).toBe('Selected point');
    fireEvent.click(screen.getByRole('button', {name: 'Save place'}));
    expect(screen.getByTestId('marker-count').textContent).toBe('1');
    fireEvent.click(screen.getByRole('button', {name: 'Remove Selected point saved place'}));
    expect(screen.getByTestId('marker-count').textContent).toBe('0');
  });
  it("renders the shell and validates an empty search", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter a place");
    expect(screen.getByRole('button', {name: 'Pick test point'})).toBeTruthy();
  });

  it("renders a result and can add and remove its marker", async () => {
    vi.mocked(searchLocations).mockResolvedValueOnce([{ id: "delhi", name: "Delhi", displayName: "Delhi, India", coordinates: { latitude: 28.6139, longitude: 77.209 } }]);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Search places, streets and destinations"), { target: { value: "Delhi" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: /Delhi/ }));
    expect(screen.getByText("28.6139°")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save place" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Delhi saved place" }));
    expect(screen.getByText("Saved destinations will appear in both map modes.")).toBeTruthy();
  });

  it("surfaces provider failures without fabricating results", async () => {
    vi.mocked(searchLocations).mockRejectedValueOnce(new Error("Search provider unavailable"));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Search places, streets and destinations"), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Search provider unavailable");
  });
});

it('removes temporary checkpoint markers and selection when journey inputs change', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    route: { geometry: { type: 'LineString', coordinates: [[34, 12], [34, 12]] } },
    limitations: 'Estimated travel only.', checkpoints: [{ index: 0, progress: 0, distance_m: 0,
      coordinates: { latitude: 12, longitude: 34 }, arrival: '2026-10-31T12:00:00Z',
      weather: { status: 'provider_error', reason: 'Forecast unavailable.', values: {}, forecast_timestamp: null } }],
  }) });
  vi.stubGlobal('fetch', fetchMock);
  try {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick test point' }));
    fireEvent.click(screen.getByText('Use selected place as journey origin'));
    fireEvent.click(screen.getByText('Use selected place as journey destination'));
    fireEvent.change(screen.getByLabelText('Departure in your browser timezone'), { target: { value: '2026-10-31T12:00' } });
    fireEvent.click(screen.getByText('Generate journey timeline'));
    await screen.findByText('Forecast unavailable.');
    fireEvent.click(screen.getByRole('button', { name: /0%/ }));
    expect(screen.getByTestId('marker-count').textContent).toBe('1');
    expect(screen.getByTestId('flight').textContent).toBe('Checkpoint 1');
    fireEvent.change(screen.getByLabelText('Departure in your browser timezone'), { target: { value: '2026-11-01T12:00' } });
    expect(screen.getByTestId('marker-count').textContent).toBe('0');
    expect(screen.getByTestId('flight').textContent).toBe('no flight');
  } finally { vi.unstubAllGlobals(); }
});
