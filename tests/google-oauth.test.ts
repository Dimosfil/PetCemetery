import { describe, expect, it } from "vitest";
import { buildGoogleAuthorizationUrl, createCodeChallenge } from "@/lib/google-oauth";

describe("Google OAuth", () => {
  it("builds an authorization request with state and PKCE", () => {
    const url = buildGoogleAuthorizationUrl(
      { clientId: "client-id", redirectUri: "http://localhost:3000/api/auth/google/callback" },
      "state-value",
      "challenge-value",
    );

    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/auth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-value");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-value");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("creates the RFC 7636 S256 code challenge", () => {
    expect(createCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"))
      .toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});
