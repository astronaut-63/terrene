import type { CSSProperties } from 'react';
export type IconName = 'explore' | 'route' | 'journey' | 'itinerary' | 'discover' | 'saved' | 'trips' | 'sun' | 'clock' | 'settings' | 'chevron' | 'close' | 'search' | 'pin' | 'layers' | 'plus' | 'minus' | 'fit' | 'menu';
const paths: Record<IconName, string> = {
  explore: 'm12 3 8 4v10l-8 4-8-4V7l8-4Zm0 0v18M4 7l8 4 8-4',
  route: 'M6 5a2 2 0 1 0 0 .01M18 19a2 2 0 1 0 0 .01M8 5h7a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6h7',
  journey: 'M3 12h18M6 8v8m6-12v16m6-12v8',
  itinerary: 'M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01',
  discover: 'm12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3 3-6Z',
  saved: 'M6 3h12v18l-6-4-6 4V3Z',
  trips: 'M8 7V4h8v3M4 7h16v14H4V7Zm0 5h16M9 7v14m6-14v14',
  sun: 'M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5',
  clock: 'M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0Zm-9-5v5l3 2',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6',
  chevron: 'm14 6-6 6 6 6', close: 'm6 6 12 12M6 18 18 6', search: 'M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0Zm-2 5 6 6',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Zm-5 0a2 2 0 1 0-4 0 2 2 0 0 0 4 0Z',
  layers: 'm12 3 10 5-10 5L2 8l10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5', menu: 'M4 6h16M4 12h16M4 18h16',
};
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
