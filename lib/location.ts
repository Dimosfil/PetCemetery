import { createHash } from "node:crypto";

export type LocationMode = "exact" | "approximate" | "symbolic" | "hidden";

export type PublicLocation = {
  publicLatitude: number | null;
  publicLongitude: number | null;
};

function normalizeLongitude(value: number) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

export function derivePublicLocation(
  mode: LocationMode,
  latitude: number | null,
  longitude: number | null,
  stableSeed: string,
): PublicLocation {
  if (mode === "hidden" || latitude === null || longitude === null) {
    return { publicLatitude: null, publicLongitude: null };
  }

  if (mode === "exact" || mode === "symbolic") {
    return { publicLatitude: latitude, publicLongitude: longitude };
  }

  const digest = createHash("sha256").update(stableSeed).digest();
  const angle = (digest.readUInt32BE(0) / 0xffffffff) * Math.PI * 2;
  const distanceMeters = 500 + (digest.readUInt32BE(4) / 0xffffffff) * 1000;
  const latitudeOffset = (distanceMeters * Math.cos(angle)) / 111_320;
  const longitudeScale = Math.max(Math.cos((latitude * Math.PI) / 180), 0.1);
  const longitudeOffset = (distanceMeters * Math.sin(angle)) / (111_320 * longitudeScale);

  return {
    publicLatitude: Math.max(-90, Math.min(90, latitude + latitudeOffset)),
    publicLongitude: normalizeLongitude(longitude + longitudeOffset),
  };
}
