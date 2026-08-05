import { describe, expect, it } from "vitest";
import { slugify } from "@/lib/slug";

describe("slugify", () => {
  it("transliterates common Cyrillic names", () => {
    expect(slugify("Барсик")).toBe("barsik");
    expect(slugify("Ёжик и Щенок")).toBe("ezhik-i-schenok");
  });

  it("returns a safe fallback", () => {
    expect(slugify("♡")).toBe("pet");
  });
});
