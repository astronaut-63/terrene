import type { RefObject } from 'react';
import type { MapMode, Place } from '../domain/geo';
import { Icon } from '../ui/Icon';
import { LocationAutocomplete } from '../ui/LocationAutocomplete';

interface Props {
  mode: MapMode;
  onMode: (mode: MapMode) => void;
  status: string;
  selected: Place | null;
  onSelect: (place: Place) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  collapsed: boolean;
  onToggle: () => void;
  autoSuggest: boolean;
}

export function AppHeader({ mode, onMode, status, selected, onSelect, searchRef, collapsed, onToggle, autoSuggest }: Props) {
  return <header className="topbar">
    <div className="brand-area"><a className="brand" href="/" aria-label="Terrene exploration home"><span>terrene<span className="brand-period">.</span></span></a><span className="brand-caption">Geographical workspace</span></div>
    <button className="icon-button tools-toggle" aria-label={collapsed ? 'Expand tools' : 'Collapse tools panel'} aria-expanded={!collapsed} aria-controls="context-panel" onClick={onToggle}><Icon name="menu" /></button>
    <div className="header-search" role="search"><LocationAutocomplete compact label="Search places, streets and destinations" value={selected} onChange={place => { if (place) onSelect(place); }} autoSuggest={autoSuggest} inputRef={searchRef} /></div>
    <span className="map-status" role="status"><span className={'status-dot ' + (status === 'Map ready' ? 'ready' : '')} aria-hidden="true" />{status}</span>
    <div className="mode-switch" role="group" aria-label="Map mode"><button aria-pressed={mode === '2d'} className={mode === '2d' ? 'active' : ''} onClick={() => onMode('2d')}>2D<span> Map</span></button><button aria-pressed={mode === '3d'} className={mode === '3d' ? 'active' : ''} onClick={() => onMode('3d')}>3D<span> Globe</span></button></div>
  </header>;
}
