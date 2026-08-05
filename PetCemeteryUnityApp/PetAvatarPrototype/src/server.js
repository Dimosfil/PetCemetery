import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { loadConfig } from "./config.js";
import { JobService } from "./job-service.js";
import { createConfiguredProvider } from "./pipeline/provider-factory.js";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function json(response, statusCode, value) {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "cache-control": "no-store",
  });
  response.end(body);
}

function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateUploads(files, config) {
  if (files.length === 0) throw requestError("Добавьте хотя бы одну фотографию");
  if (files.length > config.maxPhotos) throw requestError(`Максимум фотографий: ${config.maxPhotos}`);
  for (const file of files) {
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) throw requestError(`Неподдерживаемый формат: ${file.type || file.name}`);
    if (file.size <= 0) throw requestError(`Пустой файл: ${file.name}`);
    if (file.size > config.maxPhotoBytes) throw requestError(`Файл ${file.name} превышает допустимый размер`);
  }
}

async function parseMultipart(request, config) {
  const declaredLength = Number.parseInt(request.headers["content-length"] ?? "0", 10);
  if (declaredLength > config.maxRequestBytes) throw requestError("Общий размер загрузки превышает лимит", 413);
  const webRequest = new Request(`http://${config.host}${request.url}`, {
    method: request.method,
    headers: request.headers,
    body: Readable.toWeb(request),
    duplex: "half",
  });
  const form = await webRequest.formData();
  const photos = form.getAll("photos").filter((value) => typeof value?.arrayBuffer === "function");
  validateUploads(photos, config);
  const coatColor = String(form.get("coatColor") ?? "#9a6846");
  return { photos, coatColor };
}

async function sendFile(response, filePath, contentType, downloadName = null) {
  await access(filePath);
  const details = await stat(filePath);
  const headers = {
    "content-type": contentType,
    "content-length": details.size,
    "cache-control": "no-store",
  };
  if (downloadName) headers["content-disposition"] = `attachment; filename="${downloadName}"`;
  response.writeHead(200, headers);
  createReadStream(filePath).pipe(response);
}

async function sendPublicFile(response, publicDir, pathname) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const resolved = path.resolve(publicDir, requested);
  if (!resolved.startsWith(`${path.resolve(publicDir)}${path.sep}`) && resolved !== path.join(path.resolve(publicDir), "index.html")) {
    throw requestError("Недопустимый путь", 403);
  }
  const extension = path.extname(resolved).toLowerCase();
  const body = await readFile(resolved);
  response.writeHead(200, {
    "content-type": CONTENT_TYPES[extension] ?? "application/octet-stream",
    "content-length": body.length,
    "cache-control": extension === ".html" ? "no-store" : "public, max-age=60",
  });
  response.end(body);
}

export async function createPrototypeServer(options = {}) {
  const config = loadConfig(options.config);
  const provider = options.provider ?? createConfiguredProvider(config);
  const jobs = new JobService({ jobsDir: config.jobsDir, provider, keepUploads: config.keepUploads });
  await jobs.initialize();

  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host ?? `${config.host}:${config.port}`}`);
      const pathname = decodeURIComponent(url.pathname);

      if (request.method === "GET" && pathname === "/api/health") {
        return json(response, 200, { ok: true, provider: provider.name });
      }

      if (request.method === "POST" && pathname === "/api/jobs") {
        const upload = await parseMultipart(request, config);
        const job = await jobs.create(upload);
        return json(response, 202, job);
      }

      const jobMatch = pathname.match(/^\/api\/jobs\/([0-9a-f-]+)(?:\/(download|preview))?$/i);
      if (jobMatch) {
        const [, id, action] = jobMatch;
        const internalJob = jobs.getInternal(id);
        if (!internalJob) return json(response, 404, { error: "Задание не найдено" });

        if (request.method === "GET" && !action) return json(response, 200, jobs.get(id));
        if (request.method === "DELETE" && !action) {
          await jobs.delete(id);
          response.writeHead(204);
          return response.end();
        }
        if (request.method === "GET" && action === "download") {
          if (internalJob.status !== "ready") throw requestError("Пакет ещё не готов", 409);
          await sendFile(response, internalJob.artifactPath, "application/zip", `pet-avatar-${id}.zip`);
          return;
        }
        if (request.method === "GET" && action === "preview") {
          if (internalJob.status !== "ready") throw requestError("Превью ещё не готово", 409);
          await sendFile(response, internalJob.previewPath, "image/png");
          return;
        }
      }

      if (request.method === "GET" && !pathname.startsWith("/api/")) {
        await sendPublicFile(response, config.publicDir, pathname);
        return;
      }

      return json(response, 404, { error: "Маршрут не найден" });
    } catch (error) {
      const statusCode = error?.code === "ENOENT" ? 404 : error?.statusCode ?? 500;
      if (statusCode >= 500) console.error(error);
      return json(response, statusCode, { error: statusCode >= 500 ? "Внутренняя ошибка прототипа" : error.message });
    }
  });

  return { server, jobs, config, provider };
}
