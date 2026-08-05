import { notFound } from "next/navigation";
import { MemorialForm, type MemorialFormData } from "@/components/MemorialForm";
import { DeleteMemorialButton } from "@/components/DeleteMemorialButton";
import { requireUser } from "@/lib/auth";
import { query } from "@/lib/db";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
type Row = {
  id: string; name: string; species: string; breed: string | null; birth_date: string | null;
  passing_date: string | null; story: string; epitaph: string | null; avatar_url: string | null;
  visibility: MemorialFormData["visibility"]; location_mode: MemorialFormData["locationMode"];
  latitude: number | null; longitude: number | null; location_label: string | null;
  ceremony_title: string | null; ceremony_message: string | null; ceremony_starts_at: string | null;
};

export default async function EditMemorialPage({ params }: Context) {
  const user = await requireUser();
  const { id } = await params;
  const result = await query<Row>(
    `SELECT p.id, p.name, p.species, p.breed, p.birth_date::text, p.passing_date::text,
      p.story, p.epitaph, p.avatar_url, p.visibility, p.location_mode, p.latitude,
      p.longitude, p.location_label, c.title ceremony_title, c.farewell_message ceremony_message,
      to_char(c.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI') ceremony_starts_at
     FROM pet_memorials p LEFT JOIN ceremonies c ON c.memorial_id=p.id
     WHERE p.id=$1 AND p.owner_id=$2`,
    [id, user.id],
  );
  const row = result.rows[0];
  if (!row) notFound();
  const initial: MemorialFormData = {
    id: row.id, name: row.name, species: row.species, breed: row.breed || "",
    birthDate: row.birth_date || "", passingDate: row.passing_date || "", story: row.story,
    epitaph: row.epitaph || "", avatarUrl: row.avatar_url || "", visibility: row.visibility,
    locationMode: row.location_mode, latitude: row.latitude, longitude: row.longitude,
    locationLabel: row.location_label || "", ceremonyTitle: row.ceremony_title || "",
    ceremonyMessage: row.ceremony_message || "", ceremonyStartsAt: row.ceremony_starts_at || "",
  };
  return <section className="section shell form-page"><p className="eyebrow">Редактирование</p><h1>{row.name}</h1><MemorialForm initial={initial} /><DeleteMemorialButton memorialId={row.id} petName={row.name} /></section>;
}
