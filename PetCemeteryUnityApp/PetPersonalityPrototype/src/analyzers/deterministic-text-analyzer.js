import { QUESTIONNAIRE, normalizePersonalityInput } from "../domain/questionnaire.js";

const CANDIDATE_RULES = [
  { pattern: /мяч|ball/iu, kind: "preference", label: "особый интерес к мячу" },
  { pattern: /игруш|toy/iu, kind: "preference", label: "любит знакомые игрушки" },
  { pattern: /прогул|гуля|walk/iu, kind: "preference", label: "ценит прогулки" },
  { pattern: /плав|вода|купат|swim|water/iu, kind: "preference", label: "заметно реагирует на воду" },
  { pattern: /машин|поездк|car ride|drive/iu, kind: "preference", label: "по-особому относится к поездкам" },
  { pattern: /двер|встреча|ждал|ждала|door|greet/iu, kind: "habit", label: "ритуал встречи у двери" },
  { pattern: /спал|спала|лежал|лежала|диван|кресл|sleep|sofa/iu, kind: "habit", label: "устойчивый ритуал отдыха" },
  { pattern: /прят|гром|шум|пылесос|гроза|hide|thunder|vacuum/iu, kind: "sensitivity", label: "чувствительность к пугающим событиям" },
  { pattern: /гост|незнаком|stranger|guest/iu, kind: "sensitivity", label: "особая реакция на незнакомых людей" },
];

function round(value) {
  return Math.round(value * 100) / 100;
}

function excerpt(text, maxLength = 220) {
  const compact = text.replace(/\s+/gu, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`;
}

function dimensionInterpretation(question, value) {
  if (value <= -1) {
    return `Кандидат в черту: ${question.lowTrait}.`;
  }
  if (value >= 1) {
    return `Кандидат в черту: ${question.highTrait}.`;
  }
  return `По оси «${question.label}» поведение выглядит гибким и зависит от ситуации.`;
}

function buildSummary(petName, signatureTraits) {
  const labels = signatureTraits.map((trait) => trait.label);
  if (labels.length === 0) {
    return `${petName} пока описан нейтрально: для характерного портрета нужны дополнительные истории.`;
  }
  return `${petName}: ${labels.join(", ")}. Это черновая гипотеза, которую должен проверить владелец.`;
}

export class DeterministicTextAnalyzer {
  constructor() {
    this.name = "deterministic-text-baseline";
  }

  async analyze(rawInput) {
    const input = normalizePersonalityInput(rawInput);
    const evidence = [];
    const dimensions = [];
    let evidenceIndex = 0;

    for (const question of QUESTIONNAIRE) {
      const value = input.answers[question.id];
      const evidenceId = `evidence-${++evidenceIndex}`;
      evidence.push({
        id: evidenceId,
        sourceType: "questionnaire",
        sourceField: question.id,
        observation: question.choices[String(value)],
        candidateInterpretation: dimensionInterpretation(question, value),
        confidence: value === 0 ? 0.64 : 0.78,
        reviewStatus: "pending",
      });
      dimensions.push({
        id: question.id,
        label: question.label,
        score: round((value + 2) / 4),
        confidence: value === 0 ? 0.64 : 0.78,
        status: "inferred",
        evidenceIds: [evidenceId],
      });
    }

    const candidates = [];
    const seenCandidateLabels = new Set();
    const sources = [
      ...input.stories.map((text) => ({ text, sourceType: "owner_story" })),
      ...input.videoObservations.map((text) => ({ text, sourceType: "described_video_observation" })),
    ];

    for (const source of sources) {
      for (const rule of CANDIDATE_RULES) {
        if (!rule.pattern.test(source.text) || seenCandidateLabels.has(rule.label)) {
          continue;
        }
        seenCandidateLabels.add(rule.label);
        const evidenceId = `evidence-${++evidenceIndex}`;
        evidence.push({
          id: evidenceId,
          sourceType: source.sourceType,
          sourceField: source.sourceType === "owner_story" ? "stories" : "videoObservations",
          observation: excerpt(source.text),
          candidateInterpretation: `Возможный паттерн: ${rule.label}.`,
          confidence: 0.56,
          reviewStatus: "pending",
        });
        candidates.push({
          id: `candidate-${candidates.length + 1}`,
          kind: rule.kind,
          label: rule.label,
          confidence: 0.56,
          status: "inferred",
          evidenceIds: [evidenceId],
        });
      }
    }

    const questionById = new Map(QUESTIONNAIRE.map((question) => [question.id, question]));
    const signatureTraits = dimensions
      .map((dimension) => ({
        dimensionId: dimension.id,
        label:
          dimension.score < 0.5
            ? questionById.get(dimension.id).lowTrait
            : questionById.get(dimension.id).highTrait,
        strength: round(Math.abs(dimension.score - 0.5) * 2),
        confidence: dimension.confidence,
      }))
      .filter((trait) => trait.strength > 0)
      .sort((left, right) => right.strength - left.strength)
      .slice(0, 3);

    return {
      input,
      analysis: {
        engine: this.name,
        engineVersion: "0.1.0",
        generatedByModel: false,
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostUsd: 0,
        },
        warnings: [
          "Это детерминированный text-first baseline, а не заключение о психологии животного.",
          "Фото и видеофайлы пока не анализируются: учитываются только описанные владельцем наблюдения.",
          "Кандидаты в привычки получены простыми прозрачными правилами и требуют подтверждения.",
        ],
      },
      summary: buildSummary(input.petName, signatureTraits),
      signatureTraits,
      dimensions,
      candidates,
      evidence,
    };
  }
}
