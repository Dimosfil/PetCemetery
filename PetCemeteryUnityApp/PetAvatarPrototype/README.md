# Pet Avatar Prototype

## Canonical image to Stable Fast 3D service

`canonical-sf3d` connects the existing upload/job/preview/download API to two
configurable HTTP processors:

```text
pet photos -> canonicalizer (optional for one prepared image) -> Stable Fast 3D
           -> validated static UV/PBR GLB -> preview -> ZIP
```

The canonicalizer contract is `multipart/form-data` with repeated `photos`
fields and a JSON `spec` field; it must return image bytes with an `image/*`
content type. The SF3D contract is `multipart/form-data` with one `image` field;
it must return GLB bytes as `model/gltf-binary` or `application/octet-stream`.
Authorization header values are optional environment variables and are never
written to job metadata or output artifacts.

Example configuration:

```powershell
$env:PET_AVATAR_PROVIDER = 'canonical-sf3d'
$env:PET_AVATAR_CANONICALIZER_URL = 'https://canonicalizer.example/v1/canonicalize'
$env:PET_AVATAR_SF3D_URL = 'https://sf3d-worker.example/v1/generate'
$env:PET_AVATAR_CANONICAL_SF3D_ALLOW_REMOTE = 'true'
$env:PET_AVATAR_CANONICAL_SF3D_LICENSE_MODE = 'enterprise'
$env:PET_AVATAR_PREVIEW_EXECUTABLE = 'D:\path\to\python.exe'
$env:PET_AVATAR_PREVIEW_SCRIPT = "$PWD\scripts\render_rigged_preview.py"
npm start
```

Set `PET_AVATAR_CANONICALIZER_AUTHORIZATION` and
`PET_AVATAR_SF3D_AUTHORIZATION` when the processors require an Authorization
header. To smoke-test one already canonicalized standing image, omit
`PET_AVATAR_CANONICALIZER_URL` and upload exactly one image. Submitting multiple
photos without a canonicalizer fails explicitly.

The same path can be exercised through the real job queue without binding an
HTTP port:

```powershell
npm run sf3d:job -- 'D:\path\to\canonical-standing.png'
```

`PET_AVATAR_CANONICAL_SF3D_ALLOW_REMOTE=true` is mandatory because the profile
uploads pet images to configured processors. Choose `research`, `community`, or
`enterprise` license mode to record the rights context of each artifact; the
setting documents operator intent and does not grant rights by itself.

The provider accepts only GLB 2.0 output with positions, normals, UVs, a PBR
material, and embedded textures. Its package contains `pet.glb`, `preview.png`,
`avatar.json`, and `README.md`; the intermediate canonical image is deliberately
excluded. This profile is a textured static-mesh base. It does not claim a rig,
skin weights, animation, watertight geometry, or measured likeness confidence.

## Dog-specific provider v2

The Web/API runtime has a fail-fast boundary and a local research adapter for
BITE/D-SMAL. The default remains `procedural-prototype`; downloaded BITE code,
weights, and Conda environments stay in ignored local runtime directories and
are not bundled by this repository.

For non-commercial education/testing under the upstream research license, run
the prepared local adapter with the reproducible launcher:

```powershell
npm run check:bite:research
npm run start:bite:research
```

The check command validates the BITE checkout, adapter, and Python dependencies
without binding the Web port. The start command selects `bite-d-smal`, resolves
the prepared Python runtime, and opens the existing Web/API workflow with the
real research provider. It intentionally prints the non-commercial license
warning on every launch.

Advanced/manual configuration remains available with:

```powershell
$env:PET_AVATAR_PROVIDER = 'bite-d-smal'
$env:PET_AVATAR_BITE_LICENSE_MODE = 'research'
$env:PET_AVATAR_BITE_EXECUTABLE = 'D:\AI\PetCemetery\.tmp\bite-env-official\python.exe'
$env:PET_AVATAR_BITE_ADAPTER = "$PWD\scripts\bite_research_adapter.py"
npm start
```

The local adapter uses the official BITE Gradio release and checkpoints, runs
single-image dog fitting, unwraps the shared SMAL mesh with xatlas, and adds the
prototype dog rig. Apply the zero-context compatibility patch with
`git apply --unidiff-zero scripts/runtime-shims/bite-gradio-research.patch` to
a clean local Gradio checkout before starting the adapter. The verified CPU smoke path completes in
about 20-25 seconds on this workstation with test-time optimization disabled.

The adapter maps raw SMAL coordinates (`X` body length, `Y` lateral, `Z` up) to
the Unity contract (`X` lateral, `Y` up, `Z` body length). It projects the
visible coat from the segmented dog foreground of the first photograph into
the UV atlas, keeping only the largest connected foreground component so
disconnected people, feet, and background fragments cannot contaminate the
coat. Vertices hidden from that
camera receive colour from the nearest visible vertex reflected across SMAL's
lateral (`Y`) axis; the longitudinal (`X`) axis must never be reflected because
that swaps head and tail markings. Empty atlas padding is dilated from
the closest textured texel. This is a real single-view albedo, but unseen coat
markings remain an approximation. The Web preview is rendered from the produced
GLB in five views, so it shows the reconstructed mesh rather than echoing the
uploaded source photograph. Multi-view fitting and native SMAL skin weights are
not yet implemented and must not be presented as complete reconstruction.

The server invokes the adapter without a shell and passes
`--request <absolute-json-path>`. The JSON contains the job ID, all local photo
paths, the output directory, and the required canonical-pose, topology, UV,
rigging, texture, and confidence capabilities. The adapter must write:

```text
pet.glb
preview.png
avatar.json
textures/albedo.png (unless the GLB embeds its image)
```

The provider rejects an output unless the GLB contains `POSITION`, `NORMAL`,
`TEXCOORD_0`, `JOINTS_0`, `WEIGHTS_0`, a skin, a verification animation, and a
textured material. `avatar.json` must declare `provider: "bite-d-smal"`,
`species: "dog"`, `aiReconstruction: true`, `uvMapped: true`, source photo
count, topology, skeleton, and numeric geometry confidence.

`research` mode must be used only for the non-commercial scientific,
educational, or artistic purposes permitted by the upstream license. It is not
production permission. A future commercial deployment must use `commercial`
mode only after commercial rights have been obtained from the BITE/D-SMAL
rights holder.

## Experimental local AI path (2026-08-01)

The repository now contains a reproducible experimental path from one clean,
standing dog reference to a recognizable, vertex-coloured, rigged Unity GLB:

```powershell
cd "PetCemeteryUnityApp\PetAvatarPrototype"
.\scripts\setup-local-ai.ps1
.\scripts\reconstruct-local.ps1 -InputImage ".\dog-standing.png" -OutputDirectory ".\artifacts\dog-ai"
```

The output directory contains `pet.glb`, `avatar.json`, `preview.png`, and the
intermediate static TripoSR mesh. The AI mesh is converted from TripoSR X-up to
Unity Y-up, fitted to the shared 14-bone dog skeleton, assigned geometric skin
weights, and keeps the reconstruction's vertex colours. The Unity loader uses a
dedicated URP vertex-colour shader for this profile.

This path is a validated prototype, not a finished universal photo pipeline.
For the supplied pet photos, the dog was lying down, so an identity-preserving
standing reference had to be synthesized before reconstruction. A production
version still needs an automated multi-photo canonicalizer or an articulated
animal reconstruction model, quality/confidence reporting, and owner likeness
acceptance tests. The Web UI continues to use `procedural-prototype`; the local
AI command is intentionally isolated until those criteria are met.

TripoSR code and public model weights are MIT-licensed. The runtime is pinned to
`107cefdc244c39106fa830359024f6a2f1c78871`; setup downloads the weights from
`stabilityai/TripoSR` and keeps the third-party runtime and model cache outside
Git. Upstream sources: <https://github.com/VAST-AI-Research/TripoSR> and
<https://huggingface.co/stabilityai/TripoSR>.

Изолированный сквозной прототип первого этапа:

```text
фотографии собаки
→ Web UI
→ задание реконструкции
→ rigged GLB
→ ZIP-пакет
→ Unity Viewer
```

## Текущий уровень

Прототип реализует весь контракт загрузки, фоновой обработки, скачивания и просмотра. Встроенный `procedural-prototype` provider создаёт валидную низкополигональную собаку со скелетом и тестовой анимацией. Цвет и часть пропорций детерминированно зависят от загруженных фотографий.

Это инфраструктурный и интеграционный прототип, а не production AI-реконструкция внешности. Настоящая модель подключается через контракт reconstruction provider без изменения Web UI, API, формата задания и Unity Viewer.

## Запуск

Требуется Node.js 24 или новее.

```powershell
cd "PetCemeteryUnityApp\PetAvatarPrototype"
npm start
```

Открыть:

```text
http://127.0.0.1:4177
```

Загрузка по умолчанию принимает от 1 до 20 файлов JPEG, PNG или WebP размером до 12 МБ каждый и до 120 МБ на одно задание.

## Результат

Кнопка скачивания возвращает архив:

```text
pet-avatar.zip
├── pet.glb
├── textures/
│   ├── albedo.png
│   ├── normal.png
│   └── fur-mask.png
├── avatar.json
├── preview.png
└── README.md
```

`pet.glb` содержит mesh, skeleton, skin weights, материал и анимацию `TailWag`.

## Unity Viewer

Viewer расположен в существующем Unity-проекте:

```text
..\My project (1)\Assets\PetAvatarPrototype\
```

После компиляции скриптов:

1. Распаковать скачанный ZIP.
2. В Unity выбрать `Pet Avatar Prototype > Import generated pet.glb`.
3. Выбрать файл `pet.glb`.
4. Viewer создаст объект со `SkinnedMeshRenderer`, костями и вращением камеры.

Loader намеренно поддерживает минимальный glTF/GLB-профиль, генерируемый этим прототипом. Для production следует заменить его проверенной runtime glTF-библиотекой или сборкой Addressables/AssetBundles.

## API

### `POST /api/jobs`

`multipart/form-data`:

- `photos` — один или несколько файлов;
- `coatColor` — вычисленный Web UI цвет в формате `#RRGGBB`.

### `GET /api/jobs/{id}`

Возвращает состояние и прогресс задания.

### `GET /api/jobs/{id}/preview`

Возвращает PNG-превью после завершения.

### `GET /api/jobs/{id}/download`

Скачивает итоговый ZIP.

### `DELETE /api/jobs/{id}`

Удаляет локальные материалы и артефакты завершённого задания.

## Reconstruction provider

Контракт находится в `src/pipeline/reconstruction-provider.js`. Следующий AI provider должен получить:

- список локальных путей к изображениям;
- каталог результата;
- параметры задания и отмены;
- функции прогресса.

Он обязан вернуть те же файлы и метаданные, что и процедурный provider.

## Проверка

```powershell
npm test
```

Тесты проверяют структуру rigged GLB, ZIP-пакет и полный HTTP-сценарий загрузки/обработки/скачивания.

## Приватность прототипа

- Сервер слушает только `127.0.0.1` по умолчанию.
- Runtime-каталог `var/jobs/` исключён из Git.
- Загруженные фотографии удаляются после успешного формирования пакета, если `PET_AVATAR_KEEP_UPLOADS` не установлен в `true`.
- В скачиваемый архив исходные фотографии не входят.
