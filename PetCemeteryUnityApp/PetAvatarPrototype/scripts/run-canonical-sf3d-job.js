import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadConfig } from "../src/config.js";
import { JobService } from "../src/job-service.js";
import { createConfiguredProvider } from "../src/pipeline/provider-factory.js";

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : "";
if (!inputPath) {
  console.error("Usage: node scripts/run-canonical-sf3d-job.js <canonical-image>");
  process.exit(2);
}

const extension = path.extname(inputPath).toLowerCase();
const type = extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
const config = loadConfig({ provider: "canonical-sf3d" });
const provider = createConfiguredProvider(config);
const jobs = new JobService({ jobsDir: config.jobsDir, provider, keepUploads: config.keepUploads });
await jobs.initialize();

const input = await readFile(inputPath);
const job = await jobs.create({
  photos: [new File([input], path.basename(inputPath), { type })],
  coatColor: null,
});
await jobs.queue;
const result = jobs.getInternal(job.id);
console.log(JSON.stringify({
  id: result.id,
  status: result.status,
  error: result.error ?? null,
  artifactPath: result.artifactPath,
  previewPath: result.previewPath,
  avatar: result.avatar ?? null,
}, null, 2));
if (result.status !== "ready") process.exitCode = 1;
