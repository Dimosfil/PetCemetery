import { NextResponse } from "next/server";
import {
  GOOGLE_OAUTH_COOKIE_TTL_SECONDS,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  buildGoogleAuthorizationUrl,
  createCodeChallenge,
  createOAuthSecret,
  getGoogleOAuthConfig,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getGoogleOAuthConfig();
    const state = createOAuthSecret();
    const verifier = createOAuthSecret();
    const authorizationUrl = buildGoogleAuthorizationUrl(
      config,
      state,
      createCodeChallenge(verifier),
    );
    const response = NextResponse.redirect(authorizationUrl);
    const cookieOptions = {
      httpOnly: true,
      secure: config.appUrl.protocol === "https:",
      sameSite: "lax" as const,
      path: "/api/auth/google",
      maxAge: GOOGLE_OAUTH_COOKIE_TTL_SECONDS,
    };
    response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, cookieOptions);
    response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, verifier, cookieOptions);
    return response;
  } catch (error) {
    console.error("Google OAuth initialization failed", error);
    return NextResponse.json({ error: "Google OAuth is not configured" }, { status: 503 });
  }
}
