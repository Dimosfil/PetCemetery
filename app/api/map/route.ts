import { NextResponse } from "next/server";
import { query } from "@/lib/db";

type MapRow = {
  slug: string;
  name: string;
  species: string;
  avatar_url: string | null;
  public_latitude: number;
  public_longitude: number;
  location_label: string | null;
  location_mode: string;
};

export async function GET() {
  const result = await query<MapRow>(
    `SELECT slug, name, species, avatar_url, public_latitude, public_longitude,
            location_label, location_mode
     FROM pet_memorials
     WHERE visibility='public' AND public_latitude IS NOT NULL AND public_longitude IS NOT NULL
     ORDER BY created_at DESC LIMIT 2000`,
  );
  return NextResponse.json(result.rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    species: row.species,
    avatarUrl: row.avatar_url,
    latitude: row.public_latitude,
    longitude: row.public_longitude,
    locationLabel: row.location_label,
    locationMode: row.location_mode,
  })));
}
