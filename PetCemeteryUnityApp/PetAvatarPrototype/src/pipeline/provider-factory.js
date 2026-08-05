import { BiteDSmalProvider } from "./bite-d-smal-provider.js";
import { CanonicalSf3dProvider } from "./canonical-sf3d-provider.js";
import { ProceduralReconstructionProvider } from "./procedural-reconstruction-provider.js";

export function createConfiguredProvider(config) {
  if (config.provider === "procedural-prototype") return new ProceduralReconstructionProvider();
  if (config.provider === "bite-d-smal") {
    return new BiteDSmalProvider({
      executable: config.bite.executable,
      adapter: config.bite.adapter,
      licenseMode: config.bite.licenseMode,
      timeoutMs: config.bite.timeoutMs,
    });
  }
  if (config.provider === "canonical-sf3d") {
    return new CanonicalSf3dProvider({
      canonicalizerUrl: config.canonicalSf3d?.canonicalizerUrl,
      canonicalizerAuthorization: config.canonicalSf3d?.canonicalizerAuthorization,
      sf3dUrl: config.canonicalSf3d?.sf3dUrl,
      sf3dAuthorization: config.canonicalSf3d?.sf3dAuthorization,
      allowRemote: config.canonicalSf3d?.allowRemote,
      licenseMode: config.canonicalSf3d?.licenseMode,
      timeoutMs: config.canonicalSf3d?.timeoutMs,
      previewExecutable: config.canonicalSf3d?.previewExecutable,
      previewScript: config.canonicalSf3d?.previewScript,
    });
  }
  throw new Error(`Unsupported reconstruction provider: ${config.provider}`);
}
