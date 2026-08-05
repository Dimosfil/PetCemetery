"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, CircleMarker } from "leaflet";

type Props = {
  latitude: number | null;
  longitude: number | null;
  disabled: boolean;
  onChange: (latitude: number, longitude: number) => void;
};

const initialLatitude = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LAT || 55.751244);
const initialLongitude = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_LNG || 37.618423);

export function MapPicker({ latitude, longitude, disabled, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<CircleMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  async function selectPoint(nextLatitude: number, nextLongitude: number) {
    if (disabledRef.current || !mapRef.current) return;
    const L = await import("leaflet");
    const roundedLatitude = Number(nextLatitude.toFixed(6));
    const roundedLongitude = Number(nextLongitude.toFixed(6));
    markerRef.current?.remove();
    markerRef.current = L.circleMarker([roundedLatitude, roundedLongitude], {
      radius: 9, color: "#6d516b", fillColor: "#e2b98f", fillOpacity: 1, weight: 3,
    }).addTo(mapRef.current);
    onChangeRef.current(roundedLatitude, roundedLongitude);
  }

  function selectMapCenter() {
    const center = mapRef.current?.getCenter();
    if (center) void selectPoint(center.lat, center.lng);
  }

  useEffect(() => {
    if (!container.current || mapRef.current) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !container.current) return;
      const center: [number, number] = [latitude ?? initialLatitude, longitude ?? initialLongitude];
      const map = L.map(container.current, { scrollWheelZoom: true }).setView(center, latitude === null ? 4 : 12);
      L.tileLayer(process.env.NEXT_PUBLIC_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: process.env.NEXT_PUBLIC_TILE_ATTRIBUTION || "© OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      if (latitude !== null && longitude !== null) {
        markerRef.current = L.circleMarker([latitude, longitude], {
          radius: 9, color: "#6d516b", fillColor: "#e2b98f", fillOpacity: 1, weight: 3,
        }).addTo(map);
      }
      map.on("click", (event) => {
        void selectPoint(event.latlng.lat, event.latlng.lng);
      });
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map instance owns coordinate updates after initialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || latitude === null || longitude === null) return;
    void import("leaflet").then((L) => {
      markerRef.current?.remove();
      markerRef.current = L.circleMarker([latitude, longitude], {
        radius: 9, color: "#6d516b", fillColor: "#e2b98f", fillOpacity: 1, weight: 3,
      }).addTo(map);
    });
  }, [latitude, longitude]);

  return (
    <div className={disabled ? "map-picker is-disabled" : "map-picker"}>
      <div className="map-picker-frame">
        <div className="map-surface" ref={container} aria-label="Выбор места на карте" />
        {!disabled && <span className="map-center-target" aria-hidden="true">⌖</span>}
      </div>
      {!disabled && (
        <div className="map-picker-controls">
          <button className="button button-small" type="button" onClick={selectMapCenter}>
            Поставить метку в центре карты
          </button>
          {latitude !== null && longitude !== null && (
            <output className="map-coordinates" aria-live="polite">
              {latitude.toFixed(6)}, {longitude.toFixed(6)}
            </output>
          )}
        </div>
      )}
      <p className="map-help">
        {disabled
          ? "Выберите способ отображения места выше, чтобы активировать карту."
          : "Нажмите на карту или переместите её так, чтобы нужное место оказалось под прицелом, и поставьте метку кнопкой."}
      </p>
    </div>
  );
}
