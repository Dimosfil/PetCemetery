import { describe, expect, it } from "vitest";
import { canSearchCity, normalizeCitySearch } from "@/lib/friends";

describe("city friend search", () => {
  it("normalizes whitespace and selects the first URL value", () => {
    expect(normalizeCitySearch("  Нижний   Новгород  ")).toBe("Нижний Новгород");
    expect(normalizeCitySearch(["Казань", "Москва"])).toBe("Казань");
  });

  it("requires at least two normalized characters", () => {
    expect(canSearchCity(normalizeCitySearch(" М "))).toBe(false);
    expect(canSearchCity(normalizeCitySearch(" Уфа "))).toBe(true);
  });
});
