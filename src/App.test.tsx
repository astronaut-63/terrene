import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("./globe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./globe")>();
  return { ...actual, searchLocations: vi.fn() };
});

import { searchLocations } from "./globe";

afterEach(() => cleanup());

describe("App", () => {
  it("renders the shell and validates an empty search", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("alert").textContent).toContain("Enter a place");
    expect(screen.getByText("Awaiting the globe engine")).toBeTruthy();
  });

  it("renders a result and can add and remove its marker", async () => {
    vi.mocked(searchLocations).mockResolvedValueOnce([{ id: "delhi", name: "Delhi", coordinates: { latitude: 28.6139, longitude: 77.209 } }] as unknown as never[]);
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
