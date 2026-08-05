import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  exchangeGoogleCode,
  getGoogleOAuthConfig,
  verifyGoogleIdToken,
} from "@/lib/google-oauth";
import { findOrCreateGoogleUser } from "@/lib/oauth-users";

export const runtime = "nodejs";

function matchesState(expected: string | undefined, actual: string | null) {
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

function loginRedirect(appUrl: URL, error: string) {
  const url = new URL("/login", appUrl);
  url.searchParams.set("oauthError", error);
  const response = NextResponse.redirect(url);
  clearOAuthCookies(response);
  return response;
}

function clearOAuthCookies(response: NextResponse) {
  const options = { httpOnly: true, sameSite: "lax" as const, path: "/api/auth/google", maxAge: 0 };
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", options);
  response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, "", options);
}

export async function GET(request: NextRequest) {
  const config = getGoogleOAuthConfig();

  if (request.nextUrl.searchParams.has("error")) {
    return loginRedirect(config.appUrl, "cancelled");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value;
  if (!code || !verifier || !matchesState(expectedState, state)) {
    return loginRedirect(config.appUrl, "invalid_request");
  }

  try {
    const idToken = await exchangeGoogleCode(config, code, verifier);
    const profile = await verifyGoogleIdToken(idToken, config.clientId);
    const user = await findOrCreateGoogleUser(profile);
    await setSession(user);

    const response = NextResponse.redirect(new URL("/dashboard", config.appUrl));
    clearOAuthCookies(response);
    return response;
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return loginRedirect(config.appUrl, "failed");
  }
}
