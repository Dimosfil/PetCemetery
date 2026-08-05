import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const prototypeRoot = path.resolve(sourceDir, "..");

function integerFromEnvironment(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function stringFromEnvironment(name, fallback = "") {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function loadConfig(overrides = {}) {
  return {
    host: process.env.PET_AVATAR_HOST ?? "127.0.0.1",
    port: integerFromEnvironment("PET_AVATAR_PORT", 4177),
    maxPhotos: integerFromEnvironment("PET_AVATAR_MAX_PHOTOS", 20),
    maxPhotoBytes: integerFromEnvironment("PET_AVATAR_MAX_PHOTO_BYTES", 12 * 1024 * 1024),
    maxRequestBytes: integerFromEnvironment("PET_AVATAR_MAX_REQUEST_BYTES", 120 * 1024 * 1024),
    keepUploads: process.env.PET_AVATAR_KEEP_UPLOADS === "true",
    provider: stringFromEnvironment("PET_AVATAR_PROVIDER", "procedural-prototype"),
    bite: {
      executable: stringFromEnvironment("PET_AVATAR_BITE_EXECUTABLE"),
      adapter: stringFromEnvironment("PET_AVATAR_BITE_ADAPTER"),
      licenseMode: stringFromEnvironment("PET_AVATAR_BITE_LICENSE_MODE"),
      timeoutMs: integerFromEnvironment("PET_AVATAR_BITE_TIMEOUT_MS", 30 * 60 * 1000),
    },
    canonicalSf3d: {
      canonicalizerUrl: stringFromEnvironment("PET_AVATAR_CANONICALIZER_URL"),
      canonicalizerAuthorization: stringFromEnvironment("PET_AVATAR_CANONICALIZER_AUTHORIZATION"),
      sf3dUrl: stringFromEnvironment("PET_AVATAR_SF3D_URL"),
      sf3dAuthorization: stringFromEnvironment("PET_AVATAR_SF3D_AUTHORIZATION"),
      allowRemote: process.env.PET_AVATAR_CANONICAL_SF3D_ALLOW_REMOTE === "true",
      licenseMode: stringFromEnvironment("PET_AVATAR_CANONICAL_SF3D_LICENSE_MODE"),
      timeoutMs: integerFromEnvironment("PET_AVATAR_CANONICAL_SF3D_TIMEOUT_MS", 10 * 60 * 1000),
      previewExecutable: stringFromEnvironment("PET_AVATAR_PREVIEW_EXECUTABLE"),
      previewScript: stringFromEnvironment("PET_AVATAR_PREVIEW_SCRIPT"),
    },
    rootDir: prototypeRoot,
    publicDir: path.join(prototypeRoot, "public"),
    jobsDir: path.join(prototypeRoot, "var", "jobs"),
    ...overrides,
  };
}
