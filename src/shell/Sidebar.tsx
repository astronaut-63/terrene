import type { ReactNode } from 'react';
import { Icon, type IconName } from '../ui/Icon';
export type Feature = 'explore' | 'city' | 'route' | 'journey' | 'itinerary' | 'discover' | 'saved' | 'trips' | 'sun' | 'clock' | 'settings';
export const features: Array<{ id: Feature; label: string; icon: IconName; short: string }> = [
  { id: 'explore', label: 'Explore', icon: 'explore', short: 'Explore' },
  { id: 'city', label: 'City Guide', icon: 'discover', short: 'City' },
  { id: 'route', label: 'Route planning', icon: 'route', short: 'Route' },
  { id: 'journey', label: 'Journey simulation', icon: 'journey', short: 'Journey' },
  { id: 'itinerary', label: 'Itinerary planning', icon: 'itinerary', short: 'Plan' },
  { id: 'discover', label: 'Discover places', icon: 'discover', short: 'Discover' },
  { id: 'saved', label: 'Saved places', icon: 'saved', short: 'Places' },
  { id: 'trips', label: 'Saved trips', icon: 'trips', short: 'Trips' },
  { id: 'sun', label: 'Solar and daylight', icon: 'sun', short: 'Daylight' },
  { id: 'clock', label: 'Opening hours', icon: 'clock', short: 'Hours' },
  { id: 'settings', label: 'Map settings', icon: 'settings', short: 'Settings' },
];
export function Sidebar({ feature, collapsed, onFeature, onToggle, children }: { feature: Feature; collapsed: boolean; onFeature: (f: Feature) => void; onToggle: () => void; children: ReactNode }) {
  return <aside className={'sidebar' + (collapsed ? ' collapsed' : '')} aria-label="Geographical tools"><nav className="navigation-rail" aria-label="Exploration tools">{features.map((item, i) => <button key={item.id} className={'nav-tool' + (feature === item.id ? ' active' : '') + (i === 5 ? ' secondary-start' : '')} aria-label={item.label} aria-current={feature === item.id ? 'page' : undefined} title={item.label} onClick={() => onFeature(item.id)}><Icon name={item.icon} /><span>{item.short}</span></button>)}</nav><div className="context-panel" id="context-panel" hidden={collapsed}><div className="context-header"><span>{features.find(f => f.id === feature)?.label}</span><button className="icon-button" onClick={onToggle} aria-label="Collapse tools" title="Collapse tools"><Icon name="chevron" size={17} /></button></div><div className="context-scroll">{children}</div><footer className="legal-links"><a href="/privacy">Privacy policy</a><span>·</span><a href="/terms">Terms and conditions</a></footer></div></aside>;
}
