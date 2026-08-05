# Pet Personality Prototype

Изолированный runnable-прототип второго продуктового риска: автоматического, объяснимого и узнаваемого профиля характера питомца. Он не входит в текущий web-MVP Pet Cemetery и не изменяет `PetAvatarPrototype` или Unity-проект.

Подробный порядок работ и критерии пилота: `../../docs/PET_PERSONALITY_PROTOTYPE_PLAN.md`.

## Запуск

Требуется Node.js 24+; внешних npm-зависимостей нет.

```powershell
cd D:\AI\PetCemetery\PetCemeteryUnityApp\PetPersonalityPrototype
npm start
```

Интерфейс: `http://127.0.0.1:4181`
Health: `http://127.0.0.1:4181/api/health`

Порт можно изменить переменной `PET_PERSONALITY_PORT`. Сервер намеренно слушает только loopback по умолчанию.

## Что делает media pipeline

1. Принимает до 12 фотографий и до 3 видео.
2. Media-модуль проверяет и материализует фото, а для frame-based анализаторов локально извлекает из видео кадры с таймкодами через `ffmpeg`.
3. Сохраняет наблюдаемые события по source ID и таймкоду отдельно от интерпретаций.
4. Строит пять versioned dimensions и до трёх signature traits только при достаточной последовательности поведения.
5. Показывает evidence, confidence, ограничения данных и фактический token usage.
6. Записывает owner review как новую ревизию.
7. Даёт слепое сравнение с generic-профилем только после появления содержательной гипотезы.

Основной development analyzer — `codex-multimodal:gpt-5.6-sol:high`. Он использует локально авторизованный Codex CLI только как транспорт к LLM; загрузка, проверка и подготовка медиа остаются в media-модуле прототипа. `gemini` сохраняет нативный video/audio path, а `openai` использует тот же общий frame-based media pipeline. Старый `deterministic-text-baseline` оставлен только как отдельный тестовый JSON API.

Приложение загружает `.env.local` и `.env` из корня Pet Cemetery. Ключи не записываются в profile JSON или логи.

```dotenv
PET_PERSONALITY_MEDIA_PROVIDER=codex
PET_PERSONALITY_CODEX_MODEL=gpt-5.6-sol
PET_PERSONALITY_CODEX_EFFORT=high
```

Codex использует текущую локальную ChatGPT-авторизацию (`codex login status`) и подписочные лимиты, а не `OPENAI_API_KEY`. Команду и таймаут можно переопределить через `PET_PERSONALITY_CODEX_COMMAND` и `PET_PERSONALITY_CODEX_TIMEOUT_MS`.

Для Gemini или OpenAI fallback:

```dotenv
PET_PERSONALITY_MEDIA_PROVIDER=gemini
GEMINI_API_KEY=...
PET_PERSONALITY_GEMINI_MODEL=gemini-3.6-flash

PET_PERSONALITY_MEDIA_PROVIDER=openai
OPENAI_API_KEY=...
PET_PERSONALITY_OPENAI_MODEL=gpt-5.6-terra
PET_PERSONALITY_OPENAI_REASONING_EFFORT=low
```

## Хранение

Локальные данные создаются в игнорируемой Git папке:

```text
var/profiles/<profile-id>/revision-0001.json
var/profiles/<profile-id>/revision-0002.json
var/profiles/<profile-id>/evaluations/<evaluation-id>.json
```

Ревизии не перезаписываются. В прототипе нет учётных записей и production ownership checks, поэтому сервер нельзя публиковать наружу и нельзя использовать для чувствительных реальных материалов.

## API

- `GET /api/health`
- `POST /api/media-profiles` — multipart `photos`, `videos`, `petName`, `species`, `ownerContext`
- `POST /api/profiles`
- `GET /api/profiles/:id`
- `GET /api/profiles/:id/revisions`
- `POST /api/profiles/:id/review`
- `GET /api/profiles/:id/comparison`
- `POST /api/profiles/:id/comparison`

Основная схема профиля — `pet-personality/0.1`. Общие dimension IDs совпадают с durable contract в `tools/project-memory/specs/pet-personality-dialogue.md`.

## Проверка

```powershell
npm run check
```

Проверяются синтаксис, модульные границы media/domain/provider, изолированный Codex transport, JSON Schema, нормализация анкеты, evidence, кириллица HTTP API, неизменяемые ревизии и запись blind-test evaluation.

## Фактически проверено

На трёх поведенческих видео из разных контекстов выполнен настоящий Codex Sol/high прогон: 33 кадра, 73 436 input, 3 450 visible output, 859 reasoning output, 77 745 total tokens и 112,847 секунды. Получено 15 observable evidence, readiness=`usable` и 3 tentative signature traits: предметная активность, продолжительное удержание внимания и взаимодействие с человеком в игре. Отчёт: `../../docs/evidence/PET_PERSONALITY_CODEX_VIDEO_ANALYSIS_2026-08-05.md`.

На независимом наборе из трёх других видео повторились все 3 signature-trait dimension ID: Jaccard=`1.0`, среднее абсолютное расхождение пяти dimension scores=`0.052`, readiness=`usable`. Второй прогон использовал 68 891 токен и занял 82,233 секунды. Отчёт: `../../docs/evidence/PET_PERSONALITY_CODEX_REPEATABILITY_2026-08-05.md`.

На тех же шести локальных фотографиях выполнен настоящий Codex Sol/high прогон через текущую ChatGPT-авторизацию: 25 366 input, 1 783 visible output, 293 reasoning output, 27 442 total tokens и 48,759 секунды. Получено 6 observable evidence, readiness=`insufficient`, signature traits не активированы. Отчёт: `../../docs/evidence/PET_PERSONALITY_CODEX_PHOTO_ANALYSIS_2026-08-05.md`.

На шести локальных фотографиях выполнен настоящий Gemini-запрос: 3 665 input tokens, 3 924 output/thinking tokens, 7 589 total, расчётная цена `$0.034928`. Backend корректно вернул `insufficient` и не активировал характер без видео. Отчёт: `../../docs/evidence/PET_PERSONALITY_PHOTO_ANALYSIS_2026-08-03.md`.

Следующая итерация — слепой выбор владельца между media-derived и generic-профилем, затем owner review evidence. Ручной Sims-like редактор в эту итерацию не входит.
