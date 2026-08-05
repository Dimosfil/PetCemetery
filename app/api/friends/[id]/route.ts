import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { friendshipActionSchema, validationMessage } from "@/lib/validation";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });

  const { id } = await params;
  const parsed = friendshipActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }

  if (parsed.data.action === "accept") {
    const accepted = await query<{ id: string }>(
      `UPDATE friendships SET status = 'accepted', updated_at = now()
       WHERE id = $1 AND addressee_id = $2 AND status = 'pending'
       RETURNING id`,
      [id, user.id],
    );
    if (!accepted.rows[0]) {
      return NextResponse.json({ error: "Запрос не найден или уже обработан" }, { status: 404 });
    }
    return NextResponse.json({ id: accepted.rows[0].id, status: "accepted" });
  }

  const conditions = {
    decline: "addressee_id = $2 AND status = 'pending'",
    cancel: "requester_id = $2 AND status = 'pending'",
    remove: "(requester_id = $2 OR addressee_id = $2) AND status = 'accepted'",
  } as const;
  const removed = await query<{ id: string }>(
    `DELETE FROM friendships WHERE id = $1 AND ${conditions[parsed.data.action]} RETURNING id`,
    [id, user.id],
  );
  if (!removed.rows[0]) {
    return NextResponse.json({ error: "Связь не найдена или действие недоступно" }, { status: 404 });
  }
  return NextResponse.json({ id: removed.rows[0].id, status: "removed" });
}
