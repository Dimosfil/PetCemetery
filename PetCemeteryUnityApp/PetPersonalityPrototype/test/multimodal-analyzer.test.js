import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { OpenAIMultimodalAnalyzer } from "../src/analyzers/openai-multimodal-analyzer.js";
import { GeminiMultimodalAnalyzer } from "../src/analyzers/gemini-multimodal-analyzer.js";

const execFileAsync = promisify(execFile);
const dimensionIds = [
  "human_sociability",
  "activity_playfulness",
  "novelty_confidence",
  "independence_closeness",
  "persistence_engagement",
];

function modelOutput({ sourceId, sourceType, hasSequence }) {
  return {
    subjectConsistency: { sameAnimalConfidence: 0.98, notes: "Один и тот же питомец." },
    identityObservations: ["Небольшая белая собака с рыжими отметинами."],
    observableEvents: [
      {
        id: "observed-1",
        sourceId,
        sourceType,
        timestampSec: sourceType === "photo" ? null : 0,
        observation: "Питомец ориентирует голову в сторону нового объекта.",
        possibleMeaning: "Возможная ориентировочная реакция.",
        confidence: 0.82,
      },
    ],
    dataQuality: {
      hasBehavioralSequence: hasSequence,
      personalityInferenceReadiness: hasSequence ? "limited" : "insufficient",
      limitations: hasSequence ? ["Короткий эпизод."] : ["Нет видео."],
    },
    dimensions: dimensionIds.map((id) => ({
      id,
      score: id === "novelty_confidence" ? 0.7 : 0.5,
      confidence: hasSequence ? 0.55 : 0.2,
      status: hasSequence ? "tentative" : "insufficient",
      evidenceIds: ["observed-1"],
      rationale: "Связано с наблюдаемой ориентировочной реакцией.",
    })),
    signatureTraits: [
      {
        dimensionId: "novelty_confidence",
        label: "внимателен к новому",
        strength: 0.4,
        confidence: 0.55,
        evidenceIds: ["observed-1"],
      },
    ],
    candidates: [
      {
        kind: "habit",
        label: "сначала осматривает новый объект",
        confidence: 0.5,
        evidenceIds: ["observed-1"],
      },
    ],
    summary: "Осторожная гипотеза по короткой последовательности.",
    warnings: ["Нужны дополнительные контексты."],
  };
}

function mockFetchFor(output, onRequest = () => {}) {
  return async (_url, options) => {
    onRequest(JSON.parse(options.body));
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(output) }],
          },
        ],
        usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

function config(scratchDir) {
  return {
    openai: {
      apiKey: "test-key",
      baseUrl: "https://example.invalid/v1",
      model: "gpt-test-vision",
      timeoutMs: 10_000,
      inputUsdPerMillion: 2,
      outputUsdPerMillion: 12,
    },
    media: {
      maxPhotos: 12,
      maxVideos: 3,
      maxPhotoBytes: 12 * 1024 * 1024,
      maxVideoBytes: 120 * 1024 * 1024,
      maxVideoDurationSec: 300,
      maxFramesPerVideo: 4,
      scratchDir,
      keepUploads: false,
      ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
      ffprobePath: process.env.FFPROBE_PATH ?? "ffprobe",
    },
  };
}

test("photo-only media is analyzed but cannot activate stable personality", async (context) => {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "pet-photo-analysis-test-"));
  context.after(() => rm(scratchDir, { recursive: true, force: true }));
  let requestBody;
  const settings = config(scratchDir);
  const analyzer = new OpenAIMultimodalAnalyzer({
    ...settings,
    fetchImplementation: mockFetchFor(
      modelOutput({ sourceId: "photo-1", sourceType: "photo", hasSequence: false }),
      (body) => {
        requestBody = body;
      },
    ),
  });
  const result = await analyzer.analyze({
    petName: "Шаня",
    species: "dog",
    ownerContext: "Домашняя обстановка.",
    photos: [new File([Buffer.from("fake-jpeg")], "pet.jpg", { type: "image/jpeg" })],
    videos: [],
  });

  assert.equal(result.dataQuality.personalityInferenceReadiness, "insufficient");
  assert.equal(result.signatureTraits.length, 0);
  assert.ok(result.dimensions.every((item) => item.status === "insufficient"));
  assert.equal(result.analysis.usage.totalTokens, 1500);
  assert.equal(result.analysis.usage.estimatedCostUsd, 0.006);
  assert.ok(
    requestBody.input[1].content.some(
      (item) => item.type === "input_image" && item.image_url.startsWith("data:image/jpeg;base64,"),
    ),
  );
  assert.deepEqual(await readdir(scratchDir), []);
});

test("video frames retain source IDs and unlock tentative dimensions", async (context) => {
  const scratchDir = await mkdtemp(path.join(os.tmpdir(), "pet-video-analysis-test-"));
  context.after(() => rm(scratchDir, { recursive: true, force: true }));
  const videoPath = path.join(scratchDir, "fixture.mp4");
  await execFileAsync(
    process.env.FFMPEG_PATH ?? "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=white:s=160x120:d=2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      videoPath,
    ],
    { windowsHide: true },
  );
  const settings = config(path.join(scratchDir, "work"));
  const analyzer = new OpenAIMultimodalAnalyzer({
    ...settings,
    fetchImplementation: mockFetchFor(
      modelOutput({ sourceId: "video-1-frame-001", sourceType: "video_frame", hasSequence: true }),
    ),
  });
  const result = await analyzer.analyze({
    petName: "Шаня",
    species: "dog",
    ownerContext: "",
    photos: [],
    videos: [new File([await readFile(videoPath)], "behavior.mp4", { type: "video/mp4" })],
  });

  assert.equal(result.analysis.mediaSummary.videoCount, 1);
  assert.ok(result.analysis.mediaSummary.extractedFrameCount >= 2);
  assert.equal(result.dataQuality.personalityInferenceReadiness, "limited");
  assert.equal(result.signatureTraits[0].label, "внимателен к новому");
  assert.equal(result.evidence[0].sourceField, "video-1-frame-001");
});

test("Gemini adapter sends native video and accounts for thinking tokens", async () => {
  let requestBody;
  const output = modelOutput({ sourceId: "video-1", sourceType: "video_frame", hasSequence: true });
  const analyzer = new GeminiMultimodalAnalyzer({
    gemini: {
      engine: "gemini-interactions",
      apiKey: "test-key",
      baseUrl: "https://example.invalid/v1beta",
      model: "gemini-test",
      timeoutMs: 10_000,
      maxInlineBytes: 1024 * 1024,
      inputUsdPerMillion: 1.5,
      outputUsdPerMillion: 7.5,
    },
    media: config(os.tmpdir()).media,
    fetchImplementation: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "text", text: JSON.stringify(output) }],
            },
          ],
          usage: {
            total_input_tokens: 1000,
            total_output_tokens: 200,
            total_thought_tokens: 100,
            total_tokens: 1300,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const result = await analyzer.analyze({
    petName: "Шаня",
    species: "dog",
    ownerContext: "",
    photos: [],
    videos: [new File([Buffer.from("video")], "behavior.mp4", { type: "video/mp4" })],
  });

  assert.ok(requestBody.input.some((item) => item.type === "video"));
  assert.equal(requestBody.response_format.mime_type, "application/json");
  assert.equal(result.analysis.usage.inputTokens, 1000);
  assert.equal(result.analysis.usage.outputTokens, 300);
  assert.equal(result.analysis.usage.estimatedCostUsd, 0.00375);
  assert.equal(result.signatureTraits.length, 1);
});
