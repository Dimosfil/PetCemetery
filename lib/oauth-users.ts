import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { query } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import type { GoogleProfile } from "@/lib/google-oauth";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  city: string | null;
};

function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, email: row.email, displayName: row.display_name, city: row.city };
}

export async function findOrCreateGoogleUser(profile: GoogleProfile): Promise<SessionUser> {
  const existing = await query<UserRow>(
    "SELECT id, email::text, display_name, city FROM users WHERE email = $1",
    [profile.email],
  );
  if (existing.rows[0]) return toSessionUser(existing.rows[0]);

  // Password login remains unavailable until the user explicitly creates a known password.
  const unusablePasswordHash = await hash(randomBytes(32).toString("base64url"), 12);

  try {
    const created = await query<UserRow>(
      `INSERT INTO users (email, password_hash, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email::text, display_name, city`,
      [profile.email, unusablePasswordHash, profile.displayName, profile.picture],
    );
    return toSessionUser(created.rows[0]);
  } catch (error) {
    if ((error as { code?: string }).code !== "23505") throw error;
    const concurrent = await query<UserRow>(
      "SELECT id, email::text, display_name, city FROM users WHERE email = $1",
      [profile.email],
    );
    if (!concurrent.rows[0]) throw error;
    return toSessionUser(concurrent.rows[0]);
  }
}
