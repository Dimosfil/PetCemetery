import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSolidPng } from "../src/lib/png.js";
import { buildRiggedDogGlb } from "../src/pipeline/glb-builder.js";
import { CanonicalSf3dProvider } from "../src/pipeline/canonical-sf3d-provider.js";
import { createConfiguredProvider } from "../src/pipeline/provider-factory.js";

function withEmbeddedTexture(source) {
  const sourceJsonLength = source.readUInt32LE(12);
  const sourceBinaryHeaderOffset = 20 + sourceJsonLength;
  const binaryLength = source.readUInt32LE(sourceBinaryHeaderOffset);
  const binary = source.subarray(sourceBinaryHeaderOffset + 8, sourceBinaryHeaderOffset + 8 + binaryLength);
  const gltf = JSON.parse(source.subarray(20, 20 + sourceJsonLength).toString("utf8").trim());
  gltf.images = [{ uri: `data:image/png;base64,${createSolidPng(2, 2, [150, 100, 70]).toString("base64")}` }];
  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  const padding = (4 - (json.length % 4)) % 4;
  if (padding) json = Buffer.concat([json, Buffer.alloc(padding, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + binary.length, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(json.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8);
  binaryHeader.writeUInt32LE(binary.length, 0);
  binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, json, binaryHeader, binary]);
}

function binaryResponse(data, contentType) {
  return new Response(data, { status: 200, headers: { "content-type": contentType } });
}

test("requires explicit remote-photo consent and an SF3D license mode", () => {
  assert.throws(() => new CanonicalSf3dProvider({
    sf3dUrl: "https://sf3d.example/generate",
    allowRemote: false,
    licenseMode: "research",
    fetchImpl: () => {},
    renderPreview: () => {},
  }), /ALLOW_REMOTE=true/);
  assert.throws(() => new CanonicalSf3dProvider({
    sf3dUrl: "https://sf3d.example/generate",
    allowRemote: true,
    licenseMode: "",
    fetchImpl: () => {},
    renderPreview: () => {},
  }), /license mode/);
});

test("factory creates the configurable canonical-sf3d profile", () => {
  const provider = createConfiguredProvider({
    provider: "canonical-sf3d",
    canonicalSf3d: {
      sf3dUrl: "https://sf3d.example/generate",
      allowRemote: true,
      licenseMode: "research",
    },
  });
  assert.equal(provider.name, "canonical-sf3d");
});

test("canonicalizes multiple photos, validates textured GLB, and packages a static artifact", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pet-avatar-sf3d-test-"));
  const outputDir = path.join(temporaryRoot, "output");
  const first = path.join(temporaryRoot, "front.png");
  const second = path.join(temporaryRoot, "side.jpg");
  await mkdir(outputDir, { recursive: true });
  await writeFile(first, createSolidPng(4, 4, [120, 80, 50]));
  await writeFile(second, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const canonical = createSolidPng(8, 8, [150, 100, 70]);
  const glb = withEmbeddedTexture(buildRiggedDogGlb().buffer);
  const requests = [];
  const provider = new CanonicalSf3dProvider({
    canonicalizerUrl: "https://canonicalizer.example/generate",
    canonicalizerAuthorization: "Bearer canonical-secret",
    sf3dUrl: "https://sf3d.example/generate",
    sf3dAuthorization: "Bearer sf3d-secret",
    allowRemote: true,
    licenseMode: "research",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return url.startsWith("https://canonicalizer.example/")
        ? binaryResponse(canonical, "image/png")
        : binaryResponse(glb, "model/gltf-binary");
    },
    renderPreview: async ({ previewPath }) => writeFile(previewPath, createSolidPng(16, 16, [150, 100, 70])),
  });
  const progress = [];
  const result = await provider.reconstruct({
    photoPaths: [first, second],
    outputDir,
    updateProgress: async (status) => progress.push(status),
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.headers.Authorization, "Bearer canonical-secret");
  assert.equal(requests[1].options.headers.Authorization, "Bearer sf3d-secret");
  assert.equal(requests[0].options.body.getAll("photos").length, 2);
  assert.ok(requests[0].options.body.get("spec"));
  assert.ok(requests[1].options.body.get("image") instanceof Blob);
  assert.equal(result.avatar.provider, "canonical-sf3d");
  assert.equal(result.avatar.staticMesh, true);
  assert.equal(result.avatar.rigged, false);
  assert.equal(result.avatar.uvMapped, true);
  assert.equal(result.avatar.sourcePhotoCount, 2);
  assert.equal(result.avatar.canonicalizationMode, "remote");
  assert.deepEqual(result.files.map((file) => file.name), ["pet.glb", "preview.png", "avatar.json", "README.md"]);
  assert.ok(progress.includes("canonicalizing"));
  assert.ok(progress.includes("packaging"));
  const zip = await readFile(result.artifactPath);
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.includes(Buffer.from("canonical-reference")), false);
});

test("uses one prepared canonical image without calling a canonicalizer", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pet-avatar-sf3d-pass-test-"));
  const outputDir = path.join(temporaryRoot, "output");
  const input = path.join(temporaryRoot, "canonical.png");
  await mkdir(outputDir, { recursive: true });
  await writeFile(input, createSolidPng(4, 4, [100, 80, 60]));
  context.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  let calls = 0;
  const provider = new CanonicalSf3dProvider({
    sf3dUrl: "https://sf3d.example/generate",
    allowRemote: true,
    licenseMode: "community",
    fetchImpl: async () => {
      calls += 1;
      return binaryResponse(withEmbeddedTexture(buildRiggedDogGlb().buffer), "model/gltf-binary");
    },
    renderPreview: async ({ previewPath }) => writeFile(previewPath, createSolidPng(8, 8, [100, 80, 60])),
  });
  const result = await provider.reconstruct({
    photoPaths: [input],
    outputDir,
    updateProgress: async () => {},
  });
  assert.equal(calls, 1);
  assert.equal(result.avatar.canonicalizationMode, "passthrough");
});
