import { describe, expect, it } from "vitest";
import { friendRequestSchema, friendshipActionSchema, memorialSchema, profileSchema, registerSchema } from "@/lib/validation";

const base = {
  name: "Барсик",
  species: "Кошка",
  breed: "",
  birthDate: "",
  passingDate: "",
  story: "",
  epitaph: "",
  avatarUrl: "",
  visibility: "public" as const,
  locationMode: "hidden" as const,
  latitude: null,
  longitude: null,
  locationLabel: "",
  ceremonyTitle: "",
  ceremonyMessage: "",
  ceremonyStartsAt: "",
};

describe("memorialSchema", () => {
  it("accepts a memorial without a public location", () => {
    expect(memorialSchema.safeParse(base).success).toBe(true);
  });

  it("requires coordinates for a visible location", () => {
    const result = memorialSchema.safeParse({ ...base, locationMode: "exact" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid coordinates", () => {
    const result = memorialSchema.safeParse({
      ...base,
      locationMode: "symbolic",
      latitude: 120,
      longitude: 37,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a passing date before the birth date", () => {
    const result = memorialSchema.safeParse({
      ...base,
      birthDate: "2020-01-01",
      passingDate: "2019-12-31",
    });
    expect(result.success).toBe(false);
  });
});

describe("owner city validation", () => {
  it("normalizes an optional registration city", () => {
    const result = registerSchema.parse({
      email: "owner@example.com",
      password: "long-enough-password",
      displayName: "Анна",
      city: "  Казань  ",
    });
    expect(result.city).toBe("Казань");
  });

  it("allows clearing the city and rejects oversized values", () => {
    expect(profileSchema.safeParse({ city: "" }).success).toBe(true);
    expect(profileSchema.safeParse({ city: "а".repeat(121) }).success).toBe(false);
  });
});

describe("friendship validation", () => {
  it("accepts a UUID friend target and supported lifecycle actions", () => {
    expect(friendRequestSchema.safeParse({ userId: "3d81dce1-1cb0-4f4c-bfa1-b3c7c24091e7" }).success).toBe(true);
    expect(friendshipActionSchema.safeParse({ action: "accept" }).success).toBe(true);
    expect(friendshipActionSchema.safeParse({ action: "remove" }).success).toBe(true);
  });

  it("rejects invalid targets and unsupported actions", () => {
    expect(friendRequestSchema.safeParse({ userId: "not-a-user" }).success).toBe(false);
    expect(friendshipActionSchema.safeParse({ action: "block" }).success).toBe(false);
  });
});
