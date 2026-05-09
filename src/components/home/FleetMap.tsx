"use client";
import * as React from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Maker } from "@/lib/catalog";

type Coord = { lat: number; lng: number };

type Props = {
  makers: Maker[];
  user: Coord | null;
  selectedMakerId: string | null;
  onSelect: (id: string) => void;
};

// Custom DivIcons keep us in the design system (no Leaflet defaults — those
// also break in bundlers because their asset paths are relative).
//
// The marker is a circle with a printer glyph inside (Lucide's Printer
// outline, inlined as SVG so we can colour-shift it via CSS without an
// extra HTTP round-trip per pin).
const PRINTER_SVG = `
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
       stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <polyline points="6 9 6 2 18 2 18 9" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" rx="1" />
  </svg>
`;

function makerIcon(opts: { available: boolean; selected: boolean }) {
  const ring = opts.selected
    ? "2px solid #0a0a0a"
    : opts.available
      ? "1.5px solid rgba(16,185,129,0.85)"
      : "1.5px solid rgba(0,0,0,0.25)";
  const bg = opts.selected ? "#0a0a0a" : "#ffffff";
  const fg = opts.selected ? "#ffffff" : "#0a0a0a";
  return L.divIcon({
    className: "fab-maker-icon",
    html: `
      <div style="
        width: 34px; height: 34px; border-radius: 9999px;
        background: ${bg};
        border: ${ring};
        color: ${fg};
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      ">${PRINTER_SVG}</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function userIcon() {
  return L.divIcon({
    className: "fab-user-icon",
    html: `
      <div style="position: relative; width: 22px; height: 22px;">
        <div style="
          position: absolute; inset: 0; border-radius: 9999px;
          background: rgba(16,185,129,0.25);
          animation: fab-user-pulse 2s ease-in-out infinite;
        "></div>
        <div style="
          position: absolute; inset: 6px; border-radius: 9999px;
          background: #10b981;
          border: 2px solid #ffffff;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
        "></div>
      </div>
      <style>@keyframes fab-user-pulse { 0%,100% { opacity:0.4; transform:scale(1);} 50% { opacity:0.1; transform:scale(1.4);} }</style>
    `,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function FitToPoints({
  points,
  focus,
}: {
  points: Coord[];
  focus: Coord | null;
}) {
  const map = useMap();
  React.useEffect(() => {
    if (focus) {
      map.setView([focus.lat, focus.lng], 14, { animate: true });
      return;
    }
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
  }, [map, points, focus]);
  return null;
}

export function FleetMap({ makers, user, selectedMakerId, onSelect }: Props) {
  const points: Coord[] = [
    ...(user ? [user] : []),
    ...makers.map((m) => ({ lat: m.lat, lng: m.lng })),
  ];
  const focus = selectedMakerId
    ? makers.find((m) => m.id === selectedMakerId) ?? null
    : null;

  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[51.5074, -0.1278]}
        zoom={12}
        zoomControl={false}
        attributionControl={false}
        className="absolute inset-0"
        style={{ background: "#f5f5f5" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          subdomains={["a", "b", "c", "d"]}
        />
        <FitToPoints points={points} focus={focus} />
        {user ? <Marker position={[user.lat, user.lng]} icon={userIcon()} /> : null}
        {makers.map((m) => (
          <Marker
            key={m.pinId ?? m.id}
            position={[m.lat, m.lng]}
            icon={makerIcon({
              available: m.available,
              selected: selectedMakerId === m.id,
            })}
            eventHandlers={{ click: () => onSelect(m.id) }}
          >
            <Tooltip direction="top" offset={[0, -18]} opacity={1}>
              <div
                style={{
                  font: "500 12px/1.25 Inter, sans-serif",
                  padding: "2px 0",
                }}
              >
                <div style={{ fontWeight: 700 }}>{m.name}</div>
                <div
                  style={{
                    font: "400 10px/1 'Space Mono', ui-monospace, monospace",
                    color: "#00000090",
                    marginTop: 3,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  {m.printer} · {m.statusEta}
                </div>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>

      {/* Attribution strip (we kept the Carto + OSM credit minimal and out of the map chrome) */}
      <div className="pointer-events-none absolute bottom-2 right-3 font-mono text-[8px] uppercase tracking-[0.18em] text-black/30">
        © OpenStreetMap · Carto
      </div>
    </div>
  );
}
