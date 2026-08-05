import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ValidationError } from "./domain/questionnaire.js";

const SAFE_ID = /^[a-zA-Z0-9-]{1,100}$/u;
const BLIND_COMPARISON_SUMMARY =
  "Оцените сочетание трёх черт и положение пяти шкал, не пытаясь определить источник варианта.";

function assertSafeId(id) {
  if (!SAFE_ID.test(id)) {
    throw new ValidationError("Некорректный идентификатор профиля.");
  }
}

function revisionFileName(revision) {
  return `revision-${String(revision).padStart(4, "0")}.json`;
}

function comparableProfile(profile) {
  return {
    summary: BLIND_COMPARISON_SUMMARY,
    signatureTraits: profile.signatureTraits.slice(0, 3).map(({ label }) => ({ label })),
    dimensions: profile.dimensions.map(({ id, label, score }) => ({ id, label, score })),
    candidates: [],
  };
}

function genericProfile() {
  return {
    summary: BLIND_COMPARISON_SUMMARY,
    signatureTraits: [
      { label: "Спокойно принимает близость и внимание" },
      { label: "Предпочитает знакомый распорядок" },
      { label: "Умеренно активен и легко переключается" },
    ],
    dimensions: [
      { id: "human_sociability", label: "Контакт с людьми", score: 0.65 },
      { id: "activity_playfulness", label: "Активность и игра", score: 0.58 },
      { id: "novelty_confidence", label: "Отношение к новому", score: 0.52 },
      { id: "independence_closeness", label: "Близость и самостоятельность", score: 0.72 },
      { id: "persistence_engagement", label: "Настойчивость", score: 0.55 },
    ],
    candidates: [],
  };
}

function normalizeIds(value) {
  return Array.isArray(value) ? [...new Set(value.map(String))] : [];
}

export class ProfileNotFoundError extends Error {
  constructor() {
    super("Профиль не найден.");
    this.name = "ProfileNotFoundError";
    this.statusCode = 404;
  }
}

export class ProfileService {
  constructor({ analyzer, profilesDir, clock = () => new Date(), idFactory = randomUUID }) {
    this.analyzer = analyzer;
    this.profilesDir = profilesDir;
    this.clock = clock;
    this.idFactory = idFactory;
  }

  async initialize() {
    await mkdir(this.profilesDir, { recursive: true });
  }

  async create(rawInput) {
    const result = await this.analyzer.analyze(rawInput);
    const id = this.idFactory();
    assertSafeId(id);
    const timestamp = this.clock().toISOString();
    const profile = {
      schemaVersion: "pet-personality/0.1",
      id,
      revision: 1,
      status: "draft",
      createdAt: timestamp,
      revisionCreatedAt: timestamp,
      revisionReason: "initial-analysis",
      pet: {
        name: result.input.petName,
        species: result.input.species,
      },
      intake: result.input,
      analysis: result.analysis,
      summary: result.summary,
      signatureTraits: result.signatureTraits,
      dimensions: result.dimensions,
      candidates: result.candidates,
      evidence: result.evidence,
      identityObservations: result.identityObservations ?? [],
      dataQuality: result.dataQuality ?? null,
    };

    await this.#writeRevision(profile);
    return profile;
  }

  async get(id, revision = null) {
    assertSafeId(id);
    const revisionNumber = revision ?? (await this.#latestRevisionNumber(id));
    try {
      const contents = await readFile(
        path.join(this.profilesDir, id, revisionFileName(revisionNumber)),
        "utf8",
      );
      return JSON.parse(contents);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new ProfileNotFoundError();
      }
      throw error;
    }
  }

  async listRevisions(id) {
    assertSafeId(id);
    const directory = path.join(this.profilesDir, id);
    let files;
    try {
      files = await readdir(directory);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new ProfileNotFoundError();
      }
      throw error;
    }

    const revisions = [];
    for (const file of files.filter((item) => /^revision-\d{4}\.json$/u.test(item)).sort()) {
      const profile = JSON.parse(await readFile(path.join(directory, file), "utf8"));
      revisions.push({
        revision: profile.revision,
        status: profile.status,
        revisionReason: profile.revisionReason,
        revisionCreatedAt: profile.revisionCreatedAt,
      });
    }
    return revisions;
  }

  async review(id, rawReview) {
    const current = await this.get(id);
    const accepted = new Set(normalizeIds(rawReview?.acceptedEvidenceIds));
    const rejected = new Set(normalizeIds(rawReview?.rejectedEvidenceIds));
    const knownIds = new Set(current.evidence.map((item) => item.id));

    for (const evidenceId of [...accepted, ...rejected]) {
      if (!knownIds.has(evidenceId)) {
        throw new ValidationError(`Неизвестное доказательство: ${evidenceId}`);
      }
    }
    for (const evidenceId of accepted) {
      if (rejected.has(evidenceId)) {
        throw new ValidationError(`Нельзя одновременно принять и отклонить ${evidenceId}.`);
      }
    }

    const profile = structuredClone(current);
    profile.revision += 1;
    profile.status = "owner-reviewed";
    profile.revisionCreatedAt = this.clock().toISOString();
    profile.revisionReason = "owner-evidence-review";
    profile.evidence = profile.evidence.map((item) => ({
      ...item,
      reviewStatus: accepted.has(item.id)
        ? "owner-confirmed"
        : rejected.has(item.id)
          ? "owner-rejected"
          : item.reviewStatus,
    }));

    const evidenceById = new Map(profile.evidence.map((item) => [item.id, item]));
    const updateInference = (item) => {
      const statuses = item.evidenceIds.map((evidenceId) => evidenceById.get(evidenceId)?.reviewStatus);
      if (statuses.includes("owner-confirmed")) {
        return { ...item, status: "owner-confirmed", confidence: Math.min(1, item.confidence + 0.12) };
      }
      if (statuses.every((status) => status === "owner-rejected")) {
        return { ...item, status: "owner-rejected", confidence: Math.round(item.confidence * 35) / 100 };
      }
      return item;
    };

    profile.dimensions = profile.dimensions.map(updateInference);
    profile.candidates = profile.candidates.map(updateInference);
    const dimensionById = new Map(profile.dimensions.map((item) => [item.id, item]));
    profile.signatureTraits = profile.signatureTraits.filter(
      (trait) => dimensionById.get(trait.dimensionId)?.status !== "owner-rejected",
    );
    const labels = profile.signatureTraits.map((trait) => trait.label);
    profile.summary = labels.length
      ? `${profile.pet.name}: ${labels.join(", ")}. Профиль обновлён после проверки владельцем.`
      : `${profile.pet.name}: выраженные черты из первой версии отклонены; нужны новые наблюдения.`;

    await this.#writeRevision(profile);
    return profile;
  }

  async getComparison(id) {
    const profile = await this.get(id);
    const actualSide = this.#actualSide(profile);
    const actual = comparableProfile(profile);
    const generic = genericProfile();
    return {
      comparisonId: `${profile.id}:${profile.revision}`,
      revision: profile.revision,
      prompt: `Какой профиль больше похож на ${profile.pet.name}?`,
      options: actualSide === "A" ? { A: actual, B: generic } : { A: generic, B: actual },
    };
  }

  async submitComparison(id, selection) {
    if (!new Set(["A", "B"]).has(selection)) {
      throw new ValidationError("Выберите профиль A или B.");
    }
    const profile = await this.get(id);
    const actualSide = this.#actualSide(profile);
    const evaluation = {
      id: randomUUID(),
      profileId: profile.id,
      revision: profile.revision,
      createdAt: this.clock().toISOString(),
      selectedSide: selection,
      actualSide,
      recognized: selection === actualSide,
      testType: "owner-blind-generic-comparison",
    };
    const evaluationsDir = path.join(this.profilesDir, profile.id, "evaluations");
    await mkdir(evaluationsDir, { recursive: true });
    await this.#atomicWrite(path.join(evaluationsDir, `${evaluation.id}.json`), evaluation);
    return {
      correct: evaluation.recognized,
      actualSide,
      message: evaluation.recognized
        ? "Вы выбрали профиль, построенный по вашим наблюдениям."
        : "Generic-профиль оказался убедительнее. Это важный сигнал: текущих данных недостаточно или выводы слишком общие.",
    };
  }

  #actualSide(profile) {
    const byte = createHash("sha256").update(`${profile.id}:${profile.revision}`).digest()[0];
    return byte % 2 === 0 ? "A" : "B";
  }

  async #latestRevisionNumber(id) {
    const revisions = await this.listRevisions(id);
    if (revisions.length === 0) {
      throw new ProfileNotFoundError();
    }
    return revisions.at(-1).revision;
  }

  async #writeRevision(profile) {
    const directory = path.join(this.profilesDir, profile.id);
    await mkdir(directory, { recursive: true });
    await this.#atomicWrite(path.join(directory, revisionFileName(profile.revision)), profile);
  }

  async #atomicWrite(targetPath, value) {
    const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    await rename(temporaryPath, targetPath);
  }
}
