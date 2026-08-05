import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { CodexMultimodalAnalyzer } from "../src/analyzers/codex-multimodal-analyzer.js";
import { loadConfig } from "../src/config.js";
import {
  buildCodexExecArguments,
  parseCodexJsonOutput,
} from "../src/providers/codex-cli-provider.js";

const dimensionIds = [
  "human_sociability",
  "activity_playfulness",
  "novelty_confidence",
  "independence_closeness",
  "persistence_engagement",
];

function modelOutput() {
  return {
    subjectConsistency: { sameAnimalConfidence: 0.9, notes: "Один питомец." },
    identityObservations: ["Собака находится в помещении."],
    observableEvents: [
      {
        id: "observed-1",
        sourceId: "photo-1",
        sourceType: "photo",
        timestampSec: null,
        observation: "Собака сидит и смотрит в сторону камеры.",
        possibleMeaning: "Наблюдается ориентация внимания.",
        confidence: 0.8,
      },
    ],
    dataQuality: {
      hasBehavioralSequence: false,
      personalityInferenceReadiness: "insufficient",
      limitations: ["Доступна только фотография."],
    },
    dimensions: dimensionIds.map((id) => ({
      id,
      score: 0.5,
      confidence: 0.1,
      status: "insufficient",
      evidenceIds: ["observed-1"],
      rationale: "Нет поведенческой последовательности.",
    })),
    signatureTraits: [],
    candidates: [],
    summary: "Недостаточно данных.",
    warnings: ["Требуется видео."],
  };
}

test("Codex analyzer receives prepared media and keeps provider transport domain-neutral", async () => {
  const fixturePath = path.resolve("fixture.jpg");
  let providerRequest;
  let cleanupCalled = false;
  const analyzer = new CodexMultimodalAnalyzer({
    codex: {
      engine: "codex-cli-subscription",
      model: "gpt-5.6-sol",
      effort: "high",
      inputUsdPerMillion: null,
      outputUsdPerMillion: null,
    },
    provider: {
      async generate(request) {
        providerRequest = request;
        return {
          output: JSON.stringify(modelOutput()),
          elapsedMs: 321,
          usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
        };
      },
    },
    mediaPreparer: {
      async prepare() {
        return {
          input: { petName: "Шаня", species: "dog", ownerContext: "" },
          mediaManifest: [
            {
              kind: "photo",
              name: "fixture.jpg",
              mimeType: "image/jpeg",
              size: 10,
              sha256: "hash",
              sourceIds: ["photo-1"],
            },
          ],
          visualInputs: [
            {
              sourceId: "photo-1",
              label: "photo-1; статическая фотография 1",
              mimeType: "image/jpeg",
              path: fixturePath,
            },
          ],
          async cleanup() {
            cleanupCalled = true;
          },
        };
      },
    },
  });

  const result = await analyzer.analyze({});

  assert.equal(providerRequest.input[0].type, "text");
  assert.deepEqual(providerRequest.input[1], { type: "localImage", path: fixturePath });
  assert.equal(providerRequest.outputSchema.additionalProperties, false);
  assert.equal(result.analysis.engine, "codex-cli-subscription:gpt-5.6-sol");
  assert.equal(result.analysis.latencyMs, 321);
  assert.equal(result.analysis.usageAccounting, "chatgpt-subscription");
  assert.equal(result.dataQuality.personalityInferenceReadiness, "insufficient");
  assert.equal(cleanupCalled, true);
});

test("Codex CLI transport uses isolated execution, images, schema, Sol and high effort", () => {
  const schemaPath = path.resolve("schema.json");
  const imagePath = path.resolve("fixture.jpg");
  const args = buildCodexExecArguments(
    { model: "gpt-5.6-sol", effort: "high" },
    schemaPath,
    [{ type: "localImage", path: imagePath }],
  );

  assert.deepEqual(args.slice(0, 6), [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
  ]);
  assert.ok(args.includes("read-only"));
  assert.equal(args[args.indexOf("--model") + 1], "gpt-5.6-sol");
  assert.ok(args.includes("model_reasoning_effort=high"));
  assert.equal(args[args.indexOf("--image") + 1], imagePath);
  assert.equal(args[args.indexOf("--output-schema") + 1], schemaPath);
});

test("development configuration selects Codex Sol with high reasoning", () => {
  const config = loadConfig({ rootDir: path.resolve("prototype-test") });

  assert.equal(config.mediaProvider, "codex");
  assert.equal(config.codex.model, "gpt-5.6-sol");
  assert.equal(config.codex.effort, "high");
  assert.equal(config.codex.inputUsdPerMillion, null);
});

test("Codex event stream exposes final structured output and token usage", () => {
  const parsed = parseCodexJsonOutput(
    [
      JSON.stringify({ type: "thread.started", thread_id: "thread-1" }),
      JSON.stringify({
        type: "item.completed",
        item: { type: "agent_message", text: '{"status":"ok"}' },
      }),
      JSON.stringify({
        type: "turn.completed",
        usage: {
          input_tokens: 100,
          cached_input_tokens: 40,
          output_tokens: 20,
          reasoning_output_tokens: 30,
        },
      }),
    ].join("\n"),
  );

  assert.equal(parsed.output, '{"status":"ok"}');
  assert.deepEqual(parsed.usage, {
    input_tokens: 100,
    cached_input_tokens: 40,
    output_tokens: 50,
    visible_output_tokens: 20,
    reasoning_output_tokens: 30,
    total_tokens: 150,
  });
});
