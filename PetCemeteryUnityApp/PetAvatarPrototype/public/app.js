const elements = {
  form: document.querySelector("#upload-form"),
  photos: document.querySelector("#photos"),
  dropZone: document.querySelector("#drop-zone"),
  selection: document.querySelector("#selection"),
  selectionCount: document.querySelector("#selection-count"),
  selectionSize: document.querySelector("#selection-size"),
  clearSelection: document.querySelector("#clear-selection"),
  thumbs: document.querySelector("#thumbs"),
  coatColor: document.querySelector("#coat-color"),
  submit: document.querySelector("#submit-button"),
  emptyState: document.querySelector("#empty-state"),
  jobState: document.querySelector("#job-state"),
  jobTitle: document.querySelector("#job-title"),
  jobMessage: document.querySelector("#job-message"),
  jobProvider: document.querySelector("#job-provider"),
  progress: document.querySelector(".progress"),
  progressBar: document.querySelector("#progress-bar"),
  progressValue: document.querySelector("#progress-value"),
  jobId: document.querySelector("#job-id"),
  preview: document.querySelector("#preview"),
  downloadActions: document.querySelector("#download-actions"),
  downloadLink: document.querySelector("#download-link"),
  newJob: document.querySelector("#new-job"),
  activeProvider: document.querySelector("#active-provider"),
};

let selectedFiles = [];
let currentJob = null;
let pollTimer = null;
let thumbUrls = [];

const providerLabels = {
  "bite-d-smal": "BITE/D-SMAL — реальная AI-реконструкция, research-only; сейчас геометрия строится по первому фото",
  "canonical-sf3d": "Canonical + Stable Fast 3D — AI-реконструкция статической текстурированной модели",
  "procedural-prototype": "процедурная заглушка — проверяет интеграцию, но не воспроизводит внешность питомца",
};

async function loadActiveProvider() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = await response.json();
    if (!response.ok || !health.ok) throw new Error(health.error ?? "health check failed");
    elements.activeProvider.textContent = providerLabels[health.provider] ?? health.provider;
  } catch {
    elements.activeProvider.textContent = "не удалось прочитать состояние сервиса";
  }
}

function pluralizePhotos(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} фотография`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} фотографии`;
  return `${count} фотографий`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function clearThumbs() {
  for (const url of thumbUrls) URL.revokeObjectURL(url);
  thumbUrls = [];
  elements.thumbs.replaceChildren();
}

async function estimateCoatColor(files) {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const totals = [0, 0, 0];
  let samples = 0;

  for (const file of files.slice(0, 8)) {
    try {
      const bitmap = await createImageBitmap(file);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let index = 0; index < pixels.length; index += 16) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const brightness = (red + green + blue) / 3;
        if (brightness < 25 || brightness > 238) continue;
        totals[0] += red;
        totals[1] += green;
        totals[2] += blue;
        samples += 1;
      }
    } catch {
      // A manually selected color remains available when a browser cannot decode a file.
    }
  }

  if (samples === 0) return;
  const hex = totals
    .map((total) => Math.round(total / samples).toString(16).padStart(2, "0"))
    .join("");
  elements.coatColor.value = `#${hex}`;
}

async function setFiles(files) {
  const accepted = [...files]
    .filter((file) => ["image/jpeg", "image/png", "image/webp"].includes(file.type))
    .slice(0, 20);
  selectedFiles = accepted;
  clearThumbs();

  elements.selection.hidden = accepted.length === 0;
  elements.submit.disabled = accepted.length === 0;
  elements.selectionCount.textContent = pluralizePhotos(accepted.length);
  elements.selectionSize.textContent = formatBytes(accepted.reduce((total, file) => total + file.size, 0));

  for (const file of accepted.slice(0, 12)) {
    const url = URL.createObjectURL(file);
    thumbUrls.push(url);
    const image = document.createElement("img");
    image.src = url;
    image.alt = file.name;
    elements.thumbs.append(image);
  }
  await estimateCoatColor(accepted);
}

function resetJobView() {
  currentJob = null;
  if (pollTimer) clearTimeout(pollTimer);
  elements.emptyState.hidden = false;
  elements.jobState.hidden = true;
  elements.jobState.classList.remove("has-error");
  elements.preview.hidden = true;
  elements.preview.removeAttribute("src");
  elements.downloadActions.hidden = true;
  elements.form.reset();
  void setFiles([]);
}

function renderJob(job) {
  currentJob = job;
  elements.emptyState.hidden = true;
  elements.jobState.hidden = false;
  elements.jobProvider.textContent = job.provider;
  elements.jobMessage.textContent = job.error ?? job.message;
  elements.progressBar.style.width = `${job.progress}%`;
  elements.progress.setAttribute("aria-valuenow", String(job.progress));
  elements.progressValue.textContent = `${job.progress}%`;
  elements.jobId.textContent = job.id.slice(0, 8);
  elements.submit.disabled = !["ready", "failed"].includes(job.status);

  if (job.status === "ready") {
    elements.jobTitle.textContent = "Пакет готов";
    elements.preview.src = `${job.previewUrl}?v=${Date.now()}`;
    elements.preview.hidden = false;
    elements.downloadLink.hidden = false;
    elements.downloadLink.href = job.downloadUrl;
    elements.downloadActions.hidden = false;
  } else if (job.status === "failed") {
    elements.jobTitle.textContent = "Обработка завершилась ошибкой";
    elements.jobState.classList.add("has-error");
    elements.downloadActions.hidden = false;
    elements.downloadLink.hidden = true;
  } else {
    elements.jobTitle.textContent = "Создаём 3D-питомца";
  }
}

async function pollJob() {
  if (!currentJob || ["ready", "failed"].includes(currentJob.status)) return;
  try {
    const response = await fetch(`/api/jobs/${currentJob.id}`, { cache: "no-store" });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error ?? "Не удалось получить состояние задания");
    renderJob(job);
    if (!["ready", "failed"].includes(job.status)) pollTimer = setTimeout(pollJob, 650);
  } catch (error) {
    elements.jobMessage.textContent = error.message;
    pollTimer = setTimeout(pollJob, 1500);
  }
}

elements.dropZone.addEventListener("click", () => elements.photos.click());
elements.photos.addEventListener("change", () => setFiles(elements.photos.files));
elements.clearSelection.addEventListener("click", () => setFiles([]));
elements.newJob.addEventListener("click", resetJobView);

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
}

elements.dropZone.addEventListener("drop", (event) => setFiles(event.dataTransfer.files));

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (selectedFiles.length === 0) return;

  const form = new FormData();
  for (const file of selectedFiles) form.append("photos", file, file.name);
  form.append("coatColor", elements.coatColor.value);
  elements.submit.disabled = true;
  renderJob({
    id: "pending00",
    provider: "подготовка",
    status: "uploading",
    progress: 3,
    message: "Загружаем фотографии на локальный сервер",
  });

  try {
    const response = await fetch("/api/jobs", { method: "POST", body: form });
    const job = await response.json();
    if (!response.ok) throw new Error(job.error ?? "Не удалось создать задание");
    renderJob(job);
    pollTimer = setTimeout(pollJob, 300);
  } catch (error) {
    renderJob({
      id: "error000",
      provider: "upload",
      status: "failed",
      progress: 100,
      message: error.message,
      error: error.message,
    });
  }
});

void loadActiveProvider();
