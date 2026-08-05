import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { reportSchema, validationMessage } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Войдите, чтобы отправить жалобу" }, { status: 401 });
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }
  await query(
    "INSERT INTO reports (memorial_id, reporter_id, reason) VALUES ($1,$2,$3)",
    [parsed.data.memorialId, user.id, parsed.data.reason],
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}
