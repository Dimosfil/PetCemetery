import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Context = { params: Promise<{ name: string }> };

const types: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(_request: Request, context: Context) {
  const { name } = await context.params;
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(name)) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
  const uploadDir = path.resolve(/* turbopackIgnore: true */ process.env.UPLOAD_DIR || "./data/uploads");
  try {
    const data = await readFile(path.join(/* turbopackIgnore: true */ uploadDir, name));
    return new NextResponse(data, {
      headers: {
        "Content-Type": types[path.extname(name)] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
}
