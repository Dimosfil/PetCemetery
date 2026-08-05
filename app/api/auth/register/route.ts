import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { setSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { registerSchema, validationMessage } from "@/lib/validation";

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  const { email, password, displayName, city } = parsed.data;
  const passwordHash = await hash(password, 12);

  try {
    const result = await query<{ id: string; email: string; display_name: string }>(
      `INSERT INTO users (email, password_hash, display_name, city)
       VALUES ($1,$2,$3,NULLIF($4, '')) RETURNING id, email::text, display_name`,
      [email.toLowerCase(), passwordHash, displayName, city],
    );
    const row = result.rows[0];
    await setSession({ id: row.id, email: row.email, displayName: row.display_name, city: city || null });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Пользователь с таким email уже существует" }, { status: 409 });
    }
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Не удалось создать аккаунт" }, { status: 500 });
  }
}
