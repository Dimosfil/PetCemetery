import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { DeterministicTextAnalyzer } from "./analyzers/deterministic-text-analyzer.js";
import { OpenAIMultimodalAnalyzer } from "./analyzers/openai-multimodal-analyzer.js";
import { GeminiMultimodalAnalyzer } from "./analyzers/gemini-multimodal-analyzer.js";
import { CodexMultimodalAnalyzer } from "./analyzers/codex-multimodal-analyzer.js";
import { loadConfig } from "./config.js";
import { ProfileService } from "./profile-service.js";
import { createPersonalityServer } from "./server.js";

const projectRoot = fileURLToPath(new URL("../../../", import.meta.url));
for (const envFile of [".env.local", ".env"]) {
  try {
    loadEnvFile(`${projectRoot}${envFile}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

const config = loadConfig();
const service = new ProfileService({
  analyzer: new DeterministicTextAnalyzer(),
  profilesDir: config.profilesDir,
});
const mediaAnalyzer = createMediaAnalyzer(config);
const mediaService = new ProfileService({
  analyzer: mediaAnalyzer,
  profilesDir: config.profilesDir,
});

await service.initialize();
await mediaService.initialize();
const server = createPersonalityServer({
  service,
  mediaService,
  publicDir: config.publicDir,
  maxBodyBytes: config.maxBodyBytes,
  mediaConfig: config.media,
});

server.listen(config.port, config.host, () => {
  console.log(`Pet Personality Prototype: http://${config.host}:${config.port}`);
  console.log(`Text analyzer: ${service.analyzer.name}`);
  console.log(`Media analyzer: ${mediaService.analyzer.name}; profiles: ${config.profilesDir}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; stopping.`);
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

function createMediaAnalyzer(settings) {
  if (settings.mediaProvider === "codex") {
    return new CodexMultimodalAnalyzer({ codex: settings.codex, media: settings.media });
  }
  if (settings.mediaProvider === "gemini") {
    return new GeminiMultimodalAnalyzer({ gemini: settings.gemini, media: settings.media });
  }
  if (settings.mediaProvider === "openai") {
    return new OpenAIMultimodalAnalyzer({ openai: settings.openai, media: settings.media });
  }
  throw new Error(`Неизвестный media provider: ${settings.mediaProvider}`);
}
