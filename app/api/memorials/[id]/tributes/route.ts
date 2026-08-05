import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { tributeSchema, validationMessage } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const user = await getCurrentUser();
  const parsed = tributeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }
  if (!user && parsed.data.guestName.length < 2) {
    return NextResponse.json({ error: "Укажите ваше имя" }, { status: 400 });
  }

  const { id } = await context.params;
  const exists = await query("SELECT 1 FROM pet_memorials WHERE id=$1 AND visibility <> 'private'", [id]);
  if (!exists.rowCount) return NextResponse.json({ error: "Мемориал не найден" }, { status: 404 });

  await query(
    `INSERT INTO tributes (memorial_id, author_id, guest_name, kind, message)
     VALUES ($1,$2,$3,$4,$5)`,
    [id, user?.id ?? null, user ? null : parsed.data.guestName,
      parsed.data.kind, parsed.data.message || null],
  );
  return NextResponse.json({ ok: true }, { status: 201 });
}
