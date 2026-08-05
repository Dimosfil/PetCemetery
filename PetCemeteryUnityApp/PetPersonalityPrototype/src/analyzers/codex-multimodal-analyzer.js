import {
  normalizePersonalityAnalysis,
  PERSONALITY_ANALYSIS_OUTPUT_SCHEMA,
  PERSONALITY_ANALYSIS_SYSTEM_PROMPT,
} from "../domain/personality-analysis-contract.js";
import { FrameMediaPreparer } from "../media/frame-media-preparer.js";
import { CodexCliProvider } from "../providers/codex-cli-provider.js";

export class CodexMultimodalAnalyzer {
  constructor({ codex, media, provider, mediaPreparer } = {}) {
    this.config = codex;
    this.provider = provider ?? new CodexCliProvider(codex);
    this.mediaPreparer = mediaPreparer ?? new FrameMediaPreparer(media);
    this.name = `codex-multimodal:${codex.model}:${codex.effort}`;
  }

  async analyze(rawInput) {
    const prepared = await this.mediaPreparer.prepare(rawInput);
    try {
      const providerResult = await this.provider.generate({
        instructions: PERSONALITY_ANALYSIS_SYSTEM_PROMPT,
        input: [
          { type: "text", text: buildAnalysisPrompt(prepared) },
          ...prepared.visualInputs.map((visual) => ({
            type: "localImage",
            path: visual.path,
          })),
        ],
        outputSchema: PERSONALITY_ANALYSIS_OUTPUT_SCHEMA,
      });

      let modelResult;
      try {
        modelResult = JSON.parse(stripCodeFence(providerResult.output));
      } catch (error) {
        const parseError = new Error(`Не удалось разобрать ответ Codex: ${error.message}`);
        parseError.statusCode = 502;
        throw parseError;
      }

      const normalized = normalizePersonalityAnalysis(
        modelResult,
        prepared.mediaManifest,
        providerResult.usage,
        this.config,
      );
      normalized.analysis.latencyMs = providerResult.elapsedMs;
      normalized.analysis.usageAccounting = "chatgpt-subscription";

      return {
        input: {
          ...prepared.input,
          mediaManifest: prepared.mediaManifest,
        },
        ...normalized,
      };
    } finally {
      await prepared.cleanup();
    }
  }
}

function buildAnalysisPrompt(prepared) {
  const photoCount = prepared.mediaManifest.filter((item) => item.kind === "photo").length;
  const videoCount = prepared.mediaManifest.filter((item) => item.kind === "video").length;
  const sourceOrder = prepared.visualInputs
    .map((visual, index) => `${index + 1}. ${visual.label}`)
    .join("\n");
  return `Питомец: ${prepared.input.petName}. Вид: ${prepared.input.species}.
К запросу приложены ${photoCount} фотографий и кадры из ${videoCount} видео в следующем порядке:
${sourceOrder}

Для каждого observableEvent используй sourceId из списка. Для фотографии sourceType=photo и timestampSec=null. Для кадра видео sourceType=video_frame и соответствующий таймкод из списка.
Контекст владельца является непроверенным описанием и не заменяет видимое evidence:
<owner_context>${prepared.input.ownerContext || "не указан"}</owner_context>

Определи, достаточно ли разных поведенческих эпизодов для гипотезы характера. Не повышай уверенность из-за нескольких похожих фотографий или кадров одной сцены.`;
}

function stripCodeFence(value) {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match ? match[1] : trimmed;
}
