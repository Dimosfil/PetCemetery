import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DeterministicTextAnalyzer } from "../src/analyzers/deterministic-text-analyzer.js";
import { ProfileService } from "../src/profile-service.js";

const input = {
  petName: "Марта",
  species: "cat",
  answers: {
    human_sociability: -1,
    activity_playfulness: 1,
    novelty_confidence: -2,
    independence_closeness: 2,
    persistence_engagement: 1,
  },
  stories: ["Марта всегда ждала у двери, а потом укладывалась спать на любимом кресле."],
  videoObservations: [],
};

test("profile service stores immutable revisions and blind-test evaluations", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pet-personality-profile-test-"));
  context.after(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  let tick = 0;
  const service = new ProfileService({
    analyzer: new DeterministicTextAnalyzer(),
    profilesDir: temporaryRoot,
    idFactory: () => "profile-test",
    clock: () => new Date(Date.UTC(2026, 7, 3, 10, 0, tick++)),
  });
  await service.initialize();

  const first = await service.create(input);
  const acceptedEvidenceIds = [first.evidence[0].id];
  const rejectedEvidenceIds = [first.evidence[1].id];
  const second = await service.review(first.id, { acceptedEvidenceIds, rejectedEvidenceIds });

  assert.equal(first.revision, 1);
  assert.equal(second.revision, 2);
  assert.equal(second.status, "owner-reviewed");
  assert.equal(second.evidence[0].reviewStatus, "owner-confirmed");
  assert.equal(second.evidence[1].reviewStatus, "owner-rejected");
  assert.equal((await service.get(first.id, 1)).status, "draft");
  assert.deepEqual(
    (await service.listRevisions(first.id)).map((item) => item.revision),
    [1, 2],
  );

  const comparison = await service.getComparison(first.id);
  assert.ok(comparison.options.A.summary);
  assert.ok(comparison.options.B.summary);
  assert.equal(comparison.options.A.summary, comparison.options.B.summary);
  for (const option of Object.values(comparison.options)) {
    assert.equal(option.signatureTraits.length, 3);
    assert.equal(option.dimensions.length, 5);
    assert.deepEqual(option.candidates, []);
  }

  const result = await service.submitComparison(first.id, "A");
  assert.equal(typeof result.correct, "boolean");
  assert.ok(new Set(["A", "B"]).has(result.actualSide));
  const evaluationFiles = await import("node:fs/promises").then(({ readdir }) =>
    readdir(path.join(temporaryRoot, first.id, "evaluations")),
  );
  const savedEvaluation = JSON.parse(
    await readFile(path.join(temporaryRoot, first.id, "evaluations", evaluationFiles[0]), "utf8"),
  );
  assert.equal(savedEvaluation.recognized, result.correct);
});
