import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./globe", () => ({ searchLocations: vi.fn(), EarthGlobe: (props: import('./globe').EarthGlobeProps) => <div>
  <button onClick={() => props.onCoordinatesSelected?.({latitude: 12, longitude: 34})}>Pick test point</button>
  <button onClick={() => props.onStatusChange?.('degraded')}>Report degraded</button>
  <span data-testid="flight">{props.selectedLocation?.name ?? 'no flight'}</span>
  <span data-testid="marker-count">{props.markers?.length ?? 0}</span>
</div> }));

import { searchLocations } from "./globe";

afterEach(() => cleanup());

describe("App", () => {
  it('connects picking, marker state, flights and truthful engine status', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', {name: 'Report degraded'}));
    expect(screen.getByText('Globe running with limited resources')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', {name: 'Everest'}));
    expect(screen.getByTestId('flight').textContent).toBe('Everest');
    fireEvent.click(screen.getByRole('button', {name: 'Pick test point'}));
    expect(screen.getByText('12.0000°')).toBeTruthy();
    expect(screen.getByTestId('flight').textContent).toBe('no flight');
    fireEvent.click(screen.getByRole('button', {name: 'Add marker'}));
    expect(screen.getByTestId('marker-count').textContent).toBe('1');
    fireEvent.click(screen.getByRole('button', {name: 'Remove Selected point marker'}));
    expect(screen.getByTestId('marker-count').textContent).toBe('0');
  });
  it("renders the shell and validates an empty search", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter a place");
    expect(screen.getByRole('button', {name: 'Pick test point'})).toBeTruthy();
  });

  it("renders a result and can add and remove its marker", async () => {
    vi.mocked(searchLocations).mockResolvedValueOnce([{ id: "delhi", name: "Delhi", coordinates: { latitude: 28.6139, longitude: 77.209 } }]);
    render(<App />);
    fireEvent.change(screen.getByLabelText("Search the Earth"), { target: { value: "Delhi" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: /Delhi/ }));
    expect(screen.getByText("28.6139°")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add marker" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Delhi marker" }));
    expect(screen.getByText("Saved points will appear here.")).toBeTruthy();
  });

  it("surfaces provider failures without fabricating results", async () => {
    vi.mocked(searchLocations).mockRejectedValueOnce(new Error("Search provider unavailable"));
    render(<App />);
    fireEvent.change(screen.getByLabelText("Search the Earth"), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Search provider unavailable");
  });
});
