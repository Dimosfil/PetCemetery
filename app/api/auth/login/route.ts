import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { loginSchema, validationMessage } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  const result = await query<{ id: string; email: string; display_name: string; city: string | null; password_hash: string }>(
    "SELECT id, email::text, display_name, city, password_hash FROM users WHERE email=$1",
    [parsed.data.email.toLowerCase()],
  );
  const row = result.rows[0];

  if (!row || !(await compare(parsed.data.password, row.password_hash))) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  await setSession({ id: row.id, email: row.email, displayName: row.display_name, city: row.city });
  return NextResponse.json({ ok: true });
}
