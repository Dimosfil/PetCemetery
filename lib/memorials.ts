import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { derivePublicLocation } from "@/lib/location";
import { slugify } from "@/lib/slug";
import type { z } from "zod";
import type { memorialSchema } from "@/lib/validation";

export type MemorialInput = z.infer<typeof memorialSchema>;

function emptyToNull(value: string | null | undefined) {
  return value ? value : null;
}

export async function insertMemorial(client: PoolClient, ownerId: string, input: MemorialInput) {
  const id = randomUUID();
  const slug = `${slugify(input.name)}-${id.slice(0, 8)}`;
  const latitude = input.locationMode === "hidden" ? null : input.latitude;
  const longitude = input.locationMode === "hidden" ? null : input.longitude;
  const publicLocation = derivePublicLocation(input.locationMode, latitude, longitude, id);

  await client.query(
    `INSERT INTO pet_memorials (
      id, owner_id, slug, name, species, breed, birth_date, passing_date, story,
      epitaph, avatar_url, visibility, location_mode, latitude, longitude,
      public_latitude, public_longitude, location_label
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [id, ownerId, slug, input.name, input.species, emptyToNull(input.breed),
      emptyToNull(input.birthDate), emptyToNull(input.passingDate), input.story,
      emptyToNull(input.epitaph), emptyToNull(input.avatarUrl), input.visibility,
      input.locationMode, latitude, longitude, publicLocation.publicLatitude,
      publicLocation.publicLongitude, emptyToNull(input.locationLabel)],
  );

  await upsertCeremony(client, id, input);
  return { id, slug };
}

export async function updateMemorial(
  client: PoolClient,
  memorialId: string,
  ownerId: string,
  input: MemorialInput,
) {
  const latitude = input.locationMode === "hidden" ? null : input.latitude;
  const longitude = input.locationMode === "hidden" ? null : input.longitude;
  const publicLocation = derivePublicLocation(input.locationMode, latitude, longitude, memorialId);
  const result = await client.query(
    `UPDATE pet_memorials SET
      name=$3, species=$4, breed=$5, birth_date=$6, passing_date=$7, story=$8,
      epitaph=$9, avatar_url=$10, visibility=$11, location_mode=$12, latitude=$13,
      longitude=$14, public_latitude=$15, public_longitude=$16, location_label=$17,
      updated_at=now()
     WHERE id=$1 AND owner_id=$2 RETURNING slug`,
    [memorialId, ownerId, input.name, input.species, emptyToNull(input.breed),
      emptyToNull(input.birthDate), emptyToNull(input.passingDate), input.story,
      emptyToNull(input.epitaph), emptyToNull(input.avatarUrl), input.visibility,
      input.locationMode, latitude, longitude, publicLocation.publicLatitude,
      publicLocation.publicLongitude, emptyToNull(input.locationLabel)],
  );

  if (!result.rowCount) return null;
  await upsertCeremony(client, memorialId, input);
  return { slug: result.rows[0].slug as string };
}

async function upsertCeremony(client: PoolClient, memorialId: string, input: MemorialInput) {
  if (!input.ceremonyTitle && !input.ceremonyMessage && !input.ceremonyStartsAt) {
    await client.query("DELETE FROM ceremonies WHERE memorial_id=$1", [memorialId]);
    return;
  }

  await client.query(
    `INSERT INTO ceremonies (memorial_id, title, farewell_message, starts_at)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (memorial_id) DO UPDATE SET
       title=excluded.title, farewell_message=excluded.farewell_message,
       starts_at=excluded.starts_at, updated_at=now()`,
    [memorialId, input.ceremonyTitle || "Церемония памяти", input.ceremonyMessage,
      emptyToNull(input.ceremonyStartsAt)],
  );
}
