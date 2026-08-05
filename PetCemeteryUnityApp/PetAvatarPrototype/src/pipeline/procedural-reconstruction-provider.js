import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRgbaPng, createSolidPng } from "../lib/png.js";
import { createZip } from "../lib/zip.js";
import { ReconstructionProvider } from "./reconstruction-provider.js";
import { buildRiggedDogGlb } from "./glb-builder.js";

function normalizeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value.toLowerCase() : "#9a6846";
}

function rgbFromHex(value) {
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function deriveShape(digest) {
  const sample = (index, low, high) => low + (digest[index] / 255) * (high - low);
  return {
    bodyWidth: sample(0, 0.86, 1.14),
    bodyHeight: sample(1, 0.9, 1.12),
    bodyLength: sample(2, 0.9, 1.12),
    headScale: sample(3, 0.88, 1.15),
    legScale: sample(4, 0.88, 1.12),
    earScale: sample(5, 0.78, 1.25),
    tailScale: sample(6, 0.82, 1.18),
  };
}

function createPreview(color) {
  const width = 512;
  const height = 512;
  const coat = rgbFromHex(color);
  const isEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2) <= 1;
  return createRgbaPng(width, height, (x, y) => {
    const background = Math.round(248 - (y / height) * 18);
    let pixel = [background, background + 2, Math.min(255, background + 5), 255];
    const body = isEllipse(x, y, 255, 285, 145, 92);
    const head = isEllipse(x, y, 360, 210, 72, 72);
    const muzzle = isEllipse(x, y, 420, 232, 48, 32);
    const earLeft = x > 318 && x < 346 && y > 118 && y < 185;
    const earRight = x > 374 && x < 403 && y > 115 && y < 185;
    const leg = ((x > 150 && x < 188) || (x > 225 && x < 263) || (x > 300 && x < 338)) && y > 320 && y < 438;
    const tail = x > 82 && x < 155 && y > 236 + (x - 82) * 0.45 && y < 258 + (x - 82) * 0.45;
    if (body || head || muzzle || earLeft || earRight || leg || tail) pixel = [...coat, 255];
    if (isEllipse(x, y, 388, 202, 8, 8)) pixel = [25, 27, 30, 255];
    if (isEllipse(x, y, 455, 230, 10, 8)) pixel = [35, 30, 29, 255];
    return pixel;
  });
}

export class ProceduralReconstructionProvider extends ReconstructionProvider {
  get name() {
    return "procedural-prototype";
  }

  async reconstruct({ jobId, photoPaths, outputDir, coatColor, updateProgress, signal }) {
    if (signal?.aborted) throw signal.reason;
    await mkdir(path.join(outputDir, "textures"), { recursive: true });
    const digest = createHash("sha256");
    for (const photoPath of photoPaths) digest.update(await readFile(photoPath));
    const shape = deriveShape(digest.digest());
    const color = normalizeColor(coatColor);

    await updateProgress("reconstructing", 42, "Подгоняем форму и достраиваем недостающие ракурсы");
    const glb = buildRiggedDogGlb({ coatColor: color, shape });
    if (signal?.aborted) throw signal.reason;

    await updateProgress("rigging", 66, "Проверяем скелет и skin weights");
    const [red, green, blue] = rgbFromHex(color);
    const albedo = createSolidPng(64, 64, [red, green, blue]);
    const normal = createSolidPng(64, 64, [128, 128, 255]);
    const furMask = createSolidPng(64, 64, [72, 72, 72]);
    const preview = createPreview(color);

    const avatar = {
      schemaVersion: 1,
      avatarVersion: 1,
      jobId,
      species: "dog",
      provider: this.name,
      aiReconstruction: false,
      limitations: [
        "Procedural integration provider; not a photorealistic reconstruction model.",
        "Photos affect coat color in Web UI and deterministic prototype proportions.",
      ],
      sourcePhotoCount: photoPaths.length,
      coatColor: color,
      shape,
      generatedCoverage: 1,
      skeleton: "prototype-dog-v1",
      modelFile: "pet.glb",
      previewFile: "preview.png",
      ...glb.stats,
      createdAt: new Date().toISOString(),
    };
    const avatarJson = Buffer.from(`${JSON.stringify(avatar, null, 2)}\n`, "utf8");
    const packageReadme = Buffer.from(
      "# Pet Avatar Package\n\n" +
      "Это пакет интеграционного прототипа. Файл `pet.glb` содержит mesh, скелет, skin weights и тестовую анимацию.\n\n" +
      "Текущий provider создаёт процедурную собаку и проверяет весь путь от Web UI до Unity. Он не является production AI-реконструкцией внешности.\n",
      "utf8",
    );

    const files = [
      { name: "pet.glb", data: glb.buffer },
      { name: "textures/albedo.png", data: albedo },
      { name: "textures/normal.png", data: normal },
      { name: "textures/fur-mask.png", data: furMask },
      { name: "avatar.json", data: avatarJson },
      { name: "preview.png", data: preview },
      { name: "README.md", data: packageReadme },
    ];

    await updateProgress("packaging", 84, "Формируем переносимый пакет для Unity");
    for (const file of files) {
      await writeFile(path.join(outputDir, ...file.name.split("/")), file.data);
    }
    const zip = createZip(files);
    const artifactPath = path.join(outputDir, "pet-avatar.zip");
    await writeFile(artifactPath, zip);

    return { artifactPath, previewPath: path.join(outputDir, "preview.png"), avatar, files };
  }
}
