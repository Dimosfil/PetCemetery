const form = document.querySelector("#intake-form");
const message = document.querySelector("#form-message");
const resultPanel = document.querySelector("#result-panel");
let currentProfile = null;

const dimensionNames = {
  human_sociability: ["избирательный", "общительный"],
  activity_playfulness: ["спокойный", "активный"],
  novelty_confidence: ["осторожный", "смелый"],
  independence_closeness: ["самостоятельный", "ищет близость"],
  persistence_engagement: ["переключается", "настойчивый"],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    ...options,
    headers: isFormData ? options.headers : { "content-type": "application/json", ...options.headers },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.details?.join(" ") || body.error || "Ошибка запроса.");
  }
  return body;
}

function dimensionMarkup(dimension) {
  const poles = dimensionNames[dimension.id] ?? ["ниже", "выше"];
  return `
    <div class="dimension">
      <div class="dimension-title">
        <strong>${escapeHtml(dimension.label)}</strong>
        <span>${Math.round(dimension.confidence * 100)}% confidence</span>
      </div>
      <div class="scale"><i style="width:${Math.round(dimension.score * 100)}%"></i></div>
      <div class="scale-labels"><span>${escapeHtml(poles[0])}</span><span>${escapeHtml(poles[1])}</span></div>
    </div>`;
}

function evidenceMarkup(item) {
  const checked = item.reviewStatus !== "owner-rejected" ? "checked" : "";
  const status = item.reviewStatus === "pending" ? "нужно проверить" : item.reviewStatus;
  return `
    <label class="evidence-card">
      <input type="checkbox" data-evidence-id="${escapeHtml(item.id)}" ${checked} />
      <span class="checkmark" aria-hidden="true"></span>
      <span class="evidence-body">
        <span class="evidence-meta">${escapeHtml(item.sourceType)} · ${escapeHtml(status)}</span>
        <strong>${escapeHtml(item.candidateInterpretation)}</strong>
        <span>«${escapeHtml(item.observation)}»</span>
      </span>
    </label>`;
}

function renderProfile(profile) {
  currentProfile = profile;
  const traitMarkup = profile.signatureTraits.length
    ? profile.signatureTraits.map((trait) => `<span>${escapeHtml(trait.label)}</span>`).join("")
    : "<span>нужно больше наблюдений</span>";
  const candidateMarkup = profile.candidates.length
    ? profile.candidates
        .map(
          (item) =>
            `<li><span>${escapeHtml(item.kind)}</span><strong>${escapeHtml(item.label)}</strong></li>`,
        )
        .join("")
    : "<li><span>пока нет</span><strong>Добавьте более конкретные истории</strong></li>";

  resultPanel.className = "panel result-panel";
  const cost = profile.analysis.usage.estimatedCostUsd;
  const quality = profile.dataQuality?.personalityInferenceReadiness ?? "unknown";
  const identityMarkup = profile.identityObservations?.length
    ? `<div class="subsection">
        <div class="subsection-title"><h3>Что видно на медиа</h3><span>identity / context</span></div>
        <ul class="observation-list">${profile.identityObservations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
      </div>`
    : "";
  resultPanel.innerHTML = `
    <div class="result-topline">
      <span class="analysis-pill">${escapeHtml(profile.analysis.engine)}</span>
      <span>версия ${profile.revision}</span>
    </div>
    <p class="eyebrow">Гипотеза характера</p>
    <h2>${escapeHtml(profile.pet.name)}</h2>
    <p class="summary">${escapeHtml(profile.summary)}</p>
    <div class="trait-list">${traitMarkup}</div>
    <div class="readiness-line ${escapeHtml(quality)}">Готовность характера: <b>${escapeHtml(quality)}</b></div>
    <div class="cost-line">
      <span>Токены <b>${profile.analysis.usage.totalTokens ?? profile.analysis.usage.inputTokens + profile.analysis.usage.outputTokens}</b></span>
      <span>Стоимость <b>${cost === null ? "считать по тарифу модели" : `$${Number(cost).toFixed(4)}`}</b></span>
    </div>
    ${identityMarkup}
    <div class="subsection">
      <div class="subsection-title"><h3>Пять осей</h3><span>не диагноз</span></div>
      ${profile.dimensions.map(dimensionMarkup).join("")}
    </div>
    <div class="subsection">
      <div class="subsection-title"><h3>Привычки и предпочтения</h3><span>кандидаты</span></div>
      <ul class="candidate-list">${candidateMarkup}</ul>
    </div>
    <div class="subsection">
      <div class="subsection-title"><h3>Почему система так решила</h3><span>отметьте верное</span></div>
      <div class="evidence-list">${profile.evidence.map(evidenceMarkup).join("")}</div>
      <button id="save-review" class="secondary-button" type="button">Сохранить проверку как новую версию</button>
    </div>
    <div class="warning-box">
      <strong>Ограничение baseline</strong>
      <p>${escapeHtml(profile.analysis.warnings.join(" "))}</p>
    </div>
    <div id="comparison-root" class="subsection comparison-root"></div>`;

  document.querySelector("#save-review").addEventListener("click", saveReview);
  if (quality === "insufficient") {
    document.querySelector("#comparison-root").innerHTML = `
      <div class="warning-box"><strong>A/B-тест пока недоступен</strong><p>Статические фото не дали устойчивого профиля. Добавьте видео с последовательностью поведения.</p></div>`;
  } else {
    loadComparison();
  }
}

async function saveReview(event) {
  const button = event.currentTarget;
  button.disabled = true;
  const checkboxes = [...resultPanel.querySelectorAll("[data-evidence-id]")];
  const acceptedEvidenceIds = checkboxes.filter((item) => item.checked).map((item) => item.dataset.evidenceId);
  const rejectedEvidenceIds = checkboxes.filter((item) => !item.checked).map((item) => item.dataset.evidenceId);
  try {
    const profile = await api(`/api/profiles/${currentProfile.id}/review`, {
      method: "POST",
      body: JSON.stringify({ acceptedEvidenceIds, rejectedEvidenceIds }),
    });
    renderProfile(profile);
  } catch (error) {
    button.disabled = false;
    window.alert(error.message);
  }
}

function comparisonOption(side, profile) {
  return `
    <label class="comparison-card">
      <input type="radio" name="comparison" value="${side}" />
      <span class="comparison-letter">${side}</span>
      <strong>${escapeHtml(profile.summary)}</strong>
      <span>${profile.signatureTraits.map((item) => escapeHtml(item.label)).join(" · ")}</span>
      <ul>${profile.dimensions
        .map(
          (item) =>
            `<li>${escapeHtml(item.label)}: ${Math.round(Number(item.score) * 100)}%</li>`,
        )
        .join("")}</ul>
    </label>`;
}

async function loadComparison() {
  const root = document.querySelector("#comparison-root");
  try {
    const comparison = await api(`/api/profiles/${currentProfile.id}/comparison`);
    root.innerHTML = `
      <div class="subsection-title"><h3>Слепой smoke-test</h3><span>шаг 3 / 3</span></div>
      <p class="comparison-prompt">${escapeHtml(comparison.prompt)} Оба варианта показаны в одинаковом формате; один построен по данным, второй является контрольным.</p>
      <div class="comparison-grid">
        ${comparisonOption("A", comparison.options.A)}
        ${comparisonOption("B", comparison.options.B)}
      </div>
      <button id="submit-comparison" class="secondary-button" type="button">Проверить выбор</button>
      <div id="comparison-result" class="comparison-result" role="status"></div>`;
    document.querySelector("#submit-comparison").addEventListener("click", submitComparison);
  } catch (error) {
    root.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  }
}

async function submitComparison() {
  const selected = document.querySelector('input[name="comparison"]:checked')?.value;
  const output = document.querySelector("#comparison-result");
  if (!selected) {
    output.textContent = "Сначала выберите A или B.";
    return;
  }
  try {
    const result = await api(`/api/profiles/${currentProfile.id}/comparison`, {
      method: "POST",
      body: JSON.stringify({ selected }),
    });
    output.className = `comparison-result ${result.correct ? "success" : "miss"}`;
    output.textContent = `${result.message} Реальный профиль: ${result.actualSide}.`;
  } catch (error) {
    output.textContent = error.message;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  const data = new FormData(form);
  const mediaCount = data.getAll("photos").filter((file) => file.size > 0).length + data.getAll("videos").filter((file) => file.size > 0).length;
  if (mediaCount === 0) {
    message.textContent = "Добавьте хотя бы одну фотографию или видео.";
    return;
  }
  submitButton.disabled = true;
  message.textContent = "Извлекаем кадры, отправляем vision-запрос и связываем выводы с таймкодами…";
  data.delete("mediaConsent");

  try {
    const profile = await api("/api/media-profiles", { method: "POST", body: data });
    message.textContent = `Черновик сохранён: ${profile.id}`;
    renderProfile(profile);
    resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false;
  }
});

for (const input of form.querySelectorAll('input[type="file"]')) {
  input.addEventListener("change", () => {
    const photos = form.elements.photos.files.length;
    const videos = form.elements.videos.files.length;
    document.querySelector("#media-selection").textContent = `Выбрано: фото — ${photos}, видео — ${videos}.`;
  });
}
