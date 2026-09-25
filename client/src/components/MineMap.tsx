import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Crosshair, Search } from 'lucide-react';

export interface LatLng {
  lat: number;
  lng: number;
}

const INDIA_CENTER: [number, number] = [22.8, 82.5];
// Standard OSM tiles (no API key); darkened to match the theme via .map-dark in index.css.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

const PIN_STYLE = { color: '#09090b', weight: 2, fillColor: '#f4f4f5', fillOpacity: 1 };
const AREA_STYLE = { color: '#f4f4f5', weight: 1.5, opacity: 0.7, fillColor: '#f4f4f5', fillOpacity: 0.06 };
const YOU_STYLE = { color: '#09090b', weight: 2, fillColor: '#3987e5', fillOpacity: 1 };

const ClickToPlace: React.FC<{ onPick: (p: LatLng) => void }> = ({ onPick }) => {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
};

const FlyTo: React.FC<{ target: LatLng | null; zoom: number }> = ({ target, zoom }) => {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), zoom), { duration: 0.6 });
  }, [target?.lat, target?.lng]);
  return null;
};

const zoomFor = (radius: number) => (radius > 3000 ? 12 : radius > 1200 ? 13 : 14);

/** Editable map: click to drop the pin; the circle shows the attendance radius. */
export const MinePicker: React.FC<{
  value: LatLng | null;
  radius: number;
  onChange: (p: LatLng) => void;
  onPlaceFound?: (name: string) => void;
}> = ({ value, radius, onChange, onPlaceFound }) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<LatLng | null>(value);

  const place = (p: LatLng) => {
    onChange(p);
    setFlyTarget(p);
  };

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setMessage(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(query.trim())}`
      );
      const [hit] = await res.json();
      if (!hit) {
        setMessage('No place found. Try a nearby town.');
        return;
      }
      place({ lat: Number(hit.lat), lng: Number(hit.lon) });
      onPlaceFound?.(String(hit.display_name).split(',')[0]);
    } catch {
      setMessage('Search is unavailable. Click the map instead.');
    } finally {
      setSearching(false);
    }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Location is not available in this browser.');
      return;
    }
    setMessage(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => place({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setMessage('Could not get your location.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                search();
              }
            }}
            placeholder="Search a town or area"
            className="input pl-9"
          />
        </div>
        <button type="button" onClick={search} disabled={searching} className="btn-secondary shrink-0">
          {searching ? 'Searching…' : 'Find'}
        </button>
        <button type="button" onClick={useMyLocation} className="btn-ghost border border-white/10 shrink-0" title="Use my location">
          <Crosshair className="w-4 h-4" />
        </button>
      </div>

      <div className="map-dark relative isolate h-72 rounded-lg overflow-hidden border border-white/10">
        <MapContainer
          center={value ? [value.lat, value.lng] : INDIA_CENTER}
          zoom={value ? zoomFor(radius) : 5}
          className="h-full w-full"
          scrollWheelZoom
        >
          <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
          <ClickToPlace onPick={onChange} />
          <FlyTo target={flyTarget} zoom={zoomFor(radius)} />
          {value && (
            <>
              <Circle center={[value.lat, value.lng]} radius={radius} pathOptions={AREA_STYLE} />
              <CircleMarker center={[value.lat, value.lng]} radius={6} pathOptions={PIN_STYLE} />
            </>
          )}
        </MapContainer>
      </div>

      <p className="text-xs text-zinc-500">
        {message ||
          (value
            ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)} · click the map to move the pin`
            : 'Click the map to place the mine.')}
      </p>
    </div>
  );
};

export interface MapMine {
  id: string;
  name: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusMeters: number;
}

/** Read-only map showing one or more mines with their attendance radius, and optionally the viewer's position. */
export const MinesMap: React.FC<{
  mines: MapMine[];
  onSelect?: (id: string) => void;
  height?: string;
  you?: LatLng | null;
  colorFor?: (id: string) => string; // pin colour per mine, e.g. by risk level
}> = ({ mines, onSelect, height = 'h-72', you, colorFor }) => {
  const placed = mines.filter((m) => m.latitude != null && m.longitude != null);
  const points: [number, number][] = placed.map((m) => [m.latitude!, m.longitude!]);
  if (you) points.push([you.lat, you.lng]);
  const single = points.length === 1 ? placed[0] : null;

  return (
    <div className={`map-dark relative isolate ${height} rounded-xl overflow-hidden border border-white/[0.06]`}>
      <MapContainer
        // react-leaflet ignores `bounds` whenever center/zoom are set, so pass one or the other.
        {...(points.length > 1
          ? { bounds: points }
          : { center: single ? [single.latitude!, single.longitude!] : INDIA_CENTER, zoom: single ? zoomFor(single.radiusMeters) : 5 })}
        boundsOptions={{ padding: [40, 40], maxZoom: 15 }}
        className="h-full w-full"
        scrollWheelZoom={false}
      >
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        {placed.map((m) => (
          <React.Fragment key={m.id}>
            <Circle
              center={[m.latitude!, m.longitude!]}
              radius={m.radiusMeters}
              pathOptions={colorFor ? { ...AREA_STYLE, color: colorFor(m.id), fillColor: colorFor(m.id) } : AREA_STYLE}
            />
            <CircleMarker
              center={[m.latitude!, m.longitude!]}
              radius={colorFor ? 8 : 6}
              pathOptions={colorFor ? { ...PIN_STYLE, fillColor: colorFor(m.id) } : PIN_STYLE}
              eventHandlers={onSelect ? { click: () => onSelect(m.id) } : undefined}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                {m.name}
              </Tooltip>
            </CircleMarker>
          </React.Fragment>
        ))}
        {you && (
          <CircleMarker center={[you.lat, you.lng]} radius={6} pathOptions={YOU_STYLE}>
            <Tooltip direction="top" offset={[0, -6]} permanent>
              You
            </Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  );
};
