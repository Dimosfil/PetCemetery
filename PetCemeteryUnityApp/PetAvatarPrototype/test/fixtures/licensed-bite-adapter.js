import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSolidPng } from "../../src/lib/png.js";
import { buildRiggedDogGlb } from "../../src/pipeline/glb-builder.js";

const requestFlag = process.argv.indexOf("--request");
if (requestFlag < 0 || !process.argv[requestFlag + 1]) throw new Error("--request is required");
const request = JSON.parse(await readFile(process.argv[requestFlag + 1], "utf8"));
const outputDir = request.outputDirectory;
const glb = buildRiggedDogGlb({ coatColor: "#f4f2ed" });
const preview = createSolidPng(32, 32, [244, 242, 237]);
const avatar = {
  schemaVersion: 1,
  avatarVersion: 2,
  species: "dog",
  provider: "bite-d-smal",
  aiReconstruction: true,
  uvMapped: true,
  sourcePhotoCount: request.photos.length,
  geometryConfidence: 0.81,
  textureConfidence: 0.73,
  modelFile: "pet.glb",
  previewFile: "preview.png",
  topology: "dog-parametric-test-v1",
  skeleton: "dog-parametric-test-rig-v1",
  ...glb.stats,
};

await writeFile(path.join(outputDir, "pet.glb"), glb.buffer);
await writeFile(path.join(outputDir, "preview.png"), preview);
await writeFile(path.join(outputDir, "avatar.json"), `${JSON.stringify(avatar, null, 2)}\n`, "utf8");
await mkdir(path.join(outputDir, "textures"), { recursive: true });
await writeFile(path.join(outputDir, "textures", "albedo.png"), preview);

// Keep this fixture self-contained; the production adapter is supplied with the licensed runtime.
if (path.basename(fileURLToPath(import.meta.url)) !== "licensed-bite-adapter.js") process.exitCode = 1;
