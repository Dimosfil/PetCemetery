import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { transaction } from "@/lib/db";
import { insertMemorial } from "@/lib/memorials";
import { memorialSchema, validationMessage } from "@/lib/validation";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });

  const parsed = memorialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  const memorial = await transaction((client) => insertMemorial(client, user.id, parsed.data));
  return NextResponse.json(memorial, { status: 201 });
}
