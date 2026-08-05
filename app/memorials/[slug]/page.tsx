import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { TributeForm } from "@/components/TributeForm";
import { ReportButton } from "@/components/ReportButton";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ slug: string }> };
type Memorial = {
  id: string; owner_id: string; slug: string; name: string; species: string; breed: string | null;
  birth_date: string | null; passing_date: string | null; story: string; epitaph: string | null;
  avatar_url: string | null; visibility: string; location_mode: string; public_latitude: number | null;
  public_longitude: number | null; location_label: string | null; owner_name: string; owner_city: string | null;
  ceremony_title: string | null; ceremony_message: string | null; ceremony_starts_at: Date | null;
};
type Tribute = { id: string; kind: string; message: string | null; author_name: string; created_at: Date };

function formatDate(date: string | null) {
  return date ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(date)) : null;
}

export default async function MemorialPage({ params }: Context) {
  const user = await getCurrentUser();
  const { slug } = await params;
  const result = await query<Memorial>(
    `SELECT p.id, p.owner_id, p.slug, p.name, p.species, p.breed, p.birth_date::text,
      p.passing_date::text, p.story, p.epitaph, p.avatar_url, p.visibility,
      p.location_mode, p.public_latitude, p.public_longitude, p.location_label,
      u.display_name owner_name, u.city owner_city, c.title ceremony_title, c.farewell_message ceremony_message,
      c.starts_at ceremony_starts_at
     FROM pet_memorials p JOIN users u ON u.id=p.owner_id
     LEFT JOIN ceremonies c ON c.memorial_id=p.id WHERE p.slug=$1`,
    [slug],
  );
  const pet = result.rows[0];
  if (!pet || (pet.visibility === "private" && user?.id !== pet.owner_id)) notFound();
  const tributes = await query<Tribute>(
    `SELECT t.id, t.kind, t.message, COALESCE(u.display_name, t.guest_name, 'Гость') author_name,
      t.created_at FROM tributes t LEFT JOIN users u ON u.id=t.author_id
     WHERE t.memorial_id=$1 ORDER BY t.created_at DESC LIMIT 100`,
    [pet.id],
  );
  const owner = user?.id === pet.owner_id;
  const locationDescription = pet.location_mode === "symbolic" ? "Символическое место памяти" : pet.location_mode === "approximate" ? "Приблизительное место" : "Место памяти";

  return (
    <article className="memorial-page">
      <header className="memorial-hero">
        <div className="shell memorial-hero-grid">
          <div className="memorial-photo">
            {pet.avatar_url ? <Image src={pet.avatar_url} alt={`Фотография ${pet.name}`} width={640} height={640} unoptimized priority /> : <span>♡</span>}
          </div>
          <div className="memorial-title">
            <p className="eyebrow">{pet.species}{pet.breed ? ` · ${pet.breed}` : ""}</p>
            <h1>{pet.name}</h1>
            {(pet.birth_date || pet.passing_date) && <p className="life-dates">{formatDate(pet.birth_date) || "Дата рождения неизвестна"} — {formatDate(pet.passing_date) || ""}</p>}
            {pet.epitaph && <blockquote>«{pet.epitaph}»</blockquote>}
            <p className="owner-line">
              Историей поделился(ась) {pet.owner_name}
              {pet.owner_city && <> · живёт в г. {pet.owner_city}</>}
            </p>
            {owner && <Link className="button button-small button-ghost" href={`/dashboard/memorials/${pet.id}/edit`}>Редактировать</Link>}
          </div>
        </div>
      </header>

      <div className="shell memorial-content-grid">
        <div className="memorial-main">
          {pet.story && <section className="memorial-section"><p className="eyebrow">История</p><h2>О {pet.name}</h2><div className="story-text">{pet.story.split("\n").map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></section>}
          {pet.ceremony_title && <section className="ceremony-card"><span className="ceremony-icon">✦</span><div><p className="eyebrow">Церемония памяти</p><h2>{pet.ceremony_title}</h2>{pet.ceremony_starts_at && <time>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(new Date(pet.ceremony_starts_at))}</time>}<p>{pet.ceremony_message}</p><div className="ceremony-steps"><span>Вспомнить</span><i /><span>Зажечь свечу</span><i /><span>Оставить слова</span></div></div></section>}
          <section className="memorial-section"><p className="eyebrow">Поддержка</p><h2>Оставить знак памяти</h2><TributeForm memorialId={pet.id} authenticated={Boolean(user)} /></section>
          <section className="memorial-section"><div className="section-heading compact"><div><p className="eyebrow">Книга памяти</p><h2>Тёплые слова</h2></div><span>{tributes.rows.length}</span></div>
            {tributes.rows.length ? <div className="tribute-list">{tributes.rows.map((tribute) => <article key={tribute.id}><span className="tribute-icon">{tribute.kind === "candle" ? "🕯️" : tribute.kind === "flower" ? "🌿" : "♡"}</span><div><strong>{tribute.author_name}</strong>{tribute.message && <p>{tribute.message}</p>}<time>{new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(tribute.created_at))}</time></div></article>)}</div> : <p className="subtle">Пока здесь тихо. Вы можете оставить первый знак памяти.</p>}
          </section>
        </div>
        <aside className="memorial-aside">
          {pet.public_latitude !== null && pet.public_longitude !== null && <div className="aside-card"><span className="aside-icon">⌖</span><h3>{locationDescription}</h3><p>{pet.location_label || "Точка выбрана владельцем"}</p><Link className="text-link" href={`/map`}>Показать на общей карте →</Link></div>}
          <div className="aside-card privacy-card"><span className="aside-icon">◌</span><h3>Приватность</h3><p>{pet.visibility === "public" ? "Мемориал доступен всем." : "Мемориал доступен только по прямой ссылке."}</p></div>
          {!owner && <ReportButton memorialId={pet.id} authenticated={Boolean(user)} />}
        </aside>
      </div>
    </article>
  );
}
