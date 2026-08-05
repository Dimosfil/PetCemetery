import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { BiteDSmalProvider } from "../src/pipeline/bite-d-smal-provider.js";
import { createConfiguredProvider } from "../src/pipeline/provider-factory.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureAdapter = path.join(testDir, "fixtures", "licensed-bite-adapter.js");

test("keeps the procedural provider as the default", () => {
  const provider = createConfiguredProvider({ provider: "procedural-prototype" });
  assert.equal(provider.name, "procedural-prototype");
});

test("refuses to enable BITE/D-SMAL without an explicit license mode", () => {
  assert.throws(
    () => new BiteDSmalProvider({ executable: process.execPath, adapter: fixtureAdapter, licenseMode: "" }),
    /research or commercial/,
  );
});

test("runs a licensed external dog provider and validates the Unity artifact contract", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pet-avatar-bite-test-"));
  const inputPath = path.join(temporaryRoot, "dog.png");
  const outputDir = path.join(temporaryRoot, "output");
  await writeFile(inputPath, Buffer.from([137, 80, 78, 71, 1, 2, 3]));
  await mkdir(outputDir, { recursive: true });
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const provider = new BiteDSmalProvider({
    executable: process.execPath,
    adapter: fixtureAdapter,
    licenseMode: "research",
    timeoutMs: 10_000,
  });
  const progress = [];
  const result = await provider.reconstruct({
    jobId: "licensed-test-job",
    photoPaths: [inputPath],
    outputDir,
    updateProgress: async (status) => progress.push(status),
  });

  assert.equal(result.avatar.provider, "bite-d-smal");
  assert.equal(result.avatar.uvMapped, true);
  assert.ok(result.files.some((file) => file.name === "pet.glb"));
  assert.ok(result.files.some((file) => file.name === "avatar.json"));
  assert.ok(progress.includes("validating"));
  const zip = await readFile(result.artifactPath);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
});
