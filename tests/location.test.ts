import { describe, expect, it } from "vitest";
import { derivePublicLocation } from "@/lib/location";

describe("derivePublicLocation", () => {
  it("never publishes a hidden location", () => {
    expect(derivePublicLocation("hidden", 55.75, 37.61, "pet-1")).toEqual({
      publicLatitude: null,
      publicLongitude: null,
    });
  });

  it("publishes exact and symbolic coordinates unchanged", () => {
    expect(derivePublicLocation("exact", 55.75, 37.61, "pet-1")).toEqual({
      publicLatitude: 55.75,
      publicLongitude: 37.61,
    });
    expect(derivePublicLocation("symbolic", 48.85, 2.35, "pet-1")).toEqual({
      publicLatitude: 48.85,
      publicLongitude: 2.35,
    });
  });

  it("creates a stable displaced public point for approximate mode", () => {
    const first = derivePublicLocation("approximate", 55.75, 37.61, "pet-1");
    const second = derivePublicLocation("approximate", 55.75, 37.61, "pet-1");
    expect(first).toEqual(second);
    expect(first.publicLatitude).not.toBe(55.75);
    expect(first.publicLongitude).not.toBe(37.61);
  });
});
