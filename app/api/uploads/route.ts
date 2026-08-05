import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { detectSupportedImage } from "@/lib/image-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await requireApiUser();
  if (!user) return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Выберите изображение" }, { status: 400 });
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return NextResponse.json({ error: "Разрешены JPEG, PNG и WebP" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "Максимальный размер файла — 5 МБ" }, { status: 400 });
  }

  const contents = new Uint8Array(await file.arrayBuffer());
  const detected = detectSupportedImage(contents);
  if (!detected || detected.mimeType !== file.type) {
    return NextResponse.json({ error: "Содержимое файла не соответствует изображению JPEG, PNG или WebP" }, { status: 400 });
  }

  const uploadDir = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./data/uploads");
  await mkdir(uploadDir, { recursive: true });
  const filename = `${randomUUID()}${detected.extension}`;
  await writeFile(
    path.join(/* turbopackIgnore: true */ uploadDir, filename),
    contents,
    { flag: "wx" },
  );
  return NextResponse.json({ url: `/api/uploads/${filename}` }, { status: 201 });
}
