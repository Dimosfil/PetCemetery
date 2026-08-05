import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { ValidationError } from "./domain/questionnaire.js";

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

class BodyTooLargeError extends Error {
  constructor() {
    super("Тело запроса превышает допустимый размер.");
    this.name = "BodyTooLargeError";
    this.statusCode = 413;
  }
}

async function readJsonBody(request, maxBodyBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBodyBytes) {
      throw new BodyTooLargeError();
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("Ожидался корректный JSON.");
  }
}

async function readMediaForm(request, mediaConfig) {
  const declaredLength = Number.parseInt(request.headers["content-length"] ?? "0", 10);
  if (declaredLength > mediaConfig.maxRequestBytes) {
    throw new BodyTooLargeError();
  }
  const webRequest = new Request("http://localhost/api/media-profiles", {
    method: "POST",
    headers: request.headers,
    body: Readable.toWeb(request),
    duplex: "half",
  });
  const form = await webRequest.formData();
  const isFile = (value) => value && typeof value.arrayBuffer === "function";
  return {
    petName: String(form.get("petName") ?? ""),
    species: String(form.get("species") ?? ""),
    ownerContext: String(form.get("ownerContext") ?? ""),
    photos: form.getAll("photos").filter(isFile),
    videos: form.getAll("videos").filter(isFile),
  };
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function routeMatch(pathname, suffix = "") {
  const escapedSuffix = suffix.replaceAll("/", "\\/");
  return pathname.match(new RegExp(`^/api/profiles/([a-zA-Z0-9-]+)${escapedSuffix}$`, "u"));
}

async function serveStatic(response, pathname, publicDir) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch {
    sendJson(response, 400, { error: "Некорректный URL." });
    return;
  }
  const absolutePublicDir = path.resolve(publicDir);
  const absolutePath = path.resolve(absolutePublicDir, `.${decodedPath}`);
  if (!absolutePath.startsWith(`${absolutePublicDir}${path.sep}`)) {
    sendJson(response, 403, { error: "Доступ запрещён." });
    return;
  }
  try {
    const fileStats = await stat(absolutePath);
    if (!fileStats.isFile()) {
      throw Object.assign(new Error("Not a file"), { code: "ENOENT" });
    }
    const contents = await readFile(absolutePath);
    response.writeHead(200, {
      "content-type": MIME_TYPES.get(path.extname(absolutePath)) ?? "application/octet-stream",
      "cache-control": "no-cache",
    });
    response.end(contents);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(response, 404, { error: "Страница не найдена." });
      return;
    }
    throw error;
  }
}

export function createPersonalityServer({
  service,
  mediaService = service,
  publicDir,
  maxBodyBytes = 256 * 1024,
  mediaConfig = { maxRequestBytes: 160 * 1024 * 1024 },
}) {
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          prototype: "pet-personality",
          analyzer: service.analyzer.name,
          mediaAnalyzer: mediaService.analyzer.name,
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/media-profiles") {
        const profile = await mediaService.create(await readMediaForm(request, mediaConfig));
        sendJson(response, 201, profile);
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/profiles") {
        const profile = await service.create(await readJsonBody(request, maxBodyBytes));
        sendJson(response, 201, profile);
        return;
      }

      let match = routeMatch(url.pathname, "/revisions");
      if (request.method === "GET" && match) {
        sendJson(response, 200, { revisions: await service.listRevisions(match[1]) });
        return;
      }

      match = routeMatch(url.pathname, "/review");
      if (request.method === "POST" && match) {
        const profile = await service.review(
          match[1],
          await readJsonBody(request, maxBodyBytes),
        );
        sendJson(response, 200, profile);
        return;
      }

      match = routeMatch(url.pathname, "/comparison");
      if (request.method === "GET" && match) {
        sendJson(response, 200, await service.getComparison(match[1]));
        return;
      }
      if (request.method === "POST" && match) {
        const body = await readJsonBody(request, maxBodyBytes);
        sendJson(response, 200, await service.submitComparison(match[1], body.selected));
        return;
      }

      match = routeMatch(url.pathname);
      if (request.method === "GET" && match) {
        sendJson(response, 200, await service.get(match[1]));
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(response, url.pathname, publicDir);
        return;
      }

      sendJson(response, 404, { error: "Маршрут не найден." });
    } catch (error) {
      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 500) {
        console.error(error);
      }
      sendJson(response, statusCode, {
        error: statusCode >= 500 ? "Внутренняя ошибка прототипа." : error.message,
        ...(error.details?.length ? { details: error.details } : {}),
      });
    }
  });
}
