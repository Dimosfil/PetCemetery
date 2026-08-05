import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "./config.js";
import { ProceduralReconstructionProvider } from "./pipeline/procedural-reconstruction-provider.js";

const config = loadConfig();
const sampleRoot = path.join(config.rootDir, "artifacts", "sample");
const inputDir = path.join(sampleRoot, "input");
const outputDir = path.join(sampleRoot, "output");

await rm(sampleRoot, { recursive: true, force: true });
await mkdir(inputDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const left = path.join(inputDir, "dog-left.png");
const right = path.join(inputDir, "dog-right.png");
await writeFile(left, Buffer.from("prototype-left-photo"));
await writeFile(right, Buffer.from("prototype-right-photo"));

const provider = new ProceduralReconstructionProvider();
const result = await provider.reconstruct({
  jobId: "sample-verification",
  photoPaths: [left, right],
  outputDir,
  coatColor: "#8b5d42",
  updateProgress: async (status, progress, message) => {
    console.log(`${String(progress).padStart(3, " ")}% ${status}: ${message}`);
  },
});

console.log(`Sample GLB: ${path.join(outputDir, "pet.glb")}`);
console.log(`Sample ZIP: ${result.artifactPath}`);
