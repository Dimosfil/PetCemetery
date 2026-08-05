import Link from "next/link";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type MemorialCard = {
  slug: string;
  name: string;
  species: string;
  epitaph: string | null;
  avatar_url: string | null;
  passing_date: string | null;
};

export default async function HomePage() {
  const result = await query<MemorialCard>(
    `SELECT slug, name, species, epitaph, avatar_url, passing_date::text
     FROM pet_memorials WHERE visibility='public'
     ORDER BY created_at DESC LIMIT 6`,
  );

  return (
    <>
      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Бережное пространство памяти</p>
            <h1>Любовь не заканчивается прощанием</h1>
            <p className="hero-lead">
              Создайте страницу памяти о питомце, сохраните его историю и разделите
              тёплые воспоминания с теми, кто понимает.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/register">Создать мемориал</Link>
              <Link className="button button-ghost" href="/map">Открыть карту памяти</Link>
            </div>
          </div>
          <div className="hero-art" aria-label="Символическое созвездие памяти">
            <span className="orbit orbit-one" />
            <span className="orbit orbit-two" />
            <div className="memory-stone">
              <span className="paw" aria-hidden="true">♡</span>
              <strong>Навсегда<br />в сердце</strong>
            </div>
            <span className="spark spark-one">✦</span>
            <span className="spark spark-two">✧</span>
            <span className="spark spark-three">✦</span>
          </div>
        </div>
      </section>

      <section className="section shell">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Недавние истории</p>
            <h2>Их помнят и любят</h2>
          </div>
          <Link className="text-link" href="/map">Смотреть на карте →</Link>
        </div>
        {result.rows.length ? (
          <div className="card-grid">
            {result.rows.map((pet) => (
              <Link className="memorial-card" href={`/memorials/${pet.slug}`} key={pet.slug}>
                <div className="card-photo">
                  {pet.avatar_url ? (
                    <img src={pet.avatar_url} alt={`Фотография ${pet.name}`} />
                  ) : <span aria-hidden="true">♡</span>}
                </div>
                <div className="card-body">
                  <span className="card-type">{pet.species}</span>
                  <h3>{pet.name}</h3>
                  <p>{pet.epitaph || "Светлая память и бесконечная любовь."}</p>
                  {pet.passing_date && <time>{new Date(pet.passing_date).getFullYear()}</time>}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span aria-hidden="true">✦</span>
            <h3>Здесь появятся первые истории</h3>
            <p>Создайте пространство памяти для питомца, которого всегда будете любить.</p>
            <Link className="button button-small" href="/register">Начать</Link>
          </div>
        )}
      </section>

      <section className="values-section">
        <div className="shell values-grid">
          <article><span>01</span><h3>Сохраните историю</h3><p>Фотографии, важные даты и слова, которые хочется помнить.</p></article>
          <article><span>02</span><h3>Выберите место</h3><p>Настоящая, приблизительная или символическая точка — решаете только вы.</p></article>
          <article><span>03</span><h3>Разделите память</h3><p>Свечи, цветы и добрые слова от близких и сообщества.</p></article>
        </div>
      </section>
    </>
  );
}
