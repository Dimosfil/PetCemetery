import { fileURLToPath } from "node:url";
import path from "node:path";

const prototypeRoot = fileURLToPath(new URL("../", import.meta.url));
const MODEL_PRICING_USD_PER_MILLION = {
  // Standard processing prices checked against official model pages on 2026-08-03.
  "gpt-5.6-sol": { input: 5, output: 30 },
  "gpt-5.6": { input: 5, output: 30 },
  "gpt-5.6-terra": { input: 2.5, output: 15 },
  "gpt-5.6-luna": { input: 1, output: 6 },
};

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function optionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return new Set(["1", "true", "yes", "on"]).has(String(value).toLowerCase());
}

function reasoningEffort(value, fallback) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return new Set(["none", "low", "medium", "high", "xhigh", "max"]).has(normalized)
    ? normalized
    : fallback;
}

export function loadConfig(overrides = {}) {
  const rootDir = overrides.rootDir ?? prototypeRoot;
  const openaiModel =
    overrides.openai?.model ??
    process.env.PET_PERSONALITY_OPENAI_MODEL ??
    "gpt-5.6-terra";
  const configuredInputPrice = optionalNumber(
    process.env.PET_PERSONALITY_INPUT_USD_PER_MILLION,
  );
  const configuredOutputPrice = optionalNumber(
    process.env.PET_PERSONALITY_OUTPUT_USD_PER_MILLION,
  );

  return {
    rootDir,
    host: overrides.host ?? process.env.PET_PERSONALITY_HOST ?? "127.0.0.1",
    port: overrides.port ?? positiveInteger(process.env.PET_PERSONALITY_PORT, 4181),
    publicDir: overrides.publicDir ?? path.join(rootDir, "public"),
    profilesDir: overrides.profilesDir ?? path.join(rootDir, "var", "profiles"),
    maxBodyBytes:
      overrides.maxBodyBytes ??
      positiveInteger(process.env.PET_PERSONALITY_MAX_BODY_BYTES, 256 * 1024),
    media: {
      maxRequestBytes:
        overrides.media?.maxRequestBytes ??
        positiveInteger(process.env.PET_PERSONALITY_MAX_MEDIA_REQUEST_BYTES, 160 * 1024 * 1024),
      maxPhotos:
        overrides.media?.maxPhotos ?? positiveInteger(process.env.PET_PERSONALITY_MAX_PHOTOS, 12),
      maxVideos:
        overrides.media?.maxVideos ?? positiveInteger(process.env.PET_PERSONALITY_MAX_VIDEOS, 3),
      maxPhotoBytes:
        overrides.media?.maxPhotoBytes ??
        positiveInteger(process.env.PET_PERSONALITY_MAX_PHOTO_BYTES, 12 * 1024 * 1024),
      maxVideoBytes:
        overrides.media?.maxVideoBytes ??
        positiveInteger(process.env.PET_PERSONALITY_MAX_VIDEO_BYTES, 120 * 1024 * 1024),
      maxVideoDurationSec:
        overrides.media?.maxVideoDurationSec ??
        positiveInteger(process.env.PET_PERSONALITY_MAX_VIDEO_DURATION_SEC, 300),
      maxFramesPerVideo:
        overrides.media?.maxFramesPerVideo ??
        positiveInteger(process.env.PET_PERSONALITY_MAX_FRAMES_PER_VIDEO, 12),
      scratchDir: overrides.media?.scratchDir ?? path.join(rootDir, "var", "media-work"),
      keepUploads:
        overrides.media?.keepUploads ??
        booleanValue(process.env.PET_PERSONALITY_KEEP_MEDIA_UPLOADS, false),
      ffmpegPath: overrides.media?.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg",
      ffprobePath: overrides.media?.ffprobePath ?? process.env.FFPROBE_PATH ?? "ffprobe",
    },
    openai: {
      engine: "openai-responses",
      apiKey: overrides.openai?.apiKey ?? process.env.OPENAI_API_KEY ?? "",
      baseUrl:
        overrides.openai?.baseUrl ??
        process.env.OPENAI_BASE_URL ??
        "https://api.openai.com/v1",
      model: openaiModel,
      reasoningEffort:
        overrides.openai?.reasoningEffort ??
        reasoningEffort(process.env.PET_PERSONALITY_OPENAI_REASONING_EFFORT, "low"),
      timeoutMs:
        overrides.openai?.timeoutMs ??
        positiveInteger(process.env.PET_PERSONALITY_OPENAI_TIMEOUT_MS, 180_000),
      inputUsdPerMillion:
        overrides.openai?.inputUsdPerMillion ??
        configuredInputPrice ??
        MODEL_PRICING_USD_PER_MILLION[openaiModel]?.input ??
        null,
      outputUsdPerMillion:
        overrides.openai?.outputUsdPerMillion ??
        configuredOutputPrice ??
        MODEL_PRICING_USD_PER_MILLION[openaiModel]?.output ??
        null,
    },
    mediaProvider:
      overrides.mediaProvider ??
      process.env.PET_PERSONALITY_MEDIA_PROVIDER ??
      "codex",
    codex: {
      engine: "codex-cli-subscription",
      command:
        overrides.codex?.command ??
        process.env.PET_PERSONALITY_CODEX_COMMAND ??
        process.env.CODEX_CLI_COMMAND ??
        process.env.CODEX_COMMAND ??
        "codex",
      model:
        overrides.codex?.model ??
        process.env.PET_PERSONALITY_CODEX_MODEL ??
        process.env.CODEX_CLI_MODEL ??
        "gpt-5.6-sol",
      effort:
        overrides.codex?.effort ??
        reasoningEffort(
          process.env.PET_PERSONALITY_CODEX_EFFORT ?? process.env.CODEX_CLI_EFFORT,
          "high",
        ),
      timeoutMs:
        overrides.codex?.timeoutMs ??
        positiveInteger(process.env.PET_PERSONALITY_CODEX_TIMEOUT_MS, 600_000),
      scratchDir:
        overrides.codex?.scratchDir ?? path.join(rootDir, "var", "codex-work"),
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
    },
    gemini: {
      engine: "gemini-interactions",
      apiKey:
        overrides.gemini?.apiKey ??
        process.env.GEMINI_API_KEY ??
        process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
        "",
      baseUrl:
        overrides.gemini?.baseUrl ??
        process.env.GEMINI_BASE_URL ??
        "https://generativelanguage.googleapis.com/v1beta",
      model:
        overrides.gemini?.model ??
        process.env.PET_PERSONALITY_GEMINI_MODEL ??
        "gemini-3.6-flash",
      timeoutMs:
        overrides.gemini?.timeoutMs ??
        positiveInteger(process.env.PET_PERSONALITY_GEMINI_TIMEOUT_MS, 240_000),
      maxInlineBytes:
        overrides.gemini?.maxInlineBytes ??
        positiveInteger(process.env.PET_PERSONALITY_GEMINI_MAX_INLINE_BYTES, 90 * 1024 * 1024),
      inputUsdPerMillion:
        overrides.gemini?.inputUsdPerMillion ??
        optionalNumber(process.env.PET_PERSONALITY_GEMINI_INPUT_USD_PER_MILLION) ??
        1.5,
      outputUsdPerMillion:
        overrides.gemini?.outputUsdPerMillion ??
        optionalNumber(process.env.PET_PERSONALITY_GEMINI_OUTPUT_USD_PER_MILLION) ??
        7.5,
    },
  };
}
