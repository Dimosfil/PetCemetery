import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { access, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createZip } from "../lib/zip.js";
import { parseGlbJson } from "./glb-builder.js";
import { ReconstructionProvider } from "./reconstruction-provider.js";

const REQUIRED_OUTPUTS = ["pet.glb", "preview.png", "avatar.json"];
const OPTIONAL_OUTPUTS = [
  "textures/albedo.png",
  "textures/normal.png",
  "textures/fur-mask.png",
  "confidence.png",
  "README.md",
];

function assertAbsoluteFile(value, label) {
  if (!value || !path.isAbsolute(value)) {
    throw new Error(`${label} must be an absolute file path`);
  }
  const details = statSync(value);
  if (!details.isFile()) throw new Error(`${label} must point to a file`);
  return value;
}

function collectProcessOutput(child, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      child.kill();
      finish(() => reject(signal.reason ?? new Error("BITE/D-SMAL inference was cancelled")));
    };
    const timeout = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error(`BITE/D-SMAL inference exceeded ${timeoutMs} ms`)));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-16000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16000); });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("exit", (code, childSignal) => finish(() => resolve({ code, signal: childSignal, stdout, stderr })));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

async function readOutput(outputDir, relativePath, required) {
  const normalized = path.posix.normalize(relativePath.replaceAll("\\", "/"));
  if (path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`BITE/D-SMAL output path escapes the job directory: ${relativePath}`);
  }
  const resolved = path.join(outputDir, ...normalized.split("/"));
  try {
    const details = await stat(resolved);
    if (!details.isFile() || details.size === 0) throw new Error(`${relativePath} is empty`);
    return { name: normalized, data: await readFile(resolved) };
  } catch (error) {
    if (!required && error?.code === "ENOENT") return null;
    throw new Error(`BITE/D-SMAL output is missing ${relativePath}`, { cause: error });
  }
}

function validateGlb(buffer) {
  const gltf = parseGlbJson(buffer);
  const primitive = gltf.meshes?.[0]?.primitives?.[0];
  const attributes = primitive?.attributes ?? {};
  for (const name of ["POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"]) {
    if (!(name in attributes)) throw new Error(`BITE/D-SMAL GLB is missing ${name}`);
  }
  if (!gltf.skins?.length) throw new Error("BITE/D-SMAL GLB has no skin");
  if (!gltf.animations?.length) throw new Error("BITE/D-SMAL GLB has no verification animation");
  if (!gltf.materials?.length || !gltf.textures?.length || !gltf.images?.length) {
    throw new Error("BITE/D-SMAL GLB has no textured material");
  }
  return gltf;
}

function validateAvatar(avatar, photoCount) {
  if (avatar.species !== "dog") throw new Error("BITE/D-SMAL avatar species must be dog");
  if (avatar.provider !== "bite-d-smal") throw new Error("BITE/D-SMAL avatar provider is incorrect");
  if (avatar.aiReconstruction !== true) throw new Error("BITE/D-SMAL avatar must declare aiReconstruction=true");
  if (avatar.uvMapped !== true) throw new Error("BITE/D-SMAL avatar must declare uvMapped=true");
  if (avatar.sourcePhotoCount !== photoCount) throw new Error("BITE/D-SMAL avatar sourcePhotoCount is incorrect");
  if (!Number.isFinite(avatar.geometryConfidence) || avatar.geometryConfidence < 0 || avatar.geometryConfidence > 1) {
    throw new Error("BITE/D-SMAL avatar geometryConfidence must be between 0 and 1");
  }
  if (avatar.modelFile !== "pet.glb" || avatar.previewFile !== "preview.png") {
    throw new Error("BITE/D-SMAL avatar artifact paths are incorrect");
  }
  if (typeof avatar.topology !== "string" || !avatar.topology) throw new Error("BITE/D-SMAL avatar must identify its shared topology");
  if (typeof avatar.skeleton !== "string" || !avatar.skeleton) throw new Error("BITE/D-SMAL avatar must identify its skeleton");
  return avatar;
}

export class BiteDSmalProvider extends ReconstructionProvider {
  constructor({ executable, adapter, licenseMode, timeoutMs = 30 * 60 * 1000 }) {
    super();
    this.executable = assertAbsoluteFile(executable, "BITE runtime executable");
    this.adapter = assertAbsoluteFile(adapter, "BITE adapter");
    this.timeoutMs = timeoutMs;
    if (!new Set(["research", "commercial"]).has(licenseMode)) {
      throw new Error("BITE/D-SMAL provider requires PET_AVATAR_BITE_LICENSE_MODE=research or commercial");
    }
    this.licenseMode = licenseMode;
  }

  get name() {
    return "bite-d-smal";
  }

  async validateRuntime() {
    await access(this.executable);
    await access(this.adapter);
  }

  async reconstruct({ jobId, photoPaths, outputDir, updateProgress, signal }) {
    await this.validateRuntime();
    if (signal?.aborted) throw signal.reason;
    const requestPath = path.join(outputDir, "bite-request.json");
    const request = {
      schemaVersion: 1,
      jobId,
      species: "dog",
      profile: "bite-d-smal",
      licenseMode: this.licenseMode,
      photos: photoPaths.map((photoPath) => path.resolve(photoPath)),
      outputDirectory: path.resolve(outputDir),
      requirements: {
        canonicalPose: "neutral-standing",
        sharedTopology: true,
        rigged: true,
        uvMapped: true,
        textureProjection: "multi-photo",
        confidenceMap: true,
        format: "glb-2.0",
      },
    };
    await writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, "utf8");

    await updateProgress("reconstructing", 34, "Fitting the licensed dog-specific parametric model");
    const child = spawn(this.executable, [this.adapter, "--request", requestPath], {
      cwd: outputDir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const result = await collectProcessOutput(child, this.timeoutMs, signal);
    if (result.code !== 0) {
      const diagnostic = result.stderr.trim() || result.stdout.trim() || `signal ${result.signal ?? "unknown"}`;
      throw new Error(`BITE/D-SMAL adapter failed (${result.code ?? "no exit code"}): ${diagnostic}`);
    }

    await updateProgress("validating", 76, "Validating dog topology, rig, UV atlas, and texture outputs");
    const requiredFiles = await Promise.all(REQUIRED_OUTPUTS.map((name) => readOutput(outputDir, name, true)));
    const optionalFiles = (await Promise.all(OPTIONAL_OUTPUTS.map((name) => readOutput(outputDir, name, false)))).filter(Boolean);
    const files = [...requiredFiles, ...optionalFiles];
    const glbFile = files.find((file) => file.name === "pet.glb");
    const gltf = validateGlb(glbFile.data);
    for (const image of gltf.images) {
      if (!image.uri || image.uri.startsWith("data:")) continue;
      const normalizedUri = path.posix.normalize(image.uri.replaceAll("\\", "/"));
      if (!files.some((file) => file.name === normalizedUri)) {
        files.push(await readOutput(outputDir, normalizedUri, true));
      }
    }
    const avatarFile = files.find((file) => file.name === "avatar.json");
    const avatar = validateAvatar(JSON.parse(avatarFile.data.toString("utf8")), photoPaths.length);

    await updateProgress("packaging", 90, "Packaging the licensed dog-specific Unity avatar");
    const artifactPath = path.join(outputDir, "pet-avatar.zip");
    await writeFile(artifactPath, createZip(files));
    return {
      artifactPath,
      previewPath: path.join(outputDir, "preview.png"),
      avatar,
      files,
    };
  }
}
