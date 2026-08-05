import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicTextAnalyzer } from "../src/analyzers/deterministic-text-analyzer.js";

function validInput() {
  return {
    petName: "Бакс",
    species: "dog",
    answers: {
      human_sociability: 2,
      activity_playfulness: 2,
      novelty_confidence: -1,
      independence_closeness: 1,
      persistence_engagement: 2,
    },
    stories: ["Каждый вечер Бакс ждал у двери с мячом и звал меня играть."],
    videoObservations: ["На видео он осторожно осматривает новую игрушку, затем подходит."],
  };
}

test("deterministic baseline creates explainable dimensions and candidates", async () => {
  const analyzer = new DeterministicTextAnalyzer();
  const result = await analyzer.analyze(validInput());

  assert.equal(result.input.petName, "Бакс");
  assert.equal(result.dimensions.length, 5);
  assert.equal(result.dimensions.find((item) => item.id === "activity_playfulness").score, 1);
  assert.equal(result.analysis.generatedByModel, false);
  assert.deepEqual(result.analysis.usage, {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
  });
  assert.ok(result.signatureTraits.some((item) => item.label === "азартный игрок"));
  assert.ok(result.candidates.some((item) => item.label === "особый интерес к мячу"));
  assert.ok(result.evidence.every((item) => item.reviewStatus === "pending"));
  assert.ok(result.evidence.some((item) => item.sourceType === "described_video_observation"));
});

test("analyzer rejects a profile without concrete narrative evidence", async () => {
  const analyzer = new DeterministicTextAnalyzer();
  const input = validInput();
  input.stories = ["Коротко"];
  input.videoObservations = [];

  await assert.rejects(
    () => analyzer.analyze(input),
    (error) =>
      error.name === "ValidationError" &&
      error.details.some((detail) => /историю или наблюдение/u.test(detail)),
  );
});
