"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

type Marker = {
  slug: string;
  name: string;
  species: string;
  latitude: number;
  longitude: number;
  locationLabel: string | null;
  locationMode: string;
};

const initialLatitude = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LAT || 55.751244);
const initialLongitude = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LNG || 37.618423);

export function MapBrowser() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [error, setError] = useState("");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let cancelled = false;
    void Promise.all([import("leaflet"), fetch("/api/map").then((response) => response.json())])
      .then(([L, markers]: [typeof import("leaflet"), Marker[]]) => {
        if (cancelled || !container.current) return;
        const map = L.map(container.current).setView([initialLatitude, initialLongitude], 4);
        L.tileLayer(process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || "© OpenStreetMap contributors",
          maxZoom: 19,
        }).addTo(map);

        const bounds = L.latLngBounds([]);
        for (const marker of markers) {
          const circle = L.circleMarker([marker.latitude, marker.longitude], {
            radius: 10, color: "#fffaf4", fillColor: "#765b73", fillOpacity: 0.92, weight: 3,
          }).addTo(map);
          const popup = document.createElement("div");
          popup.className = "map-popup";
          const type = document.createElement("span");
          type.textContent = marker.species;
          const title = document.createElement("strong");
          title.textContent = marker.name;
          const location = document.createElement("small");
          location.textContent = marker.locationMode === "symbolic"
            ? `Символическое место${marker.locationLabel ? ` · ${marker.locationLabel}` : ""}`
            : marker.locationLabel || "Место памяти";
          const link = document.createElement("a");
          link.href = `/memorials/${encodeURIComponent(marker.slug)}`;
          link.textContent = "Открыть мемориал →";
          popup.append(type, title, location, link);
          circle.bindPopup(popup);
          bounds.extend([marker.latitude, marker.longitude]);
        }
        if (markers.length) map.fitBounds(bounds.pad(0.18), { maxZoom: 11 });
        mapRef.current = map;
        setCount(markers.length);
      })
      .catch(() => setError("Не удалось загрузить карту. Попробуйте обновить страницу."));
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="map-browser-wrap">
      <div className="map-browser-meta">
        <span>{count === null ? "Загружаем истории…" : `${count} мемориалов на карте`}</span>
        <span>Показаны только разрешённые владельцами места</span>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="map-browser" ref={container} aria-label="Публичная карта мемориалов" />
    </div>
  );
}
