import {
  normalizePersonalityAnalysis,
  PERSONALITY_ANALYSIS_OUTPUT_SCHEMA,
  PERSONALITY_ANALYSIS_SYSTEM_PROMPT,
} from "../domain/personality-analysis-contract.js";
import { FrameMediaPreparer } from "../media/frame-media-preparer.js";

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const content of item.content ?? []) {
      if (content.type === "refusal") {
        throw new Error(`Модель отказалась от анализа: ${content.refusal}`);
      }
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  throw new Error("API не вернул структурированный текст.");
}

export class OpenAIMultimodalAnalyzer {
  constructor({ openai, media, fetchImplementation = fetch, mediaPreparer } = {}) {
    this.config = openai;
    this.fetchImplementation = fetchImplementation;
    this.mediaPreparer = mediaPreparer ?? new FrameMediaPreparer(media);
    this.name = openai.apiKey
      ? `openai-multimodal:${openai.model}`
      : "openai-multimodal:not-configured";
  }

  async analyze(rawInput) {
    if (!this.config.apiKey) {
      const error = new Error("OPENAI_API_KEY не настроен для мультимодального анализа.");
      error.statusCode = 503;
      throw error;
    }

    const prepared = await this.mediaPreparer.prepare(rawInput);
    try {
      const userContent = [
        {
          type: "input_text",
          text: buildUserPrompt(prepared),
        },
      ];
      for (const visual of prepared.visualInputs) {
        userContent.push({ type: "input_text", text: `Источник ${visual.label}` });
        userContent.push({
          type: "input_image",
          image_url: `data:${visual.mimeType};base64,${visual.buffer.toString("base64")}`,
          detail: "high",
        });
      }

      const response = await this.fetchImplementation(
        `${this.config.baseUrl.replace(/\/$/u, "")}/responses`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            "content-type": "application/json; charset=utf-8",
          },
          body: JSON.stringify({
            model: this.config.model,
            store: false,
            reasoning: { effort: this.config.reasoningEffort ?? "low" },
            max_output_tokens: 8_000,
            input: [
              { role: "system", content: PERSONALITY_ANALYSIS_SYSTEM_PROMPT },
              { role: "user", content: userContent },
            ],
            text: {
              verbosity: "low",
              format: {
                type: "json_schema",
                name: "pet_media_personality_observation",
                strict: true,
                schema: PERSONALITY_ANALYSIS_OUTPUT_SCHEMA,
              },
            },
          }),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        },
      );

      if (!response.ok) {
        const body = await response.text();
        const error = new Error(
          `OpenAI media analysis failed (${response.status}): ${body.slice(0, 800)}`,
        );
        error.statusCode = 502;
        throw error;
      }
      const apiResponse = await response.json();
      if (apiResponse.status !== "completed") {
        const error = new Error(
          `OpenAI media analysis incomplete: ${apiResponse.incomplete_details?.reason ?? apiResponse.status}`,
        );
        error.statusCode = 502;
        throw error;
      }

      let modelResult;
      try {
        modelResult = JSON.parse(outputText(apiResponse));
      } catch (error) {
        const parseError = new Error(
          `Не удалось разобрать ответ мультимодальной модели: ${error.message}`,
        );
        parseError.statusCode = 502;
        throw parseError;
      }

      return buildAnalysisResult(
        prepared,
        normalizePersonalityAnalysis(
          modelResult,
          prepared.mediaManifest,
          apiResponse.usage,
          this.config,
        ),
      );
    } finally {
      await prepared.cleanup();
    }
  }
}

function buildUserPrompt(prepared) {
  const photoCount = prepared.mediaManifest.filter((item) => item.kind === "photo").length;
  const videoCount = prepared.mediaManifest.filter((item) => item.kind === "video").length;
  return `Питомец: ${prepared.input.petName}. Вид: ${prepared.input.species}.
Ниже идут ${photoCount} фотографий и ${videoCount} видео, представленных последовательными кадрами с приблизительными таймкодами.
Контекст владельца (непроверенное описание): <owner_context>${prepared.input.ownerContext || "не указан"}</owner_context>
Определи, достаточно ли данных для характера. Не повышай уверенность только из-за количества похожих фото одной сцены.`;
}

function buildAnalysisResult(prepared, normalized) {
  return {
    input: {
      ...prepared.input,
      mediaManifest: prepared.mediaManifest,
    },
    ...normalized,
  };
}
