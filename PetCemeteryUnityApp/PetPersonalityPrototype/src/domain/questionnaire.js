export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.details = details;
  }
}

export const QUESTIONNAIRE = [
  {
    id: "human_sociability",
    label: "Контакт с людьми",
    prompt: "Как питомец обычно встречает знакомого человека?",
    lowTrait: "избирательный в общении",
    highTrait: "тянется к людям",
    choices: {
      "-2": "отходит или прячется",
      "-1": "держит дистанцию и наблюдает",
      "0": "реагирует спокойно",
      "1": "сам подходит поздороваться",
      "2": "ярко радуется и ищет контакт",
    },
  },
  {
    id: "activity_playfulness",
    label: "Активность и игра",
    prompt: "Что происходит, когда ему предлагают любимую игру?",
    lowTrait: "спокойный созерцатель",
    highTrait: "азартный игрок",
    choices: {
      "-2": "почти всегда предпочитает отдых",
      "-1": "играет недолго",
      "0": "играет по настроению",
      "1": "охотно включается",
      "2": "сам инициирует и долго продолжает",
    },
  },
  {
    id: "novelty_confidence",
    label: "Отношение к новому",
    prompt: "Как питомец ведёт себя в новом месте или рядом с новым предметом?",
    lowTrait: "осторожный исследователь",
    highTrait: "смелый исследователь",
    choices: {
      "-2": "избегает и долго не приближается",
      "-1": "осматривается с безопасного расстояния",
      "0": "постепенно привыкает",
      "1": "довольно быстро подходит изучить",
      "2": "сразу исследует первым",
    },
  },
  {
    id: "independence_closeness",
    label: "Близость и самостоятельность",
    prompt: "Как он обычно проводит спокойное время рядом с хозяином?",
    lowTrait: "самостоятельный",
    highTrait: "ищет близость",
    choices: {
      "-2": "выбирает отдельное место",
      "-1": "остаётся неподалёку, но без контакта",
      "0": "чередует близость и уединение",
      "1": "часто устраивается рядом",
      "2": "следует за хозяином и просит контакта",
    },
  },
  {
    id: "persistence_engagement",
    label: "Настойчивость",
    prompt: "Что он делает, если лакомство или игрушка сразу недоступны?",
    lowTrait: "легко переключается",
    highTrait: "упорно добивается своего",
    choices: {
      "-2": "быстро теряет интерес",
      "-1": "делает одну попытку и уходит",
      "0": "немного пробует или ждёт помощи",
      "1": "возвращается и пробует снова",
      "2": "долго ищет разные способы",
    },
  },
];

const allowedSpecies = new Set(["dog", "cat", "other"]);
const allowedScores = new Set([-2, -1, 0, 1, 2]);

function normalizeParagraphs(value, maxItems, maxLength) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(/\n\s*\n/u);
  return source
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLength));
}

export function normalizePersonalityInput(raw) {
  const errors = [];
  const petName = String(raw?.petName ?? "").trim().slice(0, 80);
  const species = String(raw?.species ?? "").trim();
  const answers = {};

  if (!petName) {
    errors.push("Укажите имя питомца.");
  }

  if (!allowedSpecies.has(species)) {
    errors.push("Выберите вид питомца.");
  }

  for (const question of QUESTIONNAIRE) {
    const score = Number(raw?.answers?.[question.id]);
    if (!allowedScores.has(score)) {
      errors.push(`Нужен ответ на вопрос «${question.label}».`);
    } else {
      answers[question.id] = score;
    }
  }

  const stories = normalizeParagraphs(raw?.stories, 12, 2_000);
  const videoObservations = normalizeParagraphs(raw?.videoObservations, 12, 2_000);

  if (![...stories, ...videoObservations].some((item) => item.length >= 20)) {
    errors.push("Добавьте хотя бы одну историю или наблюдение длиной от 20 символов.");
  }

  if (errors.length > 0) {
    throw new ValidationError("Данные анкеты неполны.", errors);
  }

  return {
    petName,
    species,
    answers,
    stories,
    videoObservations,
  };
}
