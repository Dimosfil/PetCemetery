import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { profileSchema, validationMessage } from "@/lib/validation";

export async function PATCH(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  const result = await query<{ city: string | null }>(
    "UPDATE users SET city=NULLIF($2, ''), updated_at=now() WHERE id=$1 RETURNING city",
    [user.id, parsed.data.city],
  );
  return NextResponse.json({ city: result.rows[0]?.city ?? null });
}
