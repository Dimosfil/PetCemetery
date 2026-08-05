import { z } from "zod";

const optionalDate = z.union([z.iso.date(), z.literal(""), z.null()]).optional();
const optionalCoordinate = z.number().finite().nullable();

export const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(10).max(128),
  displayName: z.string().trim().min(2).max(80),
  city: z.string().trim().max(120).optional().default(""),
});

export const profileSchema = z.object({
  city: z.string().trim().max(120),
});

export const friendRequestSchema = z.object({
  userId: z.uuid(),
});

export const friendshipActionSchema = z.object({
  action: z.enum(["accept", "decline", "cancel", "remove"]),
});

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export const memorialSchema = z.object({
  name: z.string().trim().min(1).max(80),
  species: z.string().trim().min(1).max(80),
  breed: z.string().trim().max(120).optional().default(""),
  birthDate: optionalDate,
  passingDate: optionalDate,
  story: z.string().trim().max(10_000).optional().default(""),
  epitaph: z.string().trim().max(280).optional().default(""),
  avatarUrl: z.string().trim().max(500).optional().default(""),
  visibility: z.enum(["public", "unlisted", "private"]),
  locationMode: z.enum(["exact", "approximate", "symbolic", "hidden"]),
  latitude: optionalCoordinate,
  longitude: optionalCoordinate,
  locationLabel: z.string().trim().max(180).optional().default(""),
  ceremonyTitle: z.string().trim().max(140).optional().default(""),
  ceremonyMessage: z.string().trim().max(5000).optional().default(""),
  ceremonyStartsAt: z.union([z.iso.datetime({ local: true }), z.literal(""), z.null()]).optional(),
}).superRefine((value, context) => {
  if (value.birthDate && value.passingDate && value.birthDate > value.passingDate) {
    context.addIssue({ code: "custom", path: ["passingDate"], message: "Дата ухода не может быть раньше даты рождения" });
  }
  if (value.locationMode !== "hidden" && (value.latitude === null || value.longitude === null)) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "Выберите точку на карте" });
  }
  if (value.latitude !== null && (value.latitude < -90 || value.latitude > 90)) {
    context.addIssue({ code: "custom", path: ["latitude"], message: "Некорректная широта" });
  }
  if (value.longitude !== null && (value.longitude < -180 || value.longitude > 180)) {
    context.addIssue({ code: "custom", path: ["longitude"], message: "Некорректная долгота" });
  }
});

export const tributeSchema = z.object({
  kind: z.enum(["candle", "flower", "message"]),
  guestName: z.string().trim().max(80).optional().default(""),
  message: z.string().trim().max(700).optional().default(""),
}).superRefine((value, context) => {
  if (value.kind === "message" && !value.message) {
    context.addIssue({ code: "custom", path: ["message"], message: "Напишите памятные слова" });
  }
});

export const reportSchema = z.object({
  memorialId: z.uuid(),
  reason: z.string().trim().min(5).max(500),
});

export function validationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Проверьте введённые данные";
}
