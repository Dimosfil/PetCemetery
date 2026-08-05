import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query, transaction } from "@/lib/db";
import { updateMemorial } from "@/lib/memorials";
import { memorialSchema, validationMessage } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });

  const parsed = memorialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  const { id } = await context.params;
  const memorial = await transaction((client) => updateMemorial(client, id, user.id, parsed.data));
  if (!memorial) return NextResponse.json({ error: "Мемориал не найден" }, { status: 404 });
  return NextResponse.json(memorial);
}

export async function DELETE(_request: Request, context: Context) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
  const { id } = await context.params;
  const result = await query("DELETE FROM pet_memorials WHERE id=$1 AND owner_id=$2", [id, user.id]);
  if (!result.rowCount) return NextResponse.json({ error: "Мемориал не найден" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
