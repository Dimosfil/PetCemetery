import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPrototypeServer } from "../src/server.js";

async function waitForReady(baseUrl, id) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/jobs/${id}`);
    const job = await response.json();
    if (job.status === "ready") return job;
    if (job.status === "failed") throw new Error(job.error ?? "Prototype job failed");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for prototype job");
}

test("uploads photos and downloads a generated Unity package", async (context) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pet-avatar-test-"));
  const jobsDir = path.join(temporaryRoot, "jobs");
  const { server } = await createPrototypeServer({ config: { jobsDir, keepUploads: false } });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);

  const missingStaticFile = await fetch(`${baseUrl}/favicon.ico`);
  assert.equal(missingStaticFile.status, 404);
  const healthAfterMissingFile = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(healthAfterMissingFile.ok, true);

  const form = new FormData();
  form.append("photos", new Blob([Buffer.from([137, 80, 78, 71, 1, 2, 3])], { type: "image/png" }), "dog-left.png");
  form.append("photos", new Blob([Buffer.from([137, 80, 78, 71, 4, 5, 6])], { type: "image/png" }), "dog-right.png");
  form.append("coatColor", "#80553d");

  const createResponse = await fetch(`${baseUrl}/api/jobs`, { method: "POST", body: form });
  assert.equal(createResponse.status, 202);
  const created = await createResponse.json();
  assert.equal(created.photoCount, 2);

  const ready = await waitForReady(baseUrl, created.id);
  assert.equal(ready.provider, "procedural-prototype");

  const preview = await fetch(`${baseUrl}${ready.previewUrl}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("content-type"), "image/png");

  const download = await fetch(`${baseUrl}${ready.downloadUrl}`);
  assert.equal(download.status, 200);
  const zip = Buffer.from(await download.arrayBuffer());
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.ok(zip.includes(Buffer.from("pet.glb")));
  assert.ok(zip.includes(Buffer.from("avatar.json")));
});
