import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { canSearchCity, normalizeCitySearch } from "@/lib/friends";
import { FriendsWorkspace, type FriendPerson } from "@/components/FriendsWorkspace";

export const dynamic = "force-dynamic";

type PersonRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  city: string;
  friendship_id: string | null;
  friendship_status: "pending" | "accepted" | null;
  requester_id: string | null;
};

function toPerson(row: PersonRow): FriendPerson {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    city: row.city,
    friendshipId: row.friendship_id,
    friendshipStatus: row.friendship_status,
    requesterId: row.requester_id,
  };
}

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ city?: string | string[] }> }) {
  const user = await requireUser();
  const rawCity = (await searchParams).city;
  const searchCity = normalizeCitySearch(rawCity);
  const searchAttempted = rawCity !== undefined;
  const searchValid = canSearchCity(searchCity);

  const [incomingResult, friendsResult, searchResult] = await Promise.all([
    query<PersonRow>(
      `SELECT u.id, u.display_name, u.avatar_url, COALESCE(u.city, '') AS city,
              f.id AS friendship_id, f.status AS friendship_status, f.requester_id
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [user.id],
    ),
    query<PersonRow>(
      `SELECT u.id, u.display_name, u.avatar_url, COALESCE(u.city, '') AS city,
              f.id AS friendship_id, f.status AS friendship_status, f.requester_id
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = $1 THEN f.addressee_id ELSE f.requester_id END
       WHERE (f.requester_id = $1 OR f.addressee_id = $1) AND f.status = 'accepted'
       ORDER BY u.display_name`,
      [user.id],
    ),
    searchValid
      ? query<PersonRow>(
          `SELECT u.id, u.display_name, u.avatar_url, u.city,
                  f.id AS friendship_id, f.status AS friendship_status, f.requester_id
           FROM users u
           LEFT JOIN friendships f
             ON (f.requester_id = $1 AND f.addressee_id = u.id)
             OR (f.addressee_id = $1 AND f.requester_id = u.id)
           WHERE u.id <> $1 AND u.city IS NOT NULL AND u.city ILIKE '%' || $2 || '%'
           ORDER BY (lower(u.city) = lower($2)) DESC, u.display_name
           LIMIT 50`,
          [user.id, searchCity],
        )
      : Promise.resolve({ rows: [] as PersonRow[] }),
  ]);

  return (
    <section className="section shell friends-page">
      <div className="friends-page-heading">
        <p className="eyebrow">Сообщество рядом</p>
        <h1>Друзья</h1>
        <p>Находите людей из своего города и поддерживайте друг друга бережно.</p>
      </div>
      <FriendsWorkspace
        currentUserId={user.id}
        currentUserCity={user.city || ""}
        searchCity={searchCity}
        searchAttempted={searchAttempted}
        searchValid={searchValid}
        searchResults={searchResult.rows.map(toPerson)}
        incomingRequests={incomingResult.rows.map(toPerson)}
        friends={friendsResult.rows.map(toPerson)}
      />
    </section>
  );
}
