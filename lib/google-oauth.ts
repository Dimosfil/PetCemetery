import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_DNS_ATTEMPTS = 5;
const GOOGLE_DNS_RETRY_MS = 1_000;

export const GOOGLE_OAUTH_STATE_COOKIE = "pet_cemetery_google_oauth_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "pet_cemetery_google_oauth_verifier";
export const GOOGLE_OAUTH_COOKIE_TTL_SECONDS = 10 * 60;

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  appUrl: URL;
  redirectUri: string;
};

export type GoogleProfile = {
  email: string;
  displayName: string;
  picture: string | null;
};

export function isGoogleOAuthEnabled() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.APP_URL,
  );
}

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrlValue = process.env.APP_URL;

  if (!clientId || !clientSecret || !appUrlValue) {
    throw new Error("Google OAuth requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and APP_URL");
  }

  const appUrl = new URL(appUrlValue);
  if (!/^https?:$/.test(appUrl.protocol) || appUrl.username || appUrl.password) {
    throw new Error("APP_URL must be an absolute HTTP(S) URL without credentials");
  }

  appUrl.pathname = "/";
  appUrl.search = "";
  appUrl.hash = "";

  return {
    clientId,
    clientSecret,
    appUrl,
    redirectUri: new URL("/api/auth/google/callback", appUrl).toString(),
  };
}

export function createOAuthSecret() {
  return randomBytes(32).toString("base64url");
}

export function createCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function isTransientDnsError(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: string; cause?: unknown };
    if (candidate.code === "EAI_AGAIN" || candidate.code === "ENOTFOUND") return true;
    current = candidate.cause;
  }
  return false;
}

async function withGoogleDnsRetry<T>(operation: () => Promise<T>) {
  for (let attempt = 1; attempt <= GOOGLE_DNS_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientDnsError(error) || attempt === GOOGLE_DNS_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, GOOGLE_DNS_RETRY_MS));
    }
  }
  throw new Error("Google request retry exhausted");
}

export function buildGoogleAuthorizationUrl(
  config: Pick<GoogleOAuthConfig, "clientId" | "redirectUri">,
  state: string,
  codeChallenge: string,
) {
  const url = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url;
}

export async function exchangeGoogleCode(
  config: GoogleOAuthConfig,
  code: string,
  codeVerifier: string,
) {
  const response = await withGoogleDnsRetry(() => fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      code_verifier: codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  }));

  const payload = await response.json().catch(() => null) as { id_token?: unknown } | null;
  if (!response.ok || typeof payload?.id_token !== "string") {
    throw new Error("Google token exchange failed");
  }
  return payload.id_token;
}

export async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<GoogleProfile> {
  const { payload } = await withGoogleDnsRetry(() => jwtVerify(idToken, GOOGLE_JWKS, {
    audience: clientId,
    issuer: ["https://accounts.google.com", "accounts.google.com"],
  }));

  if (typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new Error("Google account does not provide a verified email");
  }

  const email = payload.email.toLowerCase();
  const fallbackName = email.split("@")[0] || "Пользователь";
  const displayName = typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim().slice(0, 80)
    : fallbackName.slice(0, 80);

  return {
    email,
    displayName,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
