import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { GeographicLocation, Place } from '../domain/geo';
import { searchLocations } from '../services/locationSearch';
import { LocationAutocomplete } from './LocationAutocomplete';

vi.mock('../services/locationSearch', () => ({ searchLocations: vi.fn() }));
const mumbai = { id: 'mumbai', name: 'Mumbai', displayName: 'Mumbai, India', coordinates: { latitude: 19.076, longitude: 72.8777 } };
const pune = { id: 'pune', name: 'Pune', displayName: 'Pune, India', coordinates: { latitude: 18.52, longitude: 73.8567 } };
function Field({ automatic = false }: { automatic?: boolean }) {
 const [place, setPlace] = useState<Place | null>(null);
 return <><LocationAutocomplete label="Origin" value={place} onChange={setPlace} autoSuggest={automatic} /><output>{place?.name ?? 'Unassigned'}</output><button>Outside</button></>;
}
beforeEach(() => vi.mocked(searchLocations).mockReset());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('uses explicit submission with the public-provider default, and supports keyboard selection, edit and clear', async () => {
 vi.mocked(searchLocations).mockResolvedValue([mumbai, pune]); render(<Field />);
 const field = screen.getByRole('combobox', { name: 'Origin' });
 fireEvent.change(field, { target: { value: 'Mumbai' } }); expect(searchLocations).not.toHaveBeenCalled();
 fireEvent.keyDown(field, { key: 'Enter' }); await screen.findAllByRole('option');
 fireEvent.keyDown(field, { key: 'ArrowUp' }); expect(field.getAttribute('aria-activedescendant')).toContain('option-1');
 fireEvent.keyDown(field, { key: 'ArrowDown' }); fireEvent.keyDown(field, { key: 'Enter' });
 expect(screen.getByRole('status').textContent).toBe('Mumbai'); expect(document.activeElement).toBe(field);
 fireEvent.change(field, { target: { value: 'Pun' } }); expect(screen.getByText('Unassigned')).toBeTruthy();
 expect(screen.queryAllByRole('option')).toHaveLength(0);
 fireEvent.click(screen.getByLabelText('Clear origin')); expect((field as HTMLInputElement).value).toBe('');
});

it('debounces rapid typing and searches only the latest query when the provider permits suggestions', async () => {
 vi.useFakeTimers(); vi.mocked(searchLocations).mockResolvedValue([pune]); render(<Field automatic />);
 const field = screen.getByRole('combobox');
 fireEvent.change(field, { target: { value: 'Mum' } });
 await act(async () => vi.advanceTimersByTime(200));
 fireEvent.change(field, { target: { value: 'Pune' } });
 await act(async () => vi.advanceTimersByTime(449)); expect(searchLocations).not.toHaveBeenCalled();
 await act(async () => vi.advanceTimersByTime(1)); expect(searchLocations).toHaveBeenCalledTimes(1);
 expect(vi.mocked(searchLocations).mock.calls[0][0]).toBe('Pune');
 expect(screen.getByRole('option').textContent).toContain('Pune');
});

it('cancels old requests and ignores responses that arrive after a new query or a selection', async () => {
 let resolveOld!: (places: GeographicLocation[]) => void;
 vi.mocked(searchLocations).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValueOnce([pune]);
 render(<Field />); const field = screen.getByRole('combobox');
 fireEvent.change(field, { target: { value: 'Mumbai' } }); fireEvent.keyDown(field, { key: 'Enter' });
 expect(screen.getByText('Looking for places…')).toBeTruthy(); const signal = vi.mocked(searchLocations).mock.calls[0][1];
 fireEvent.change(field, { target: { value: 'Pune' } }); expect(signal?.aborted).toBe(true);
 fireEvent.keyDown(field, { key: 'Enter' }); fireEvent.click(await screen.findByRole('option'));
 await act(async () => resolveOld([mumbai]));
 expect((field as HTMLInputElement).value).toBe('Pune'); expect(screen.queryByRole('option')).toBeNull();
});

it('reports empty results and errors, and Escape cancels and dismisses a pending search', async () => {
 vi.mocked(searchLocations).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Provider unavailable')).mockImplementationOnce(() => new Promise(() => {}));
 render(<Field />); const field = screen.getByRole('combobox');
 fireEvent.change(field, { target: { value: 'Unknown' } }); fireEvent.keyDown(field, { key: 'Enter' });
 expect(await screen.findByText(/No places found/)).toBeTruthy();
 fireEvent.change(field, { target: { value: 'Paris' } }); fireEvent.keyDown(field, { key: 'Enter' });
 expect((await screen.findByRole('alert')).textContent).toBe('Provider unavailable');
 fireEvent.keyDown(field, { key: 'Enter' }); fireEvent.keyDown(field, { key: 'Escape' });
 expect(vi.mocked(searchLocations).mock.calls[2][1]?.aborted).toBe(true);
 expect(field.getAttribute('aria-expanded')).toBe('false');
});

it('cancels debounce on blur and on unmount', async () => {
 vi.useFakeTimers(); render(<Field automatic />); const field = screen.getByRole('combobox');
 fireEvent.change(field, { target: { value: 'Mumbai' } });
 fireEvent.blur(field, { relatedTarget: screen.getByText('Outside') });
 await act(async () => vi.advanceTimersByTime(500)); expect(searchLocations).not.toHaveBeenCalled();
 fireEvent.change(field, { target: { value: 'Pune' } }); cleanup();
 await act(async () => vi.advanceTimersByTime(500)); expect(searchLocations).not.toHaveBeenCalled();
});
