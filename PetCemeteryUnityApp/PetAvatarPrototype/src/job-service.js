import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const TERMINAL_STATES = new Set(["ready", "failed", "cancelled"]);

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    photoCount: job.photoCount,
    provider: job.provider,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    ready: job.status === "ready",
    error: job.error ?? null,
    downloadUrl: job.status === "ready" ? `/api/jobs/${job.id}/download` : null,
    previewUrl: job.status === "ready" ? `/api/jobs/${job.id}/preview` : null,
  };
}

function safeFileName(index, file) {
  const extensionByType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
  };
  return `photo-${String(index + 1).padStart(2, "0")}${extensionByType[file.type] ?? ".bin"}`;
}

export class JobService {
  constructor({ jobsDir, provider, keepUploads = false }) {
    this.jobsDir = jobsDir;
    this.provider = provider;
    this.keepUploads = keepUploads;
    this.jobs = new Map();
    this.queue = Promise.resolve();
  }

  async initialize() {
    await mkdir(this.jobsDir, { recursive: true });
    const entries = await readdir(this.jobsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const stored = JSON.parse(await readFile(path.join(this.jobsDir, entry.name, "job.json"), "utf8"));
        if (!TERMINAL_STATES.has(stored.status)) {
          stored.status = "failed";
          stored.error = "Сервер был перезапущен во время обработки. Создайте новое задание.";
          stored.message = stored.error;
          stored.updatedAt = new Date().toISOString();
        }
        this.jobs.set(stored.id, stored);
      } catch {
        // Ignore incomplete scratch directories from interrupted local runs.
      }
    }
  }

  async create({ photos, coatColor }) {
    const id = randomUUID();
    const jobDir = path.join(this.jobsDir, id);
    const inputDir = path.join(jobDir, "input");
    const outputDir = path.join(jobDir, "output");
    await mkdir(inputDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });

    const photoPaths = [];
    for (let index = 0; index < photos.length; index += 1) {
      const file = photos[index];
      const target = path.join(inputDir, safeFileName(index, file));
      await writeFile(target, Buffer.from(await file.arrayBuffer()));
      photoPaths.push(target);
    }

    const now = new Date().toISOString();
    const job = {
      id,
      status: "queued",
      progress: 8,
      message: "Задание добавлено в локальную очередь",
      photoCount: photos.length,
      provider: this.provider.name,
      coatColor,
      photoPaths,
      inputDir,
      outputDir,
      artifactPath: null,
      previewPath: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    await this.persist(job);

    this.queue = this.queue
      .then(() => this.process(job))
      .catch((error) => console.error("Prototype job queue failure", error));

    return publicJob(job);
  }

  get(id) {
    const job = this.jobs.get(id);
    return job ? publicJob(job) : null;
  }

  getInternal(id) {
    return this.jobs.get(id) ?? null;
  }

  async delete(id) {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (!TERMINAL_STATES.has(job.status)) {
      const error = new Error("Нельзя удалить задание во время обработки");
      error.statusCode = 409;
      throw error;
    }
    this.jobs.delete(id);
    await rm(path.join(this.jobsDir, id), { recursive: true, force: true });
    return true;
  }

  async process(job) {
    const updateProgress = async (status, progress, message) => {
      job.status = status;
      job.progress = progress;
      job.message = message;
      job.updatedAt = new Date().toISOString();
      await this.persist(job);
    };

    try {
      await updateProgress("validating", 18, "Проверяем фотографии и доступные ракурсы");
      const result = await this.provider.reconstruct({
        jobId: job.id,
        photoPaths: job.photoPaths,
        outputDir: job.outputDir,
        coatColor: job.coatColor,
        updateProgress,
      });
      job.artifactPath = result.artifactPath;
      job.previewPath = result.previewPath;
      job.avatar = result.avatar;
      await updateProgress("ready", 100, "Пакет готов к скачиванию");
      if (!this.keepUploads) {
        await rm(job.inputDir, { recursive: true, force: true });
        job.photoPaths = [];
        await this.persist(job);
      }
    } catch (error) {
      job.status = "failed";
      job.progress = 100;
      job.message = "Не удалось сформировать пакет";
      job.error = error instanceof Error ? error.message : String(error);
      job.updatedAt = new Date().toISOString();
      await this.persist(job);
    }
  }

  async persist(job) {
    const jobDir = path.join(this.jobsDir, job.id);
    await mkdir(jobDir, { recursive: true });
    const stored = { ...job };
    delete stored.inputDir;
    delete stored.outputDir;
    await writeFile(path.join(jobDir, "job.json"), `${JSON.stringify(stored, null, 2)}\n`, "utf8");
  }
}
