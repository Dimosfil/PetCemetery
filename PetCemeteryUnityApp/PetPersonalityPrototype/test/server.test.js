import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DeterministicTextAnalyzer } from "../src/analyzers/deterministic-text-analyzer.js";
import { ProfileService } from "../src/profile-service.js";
import { createPersonalityServer } from "../src/server.js";

test("HTTP API preserves Cyrillic and exposes the complete prototype flow", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pet-personality-server-test-"));
  const service = new ProfileService({
    analyzer: new DeterministicTextAnalyzer(),
    profilesDir: temporaryRoot,
    idFactory: () => "http-profile-test",
  });
  await service.initialize();
  const server = createPersonalityServer({
    service,
    publicDir: fileURLToPath(new URL("../public", import.meta.url)),
    maxBodyBytes: 64 * 1024,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(temporaryRoot, { recursive: true, force: true });
  });
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).analyzer, "deterministic-text-baseline");

  const indexResponse = await fetch(baseUrl);
  assert.equal(indexResponse.status, 200);
  assert.match(await indexResponse.text(), /Character Lab/u);

  const createResponse = await fetch(`${baseUrl}/api/profiles`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      petName: "Шаня",
      species: "dog",
      answers: {
        human_sociability: 1,
        activity_playfulness: 2,
        novelty_confidence: 0,
        independence_closeness: 2,
        persistence_engagement: 1,
      },
      stories: ["Шаня приносила мяч и всегда встречала меня у двери после работы."],
      videoObservations: [],
    }),
  });
  assert.equal(createResponse.status, 201);
  const profile = await createResponse.json();
  assert.equal(profile.pet.name, "Шаня");

  const comparisonResponse = await fetch(`${baseUrl}/api/profiles/${profile.id}/comparison`);
  assert.equal(comparisonResponse.status, 200);
  const comparison = await comparisonResponse.json();
  assert.ok(comparison.options.A);
  assert.ok(comparison.options.B);

  const invalidResponse = await fetch(`${baseUrl}/api/profiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(invalidResponse.status, 400);
  assert.ok((await invalidResponse.json()).details.length > 0);
});

test("HTTP API accepts photo and video multipart fields for the media service", async (context) => {
  const service = {
    analyzer: { name: "text-stub" },
  };
  let received;
  const mediaService = {
    analyzer: { name: "media-stub" },
    async create(input) {
      received = input;
      return { id: "media-profile", pet: { name: input.petName }, status: "draft" };
    },
  };
  const server = createPersonalityServer({
    service,
    mediaService,
    publicDir: fileURLToPath(new URL("../public", import.meta.url)),
    mediaConfig: { maxRequestBytes: 1024 * 1024 },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(
    () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  );
  const form = new FormData();
  form.set("petName", "Шаня");
  form.set("species", "dog");
  form.set("ownerContext", "Новая игрушка.");
  form.append("photos", new File([Buffer.from("image")], "pet.jpg", { type: "image/jpeg" }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/media-profiles`, {
    method: "POST",
    body: form,
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).id, "media-profile");
  assert.equal(received.petName, "Шаня");
  assert.equal(received.photos.length, 1);
  assert.equal(received.videos.length, 0);
});
