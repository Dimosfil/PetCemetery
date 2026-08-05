import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { friendRequestSchema, validationMessage } from "@/lib/validation";

type FriendshipRow = {
  id: string;
  status: "pending" | "accepted";
};

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });

  const parsed = friendRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: validationMessage(parsed.error) }, { status: 400 });
  }
  if (parsed.data.userId === user.id) {
    return NextResponse.json({ error: "Нельзя добавить в друзья самого себя" }, { status: 400 });
  }

  const created = await query<FriendshipRow>(
    `INSERT INTO friendships (requester_id, addressee_id)
     SELECT $1, id FROM users WHERE id = $2
     ON CONFLICT DO NOTHING
     RETURNING id, status`,
    [user.id, parsed.data.userId],
  );
  if (created.rows[0]) {
    return NextResponse.json(created.rows[0], { status: 201 });
  }

  const existing = await query<FriendshipRow>(
    `SELECT id, status FROM friendships
     WHERE (requester_id = $1 AND addressee_id = $2)
        OR (requester_id = $2 AND addressee_id = $1)`,
    [user.id, parsed.data.userId],
  );
  if (existing.rows[0]) {
    return NextResponse.json({ error: "Запрос или дружба уже существует" }, { status: 409 });
  }
  return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
}
