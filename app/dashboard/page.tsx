import Link from "next/link";
import Image from "next/image";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { OwnerCityForm } from "@/components/OwnerCityForm";

export const dynamic = "force-dynamic";

type Row = { id: string; slug: string; name: string; species: string; avatar_url: string | null; visibility: string; updated_at: Date };

export default async function DashboardPage() {
  const user = await requireUser();
  const result = await query<Row>(
    "SELECT id, slug, name, species, avatar_url, visibility, updated_at FROM pet_memorials WHERE owner_id=$1 ORDER BY updated_at DESC",
    [user.id],
  );
  return (
    <section className="section shell dashboard-page">
      <div className="section-heading">
        <div><p className="eyebrow">Личное пространство</p><h1>{user.displayName}, ваши мемориалы</h1></div>
        <div className="dashboard-heading-actions">
          <Link className="button button-ghost" href="/friends">Найти друзей</Link>
          <Link className="button" href="/memorials/new">Создать мемориал</Link>
        </div>
      </div>
      <OwnerCityForm initialCity={user.city || ""} />
      {result.rows.length ? (
        <div className="dashboard-list">
          {result.rows.map((pet) => (
            <article className="dashboard-item" key={pet.id}>
              <div className="dashboard-thumb">{pet.avatar_url ? <Image src={pet.avatar_url} alt="" width={90} height={90} unoptimized /> : "♡"}</div>
              <div><span className="card-type">{pet.species}</span><h2>{pet.name}</h2><p>{pet.visibility === "public" ? "Публичный" : pet.visibility === "unlisted" ? "По ссылке" : "Приватный"}</p></div>
              <div className="dashboard-actions"><Link className="text-link" href={`/memorials/${pet.slug}`}>Открыть</Link><Link className="button button-small button-ghost" href={`/dashboard/memorials/${pet.id}/edit`}>Редактировать</Link></div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state"><span>♡</span><h2>У вас пока нет мемориалов</h2><p>Создайте первую страницу памяти.</p><Link className="button button-small" href="/memorials/new">Создать</Link></div>
      )}
    </section>
  );
}
