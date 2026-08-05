# Agent Work Summary

Date: 2026-08-01 17:19:29 +03:00

## Current State

An isolated Pet Avatar prototype exists under `PetCemeteryUnityApp/`. It accepts
photos through a local Web UI, creates a downloadable ZIP with a rigged GLB, and
loads that GLB through a custom Unity importer. The current reconstruction
provider is deliberately procedural and only validates integration; it does not
produce a recognizable likeness from the submitted photos.

The local Web service is currently configured at `http://127.0.0.1:4177`. A
crash caused by an unhandled missing `/favicon.ico` promise rejection was fixed,
and the service remained healthy after a 404 request.

The user has now selected a local-first, split-service direction: develop the
entire stack on the current machine, then move only the AI reconstruction worker
and model weights to a separate V100 machine.

## Thematic Thread Breakdown

### Virtual pet product concept

- The broader direction is a Unity/mobile virtual pet based on a real animal's
  photos, videos, and texts.
- The first engineering milestone is narrower: photos in, recognizable rigged
  dog model out, packaged for Unity.

### Integration prototype

- A standalone Node.js Web UI/API accepts 1-20 JPEG, PNG, or WebP files.
- It creates a rigged GLB, textures, manifest, preview, and downloadable ZIP.
- Unity scripts build a `SkinnedMeshRenderer`, skeleton, and test tail motion.
- The browser preview shown to the user was a flat procedural silhouette. The
  user correctly rejected it as not being the requested reconstruction.

### AI versus LLM

- A general LLM is not the core reconstruction engine.
- Specialized vision/3D stages are required: segmentation, multi-view pose and
  shape fitting, texture reconstruction, confidence estimation, rigging, and
  GLB export.
- LLM use remains optional for future dialogue, personality, text processing,
  and orchestration.

### Scalable deployment direction

- Initially run Web/API, queue, object storage, metadata, and worker locally.
- Keep the procedural provider as a fast `mock` profile.
- Add a lighter `local-low` profile suitable for development on the GTX 1060,
  accepting slow inference or reduced resolution.
- Move only the worker to a V100 host later; keep API and Unity contracts stable.
- Use object URIs or signed HTTP URLs instead of Windows-local file paths so a
  remote worker can consume the same job contract.

## Topic Theses

1. **The current output is infrastructure evidence, not product value.** A valid
   rigged GLB is useful, but success requires recognizable resemblance.
2. **Use a shared dog topology and skeleton.** Fit proportions, face, ears, tail,
   coat, and texture rather than freely generating unrelated meshes; this keeps
   all avatars compatible with common Unity animations.
3. **Make GPU inference a replaceable worker.** Job APIs, storage, artifacts, and
   Unity must not depend on one model or GPU host.
4. **Design for remote execution now.** Shared object storage and versioned job
   schemas prevent a later rewrite when the worker moves to V100.
5. **Hardware support is not yet proven.** V100 16/32 GB feasibility, latency,
   and concurrency depend on the selected reconstruction model and require a
   benchmark.

## Intent And Integration Context

The conversation moved from informational architecture discussion to
preparation for implementation. The user wants a real service that can first be
debugged entirely on the current Windows machine and then distributed across a
main service machine and a GPU machine.

Local component mapping:

- `PetCemeteryUnityApp/PetAvatarPrototype/`: current Web/API and mock provider;
- `PetCemeteryUnityApp/My project (1)/Assets/PetAvatarPrototype/`: Unity consumer;
- future queue and S3-compatible storage: transport boundary;
- future reconstruction worker: specialized AI inference and artifact producer;
- V100 host: later deployment target for that worker only.

No external reconstruction API or model has been selected. Docker Compose,
Redis, MinIO, Python worker, and the four runtime profiles are architecture
decisions/planned components, not yet implemented services.

## Code, Architecture, Or Business Logic Changes

- Added the standalone Web upload/job/download prototype and procedural GLB
  generator under `PetCemeteryUnityApp/PetAvatarPrototype/`.
- Added Unity runtime loader, editor importer, tail animation driver, and batch
  verifier under the existing Unity project's `Assets/PetAvatarPrototype/`.
- Added scoped ignores for Unity-generated state, local uploads, generated
  artifacts, logs, and future dependencies.
- Fixed the static-file route by awaiting file operations so missing files are
  converted to HTTP 404 instead of terminating the server.
- Added a regression assertion that `/favicon.ico` returns 404 and health stays
  available.
- Added human documentation for the virtual-pet concept, reconstruction design,
  current prototype, and scalable local-to-V100 service architecture.
- Added durable project-memory contracts for the prototype artifact and accepted
  split-service deployment direction.

## Verification Evidence

- `npm run check`: 4/4 tests passed.
- Tests cover GLB mesh/skin/animation structure, deterministic shape variation,
  ZIP entries, full HTTP upload/status/preview/download, and the favicon crash
  regression.
- Unity 6000.3.10f1 batch verification succeeded with 480 vertices, 240
  triangles, and 14 bones.
- Live checks returned HTTP 200 for `/`, healthy provider status for
  `/api/health`, HTTP 404 for `/favicon.ico`, and healthy status again afterward.

## Known Failures Or Caveats

- The generated dog is a procedural low-poly placeholder and does not resemble
  the uploaded animal.
- The preview is a flat PNG, not an interactive browser 3D viewer.
- No real segmentation, multi-view fitting, texturing, confidence map, or AI
  rigging provider is connected.
- Redis, S3-compatible storage, Docker Compose, and a separate worker do not yet
  exist in code.
- No reconstruction model, model license, dataset license, or V100 compatibility
  benchmark has been selected or verified.
- The worktree contains uncommitted task files plus an unrelated/unclassified
  `photo/` directory; preserve it and do not inspect or modify it without scope.

## Next Best Steps

1. Split the current provider behind a versioned job/result worker contract.
2. Add local Docker Compose with API, worker, Redis, and MinIO while retaining
   the procedural provider as `mock`.
3. Add real segmentation and input-quality/range estimation.
4. Select a commercially usable dog parametric model and reconstruction stack.
5. Implement `local-low`, interactive browser GLB preview, and confidence data.
6. Benchmark the same worker image on the target V100 before selecting production
   quality and concurrency settings.

## Handoff Notes

The user does not consider a technically valid generic dog sufficient. Future
work must lead with recognizable reconstruction and must label mock output
unambiguously. Do not present the procedural provider as AI reconstruction.

The detailed agreed architecture is in
`docs/PET_AVATAR_SCALABLE_AI_SERVICE.md`. Existing reconstruction research is in
`docs/UNITY_AI_PET_3D_RECONSTRUCTION.md`, and the implementation contract is in
`tools/project-memory/specs/pet-avatar-prototype.md`.
