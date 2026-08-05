import { createHash } from "node:crypto";
import { ValidationError } from "./questionnaire.js";

export const ACCEPTED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ACCEPTED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/x-msvideo",
]);

function cleanName(value) {
  return String(value ?? "media")
    .replace(/[\p{Cc}<>:"/\\|?*]/gu, "_")
    .slice(0, 180);
}

function validateFile(file, acceptedTypes, maxBytes, label) {
  if (!file || typeof file.arrayBuffer !== "function") {
    throw new ValidationError(`Некорректный ${label}.`);
  }
  if (!acceptedTypes.has(file.type)) {
    throw new ValidationError(`Неподдерживаемый формат ${label}: ${file.type || file.name}`);
  }
  if (file.size <= 0) {
    throw new ValidationError(`Пустой файл: ${file.name}`);
  }
  if (file.size > maxBytes) {
    throw new ValidationError(`${file.name} превышает допустимый размер.`);
  }
}

export function validateMediaUpload(raw, limits) {
  const petName = String(raw?.petName ?? "").trim().slice(0, 80);
  const species = String(raw?.species ?? "").trim();
  const ownerContext = String(raw?.ownerContext ?? "").trim().slice(0, 8_000);
  const photos = Array.isArray(raw?.photos) ? raw.photos : [];
  const videos = Array.isArray(raw?.videos) ? raw.videos : [];

  if (!petName) throw new ValidationError("Укажите имя питомца.");
  if (!new Set(["dog", "cat", "other"]).has(species)) {
    throw new ValidationError("Выберите вид питомца.");
  }
  if (photos.length === 0 && videos.length === 0) {
    throw new ValidationError("Добавьте хотя бы одну фотографию или видео.");
  }
  if (photos.length > limits.maxPhotos) {
    throw new ValidationError(`Максимум фотографий: ${limits.maxPhotos}.`);
  }
  if (videos.length > limits.maxVideos) {
    throw new ValidationError(`Максимум видео: ${limits.maxVideos}.`);
  }
  photos.forEach((file) => validateFile(file, ACCEPTED_PHOTO_TYPES, limits.maxPhotoBytes, "фото"));
  videos.forEach((file) => validateFile(file, ACCEPTED_VIDEO_TYPES, limits.maxVideoBytes, "видео"));

  return { petName, species, ownerContext, photos, videos };
}

export async function materializeFile(file) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return {
    name: cleanName(file.name),
    mimeType: file.type,
    size: buffer.length,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    buffer,
  };
}
