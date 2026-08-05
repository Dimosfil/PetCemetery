import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createZip } from "../lib/zip.js";
import { parseGlbJson } from "./glb-builder.js";
import { ReconstructionProvider } from "./reconstruction-provider.js";

const ALLOWED_LICENSE_MODES = new Set(["research", "community", "enterprise"]);

function assertHttpUrl(value, label, { optional = false } = {}) {
  if (!value && optional) return "";
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL`);
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${label} must be an absolute HTTP(S) URL without embedded credentials`);
  }
  return parsed.toString();
}

function assertAbsoluteFile(value, label) {
  if (!value || !path.isAbsolute(value)) throw new Error(`${label} must be an absolute file path`);
  const details = statSync(value);
  if (!details.isFile()) throw new Error(`${label} must point to a file`);
  return value;
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  return "image/jpeg";
}

async function responseBuffer(response, label, expectedType) {
  if (!response.ok) {
    const diagnostic = (await response.text()).trim().slice(0, 1000);
    throw new Error(`${label} failed with HTTP ${response.status}${diagnostic ? `: ${diagnostic}` : ""}`);
  }
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() ?? "";
  if (expectedType === "image" && !contentType.startsWith("image/")) {
    throw new Error(`${label} returned ${contentType || "an unknown content type"}; expected image bytes`);
  }
  if (expectedType === "glb" && contentType && !new Set([
    "model/gltf-binary",
    "application/octet-stream",
    "application/x-binary",
  ]).has(contentType)) {
    throw new Error(`${label} returned ${contentType}; expected a binary GLB`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error(`${label} returned an empty response`);
  return { buffer, contentType };
}

function requestSignal(timeoutMs, signal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

async function addPhoto(form, field, photoPath) {
  const buffer = await readFile(photoPath);
  form.append(field, new Blob([buffer], { type: mimeType(photoPath) }), path.basename(photoPath));
}

function authorizationHeaders(value) {
  return value ? { Authorization: value } : {};
}

function validateStaticGlb(buffer) {
  const gltf = parseGlbJson(buffer);
  const primitives = gltf.meshes?.flatMap((mesh) => mesh.primitives ?? []) ?? [];
  if (!primitives.length) throw new Error("Stable Fast 3D GLB has no mesh primitives");
  for (const primitive of primitives) {
    for (const name of ["POSITION", "NORMAL", "TEXCOORD_0"]) {
      if (!(name in (primitive.attributes ?? {}))) throw new Error(`Stable Fast 3D GLB is missing ${name}`);
    }
  }
  if (!gltf.materials?.length || !gltf.textures?.length || !gltf.images?.length) {
    throw new Error("Stable Fast 3D GLB has no embedded UV/PBR texture material");
  }
  if (gltf.images.some((image) => image.bufferView === undefined && !image.uri?.startsWith("data:"))) {
    throw new Error("Stable Fast 3D GLB references an external texture instead of embedding it");
  }

  let vertices = 0;
  let triangles = 0;
  for (const primitive of primitives) {
    vertices += gltf.accessors?.[primitive.attributes.POSITION]?.count ?? 0;
    if (primitive.indices !== undefined) triangles += Math.floor((gltf.accessors?.[primitive.indices]?.count ?? 0) / 3);
  }
  return { gltf, vertices, triangles };
}

function collectProcess(child, timeoutMs, signal) {
  return new Promise((resolve, reject) => {
    let stderr = "";
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      callback();
    };
    const abort = () => {
      child.kill();
      finish(() => reject(signal.reason ?? new Error("Preview rendering was cancelled")));
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(() => reject(new Error(`Preview rendering exceeded ${timeoutMs} ms`)));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-16000); });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("exit", (code) => finish(() => code === 0
      ? resolve()
      : reject(new Error(`Preview renderer failed (${code ?? "no exit code"}): ${stderr.trim()}`))));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

export class CanonicalSf3dProvider extends ReconstructionProvider {
  constructor({
    canonicalizerUrl = "",
    canonicalizerAuthorization = "",
    sf3dUrl,
    sf3dAuthorization = "",
    allowRemote = false,
    licenseMode,
    timeoutMs = 10 * 60 * 1000,
    previewExecutable,
    previewScript,
    fetchImpl = globalThis.fetch,
    renderPreview,
  }) {
    super();
    this.canonicalizerUrl = assertHttpUrl(canonicalizerUrl, "Canonicalizer URL", { optional: true });
    this.sf3dUrl = assertHttpUrl(sf3dUrl, "Stable Fast 3D URL");
    if (!allowRemote) {
      throw new Error("canonical-sf3d requires PET_AVATAR_CANONICAL_SF3D_ALLOW_REMOTE=true before uploading photos");
    }
    if (!ALLOWED_LICENSE_MODES.has(licenseMode)) {
      throw new Error("canonical-sf3d requires license mode research, community, or enterprise");
    }
    if (typeof fetchImpl !== "function") throw new Error("canonical-sf3d requires a fetch implementation");
    this.canonicalizerAuthorization = canonicalizerAuthorization;
    this.sf3dAuthorization = sf3dAuthorization;
    this.licenseMode = licenseMode;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.renderPreview = renderPreview ?? (async ({ modelPath, previewPath, signal }) => {
      const executable = assertAbsoluteFile(previewExecutable, "Preview runtime executable");
      const script = assertAbsoluteFile(previewScript, "Preview renderer script");
      const child = spawn(executable, [script, modelPath, previewPath], {
        cwd: path.dirname(previewPath),
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe"],
      });
      await collectProcess(child, this.timeoutMs, signal);
    });
  }

  get name() {
    return "canonical-sf3d";
  }

  async canonicalize(photoPaths, signal) {
    if (!this.canonicalizerUrl) {
      if (photoPaths.length !== 1) {
        throw new Error("Multiple photos require PET_AVATAR_CANONICALIZER_URL; without it submit one canonical image");
      }
      return { buffer: await readFile(photoPaths[0]), contentType: mimeType(photoPaths[0]), mode: "passthrough" };
    }

    const form = new FormData();
    for (const photoPath of photoPaths) await addPhoto(form, "photos", photoPath);
    form.append("spec", JSON.stringify({
      species: "dog",
      pose: "neutral-standing",
      background: "transparent-or-plain",
      preserve: ["coat-pattern", "face", "ears", "tail", "body-proportions"],
      inferOccludedGeometry: true,
    }));
    const response = await this.fetchImpl(this.canonicalizerUrl, {
      method: "POST",
      headers: authorizationHeaders(this.canonicalizerAuthorization),
      body: form,
      signal: requestSignal(this.timeoutMs, signal),
    });
    const result = await responseBuffer(response, "Canonicalizer", "image");
    return { ...result, mode: "remote" };
  }

  async reconstruct({ photoPaths, outputDir, updateProgress, signal }) {
    if (!photoPaths.length) throw new Error("canonical-sf3d requires at least one photo");

    await updateProgress("canonicalizing", 28, "Building a neutral standing reference from the submitted photos");
    const canonical = await this.canonicalize(photoPaths, signal);
    const canonicalPath = path.join(outputDir, `canonical-reference${canonical.contentType === "image/png" ? ".png" : ".jpg"}`);
    await writeFile(canonicalPath, canonical.buffer);

    await updateProgress("reconstructing", 55, "Generating a textured static mesh with Stable Fast 3D");
    const form = new FormData();
    form.append("image", new Blob([canonical.buffer], { type: canonical.contentType }), path.basename(canonicalPath));
    const response = await this.fetchImpl(this.sf3dUrl, {
      method: "POST",
      headers: authorizationHeaders(this.sf3dAuthorization),
      body: form,
      signal: requestSignal(this.timeoutMs, signal),
    });
    const { buffer: glb } = await responseBuffer(response, "Stable Fast 3D", "glb");
    const stats = validateStaticGlb(glb);
    const modelPath = path.join(outputDir, "pet.glb");
    await writeFile(modelPath, glb);

    await updateProgress("rendering", 78, "Rendering a verification preview of the textured mesh");
    const previewPath = path.join(outputDir, "preview.png");
    await this.renderPreview({ modelPath, previewPath, signal });
    const preview = await readFile(previewPath);
    if (!preview.length) throw new Error("Preview renderer produced an empty image");

    const avatar = {
      schemaVersion: 1,
      species: "dog",
      provider: this.name,
      aiReconstruction: true,
      profile: "experimental-static-uv-pbr",
      licenseMode: this.licenseMode,
      sourcePhotoCount: photoPaths.length,
      canonicalizationMode: canonical.mode,
      canonicalized: true,
      modelFile: "pet.glb",
      previewFile: "preview.png",
      uvMapped: true,
      pbrTextured: true,
      staticMesh: true,
      rigged: false,
      animated: false,
      confidenceAvailable: false,
      geometryConfidence: null,
      vertices: stats.vertices,
      triangles: stats.triangles,
      limitations: [
        "Occluded geometry is inferred from the canonical reference.",
        "The mesh is not guaranteed to be watertight or animation-ready.",
        "No skeleton, skin weights, or verification animation are included.",
      ],
    };
    const avatarData = Buffer.from(`${JSON.stringify(avatar, null, 2)}\n`, "utf8");
    await writeFile(path.join(outputDir, "avatar.json"), avatarData);
    const readme = Buffer.from([
      "Pet Cemetery canonical-sf3d experimental artifact",
      "",
      "pet.glb is a static UV/PBR textured mesh generated from an AI-canonicalized reference.",
      "It is suitable for visual review and manual detail work, not direct character animation.",
      "The canonical reference is intentionally excluded from this package for photo privacy.",
      "",
    ].join("\n"), "utf8");
    const files = [
      { name: "pet.glb", data: glb },
      { name: "preview.png", data: preview },
      { name: "avatar.json", data: avatarData },
      { name: "README.md", data: readme },
    ];

    await updateProgress("packaging", 92, "Packaging the textured GLB and verification metadata");
    const artifactPath = path.join(outputDir, "pet-avatar.zip");
    await writeFile(artifactPath, createZip(files));
    return { artifactPath, previewPath, avatar, files };
  }
}
