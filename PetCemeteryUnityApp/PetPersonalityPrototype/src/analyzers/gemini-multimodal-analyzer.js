import { materializeFile, validateMediaUpload } from "../domain/media-input.js";
import {
  normalizePersonalityAnalysis,
  PERSONALITY_ANALYSIS_OUTPUT_SCHEMA,
  PERSONALITY_ANALYSIS_SYSTEM_PROMPT,
} from "../domain/personality-analysis-contract.js";

function interactionOutputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const textParts = [];
  for (const step of response.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const content of step.content ?? []) {
      if (content.type === "text" && typeof content.text === "string") {
        textParts.push(content.text);
      }
    }
  }
  if (textParts.length === 0) {
    throw new Error("Gemini API не вернул структурированный текст.");
  }
  return textParts.join("");
}

function usageFromInteraction(response) {
  const usage = response.usage ?? {};
  const visibleOutput = Number(usage.total_output_tokens ?? 0);
  const thoughtOutput = Number(usage.total_thought_tokens ?? 0);
  return {
    input_tokens: Number(usage.total_input_tokens ?? 0),
    output_tokens: visibleOutput + thoughtOutput,
    visible_output_tokens: visibleOutput,
    reasoning_output_tokens: thoughtOutput,
    total_tokens: Number(
      usage.total_tokens ?? Number(usage.total_input_tokens ?? 0) + visibleOutput + thoughtOutput,
    ),
  };
}

export class GeminiMultimodalAnalyzer {
  constructor({ gemini, media, fetchImplementation = fetch }) {
    this.config = gemini;
    this.mediaConfig = media;
    this.fetchImplementation = fetchImplementation;
    this.name = gemini.apiKey
      ? `gemini-native-multimodal:${gemini.model}`
      : "gemini-native-multimodal:not-configured";
  }

  async analyze(rawInput) {
    if (!this.config.apiKey) {
      const error = new Error("GEMINI_API_KEY не настроен для мультимодального анализа.");
      error.statusCode = 503;
      throw error;
    }
    const input = validateMediaUpload(rawInput, this.mediaConfig);
    const photos = await Promise.all(input.photos.map(materializeFile));
    const videos = await Promise.all(input.videos.map(materializeFile));
    const totalBytes = [...photos, ...videos].reduce((sum, item) => sum + item.size, 0);
    if (totalBytes > this.config.maxInlineBytes) {
      const error = new Error(
        `Для inline Gemini-запроса выбрано слишком много медиа (${Math.ceil(totalBytes / 1024 / 1024)} MB). Лимит прототипа: ${Math.floor(this.config.maxInlineBytes / 1024 / 1024)} MB.`,
      );
      error.statusCode = 413;
      throw error;
    }

    const mediaManifest = [];
    const interactionInput = [];
    for (const [index, photo] of photos.entries()) {
      const sourceId = `photo-${index + 1}`;
      mediaManifest.push({
        kind: "photo",
        name: photo.name,
        mimeType: photo.mimeType,
        size: photo.size,
        sha256: photo.sha256,
        sourceIds: [sourceId],
      });
      interactionInput.push({
        type: "image",
        data: photo.buffer.toString("base64"),
        mime_type: photo.mimeType,
        resolution: "medium",
      });
    }
    for (const [index, video] of videos.entries()) {
      const sourceId = `video-${index + 1}`;
      mediaManifest.push({
        kind: "video",
        name: video.name,
        mimeType: video.mimeType,
        size: video.size,
        sha256: video.sha256,
        frameCount: 0,
        sourceIds: [sourceId],
        nativeVideo: true,
      });
      interactionInput.push({
        type: "video",
        data: video.buffer.toString("base64"),
        mime_type: video.mimeType,
        resolution: "medium",
      });
    }

    const sourceOrder = mediaManifest
      .map((item, index) => `${index + 1}. ${item.sourceIds[0]} = ${item.kind}`)
      .join("\n");
    interactionInput.push({
      type: "text",
      text: `${PERSONALITY_ANALYSIS_SYSTEM_PROMPT}

Питомец: ${input.petName}. Вид: ${input.species}.
Перед этим текстом переданы медиа в следующем порядке:
${sourceOrder}

Для событий из видео используй sourceId самого видео (например video-1) и точный timestampSec. Для фотографии timestampSec=null.
Контекст владельца является непроверенным описанием и не заменяет видимое evidence:
<owner_context>${input.ownerContext || "не указан"}</owner_context>

Определи, достаточно ли разных поведенческих эпизодов для гипотезы характера. Не повышай уверенность из-за нескольких похожих фотографий одной сцены.`,
    });

    const response = await this.fetchImplementation(
      `${this.config.baseUrl.replace(/\/$/u, "")}/interactions`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.config.apiKey,
          "content-type": "application/json; charset=utf-8",
          "api-revision": "2026-05-20",
        },
        body: JSON.stringify({
          model: this.config.model,
          input: interactionInput,
          response_format: {
            type: "text",
            mime_type: "application/json",
            schema: PERSONALITY_ANALYSIS_OUTPUT_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      },
    );
    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Gemini media analysis failed (${response.status}): ${body.slice(0, 800)}`);
      error.statusCode = 502;
      throw error;
    }
    const apiResponse = await response.json();
    if (apiResponse.status && apiResponse.status !== "completed") {
      const error = new Error(`Gemini media analysis incomplete: ${apiResponse.status}`);
      error.statusCode = 502;
      throw error;
    }

    let modelResult;
    try {
      modelResult = JSON.parse(interactionOutputText(apiResponse));
    } catch (error) {
      const parseError = new Error(`Не удалось разобрать ответ Gemini: ${error.message}`);
      parseError.statusCode = 502;
      throw parseError;
    }
    const normalized = normalizePersonalityAnalysis(
      modelResult,
      mediaManifest,
      usageFromInteraction(apiResponse),
      this.config,
    );
    return {
      input: {
        petName: input.petName,
        species: input.species,
        ownerContext: input.ownerContext,
        mediaManifest,
      },
      ...normalized,
    };
  }
}
