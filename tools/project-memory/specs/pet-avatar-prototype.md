# Pet Avatar Prototype Contract

Last reviewed: 2026-08-02

## Status and boundary

`PetCemeteryUnityApp/PetAvatarPrototype/` is an isolated reconstruction spike for
the possible future Unity product. It is not part of the current Pet Cemetery web
runtime, API, database, Docker image, or release scope.

The default provider is `procedural-prototype`. It validates integration and
artifact contracts but does not reconstruct a recognizable animal from photos.
Do not describe its output as AI likeness reconstruction. The selectable
`canonical-sf3d` profile is an experimental AI path that emits a textured static
mesh under the narrower contract below; it is not a completed rigged avatar.

## Workflow contract

```text
1-20 JPEG/PNG/WebP photos
-> local Web UI and multipart job API
-> asynchronous reconstruction provider
-> preview and downloadable ZIP
-> extracted pet.glb
-> Unity prototype loader
-> SkinnedMeshRenderer with shared skeleton
```

The Web UI and API must remain provider-independent. A future multi-view AI
implementation replaces the reconstruction provider, not the upload, job-status,
download, or Unity consumption contracts.

## Artifact contract

The downloadable `pet-avatar.zip` contains:

- `pet.glb`: GLB 2.0 mesh, material, skin, shared bone hierarchy, and at least one
  test animation;
- `textures/albedo.png`, `textures/normal.png`, `textures/fur-mask.png`;
- `avatar.json`: provider, format, units, coordinate system, quality metadata, and
  explicit `aiReconstruction` flag;
- `preview.png`;
- `README.md`.

Original photos must not be included in the downloadable artifact. Local uploads
are deleted after successful processing unless explicitly retained for debugging.

## Current implementation invariants

- Default binding is loopback-only at `127.0.0.1:4177`.
- Accepted upload count is 1-20; per-file and total byte limits are enforced.
- Runtime jobs and generated artifacts are ignored by Git.
- The procedural provider derives deterministic shape variation from input bytes
  and receives a browser-estimated coat color.
- Unity's narrow prototype GLB loader only promises compatibility with this
  generator's GLB profile. Production should use a maintained glTF runtime or a
  server-built Addressables/AssetBundle path.

## Verification evidence

On 2026-08-01:

- `npm run check` passed 4/4 tests;
- tests covered GLB mesh/skin/animation, deterministic shape variation, ZIP entries,
  and the full HTTP upload/status/preview/download flow;
- Unity 6000.3.10f1 batch verification loaded the generated sample successfully;
- observed model: 480 vertices, 240 triangles, 14 bones.

### Experimental AI proof (2026-08-01)

- Five supplied photos of the same dog were canonicalized into one neutral
  standing reference because every original showed a reclining pose.
- TripoSR at pinned revision `107cefdc244c39106fa830359024f6a2f1c78871`
  ran locally on the GTX 1060 6 GB with CUDA inference and a CPU marching-cubes
  compatibility layer.
- The selected TripoSR repository and published weights are MIT-licensed; the
  pinned sources are `github.com/VAST-AI-Research/TripoSR` and
  `huggingface.co/stabilityai/TripoSR`.
- The accepted static mesh was converted to Unity Y-up and auto-rigged with the
  existing `prototype-dog-v1` 14-bone hierarchy.
- Result: 24,478 vertices, 48,948 triangles, vertex colours, normalized skin
  weights, all 13 deforming bones weighted, and one tail animation.
- Unity 6000.3.10f1 batch verification emitted `PET_AVATAR_VERIFY_OK` for the AI
  GLB with 24,478 vertices, 48,948 triangles, and 14 bones.

This evidence upgrades the prototype from a procedural-only mesh to a proven
manual AI path. It does not complete the likeness milestone: the standing input
was synthesized, unseen-side geometry remains lower confidence, and owner
recognition has not been recorded. The Web provider therefore remains the mock.

### Stable Fast 3D proof (2026-08-02)

- Stability AI SF3D was tested from the official source revision
  `ff21fc491b4dc5314bf6734c7c0dabd86b5f5bb2` with the gated 4.02 GB weights.
  The model loads on the GTX 1060 6 GB after a narrow PyTorch 2.3 compatibility
  shim, but a full FP32 local run did not emit a GLB within 90 minutes. This GPU
  profile is therefore not an interactive or production worker candidate.
- Running an original belly-up photo through SF3D produced a real UV/PBR mesh
  (4,898 vertices, 7,188 triangles, and a 1024 px base texture), but its geometry
  preserved the reclining pose and reduced the legs to weak protrusions. SF3D
  reconstructs the visible pose; it does not canonicalize a pet into a useful
  standing avatar by itself.
- The successful path first synthesized a clean neutral standing three-quarter
  reference from four photos of the same dog, preserving recognizable facial and
  coat markings while inferring hidden anatomy. SF3D then emitted a 1.28 MB GLB
  with 13,816 vertices, 17,704 triangles, complete `TEXCOORD_0`, one PBR material,
  and 2048 px base-color and normal textures. The five-view preview shows a
  coherent standing body, four legs, head, and tail rather than a flat projection
  or checker material.
- Ignored evidence lives under
  `PetCemeteryUnityApp/PetAvatarPrototype/artifacts/sf3d-remote/`, including the
  canonical reference, the resulting GLB, and the five-view preview. The preview
  renderer now samples UV/PBR textures through Trimesh before falling back to
  vertex colors.
- This is a viable textured static-mesh base, not a completed avatar contract:
  the mesh is not watertight and has no skin, shared skeleton, animation, or
  owner-recognition result. Generated hidden-side appearance remains inferred.
  The public demonstration endpoint used for this proof is not an approved
  production processor for private pet photos; production must use the existing
  controlled reconstruction-worker boundary.

### Canonical SF3D service profile (2026-08-02)

- `canonical-sf3d` now plugs into the existing `JobService` without changing the
  public upload, status, preview, download, or delete endpoints.
- A configurable canonicalizer receives repeated multipart `photos` plus a
  neutral-standing dog specification and returns image bytes. For a one-image
  smoke test it can be omitted, in which case that image is treated as an
  already canonicalized reference.
- A separately configurable SF3D endpoint receives the canonical image and must
  return binary GLB. Both processors support optional Authorization headers
  sourced only from environment variables.
- Remote processing is fail-closed until the operator explicitly sets the
  remote-photo consent flag and records `research`, `community`, or `enterprise`
  license mode. The flag and mode do not replace provider consent, privacy, or
  licensing review.
- Provider validation requires GLB positions, normals, UV coordinates, a PBR
  material, and embedded textures. The output metadata explicitly declares a
  static, non-rigged, non-animated mesh with unavailable numeric confidence.
- The ZIP includes `pet.glb`, `preview.png`, `avatar.json`, and `README.md`.
  Original photos and the canonical intermediate are deliberately excluded.
- The preview is rendered from the returned GLB through the existing Python
  renderer. Generated GLB statistics are calculated from accessors instead of
  trusting remote metadata.
- A live `JobService` smoke run completed on 2026-08-02 using the accepted
  canonical standing reference and the remote SF3D proof endpoint. Job
  `bb074cf1-e85f-4481-b84f-98db303e69af` reached `ready`, emitted a 1,285,296
  byte GLB with 14,100 vertices and 17,884 triangles, rendered a five-view PBR
  preview, and packaged the four-file ZIP. The job input directory was removed
  after success as required by the default privacy policy.
- The Node verification suite passes 11/11 tests, including remote-consent and
  license fail-closed behavior, multi-photo canonicalizer request shape,
  one-image passthrough, embedded-texture GLB validation, packaging, and the
  pre-existing end-to-end HTTP workflow.

## Required next milestone

Select and validate a commercially usable dog reconstruction provider using a
representative photo set. The milestone is not complete until owners recognize
their dogs, licensing permits the intended product, low-confidence regions are
reported, and the provider emits the existing artifact contract.

### Dog-specific provider v2 boundary (2026-08-01)

- `bite-d-smal` is now a selectable external provider profile while
  `procedural-prototype` remains the default.
- The Node runtime does not bundle, clone, download, or silently accept the
  public BITE/D-SMAL research release. That release is restricted to
  non-commercial scientific research and its required assets are gated behind
  registration; the product requires separately obtained commercial rights.
- Enabling the profile requires an absolute runtime executable, an absolute
  adapter entry point, and explicit `research` or `commercial` license mode in
  runtime configuration. `research` is limited to the non-commercial uses
  granted by the upstream license and must never be treated as production
  permission.
- The adapter receives a versioned JSON request with all source photos and must
  emit the existing `pet.glb`, `preview.png`, `avatar.json`, and texture
  contract without changing Web/API or Unity job semantics.
- Provider validation requires a dog avatar, shared topology and skeleton IDs,
  numeric geometry confidence, UV coordinates, skin weights, a textured
  material, and a verification animation before packaging succeeds.
- A local research-only adapter now runs the official BITE Gradio checkpoint on
  CPU, with local runtime compatibility patches stored in
  `scripts/runtime-shims/bite-gradio-research.patch`. The downloaded code,
  checkpoints, Conda environment, and generated meshes remain ignored runtime
  data rather than Git content.
- The reproducible local Web/API entrypoint is `npm run start:bite:research`.
  It resolves and validates the prepared Python environment before binding,
  selects `bite-d-smal` with explicit research-only mode, and fails early when
  the model checkout, adapter, or required Python packages are missing.
  `npm run check:bite:research` performs the same runtime validation without
  starting the HTTP service. The UI reads `/api/health` and identifies whether
  the active provider is real AI or the procedural integration stub.
- Verified on 2026-08-01 with the selected standing-dog reference: raw BITE
  inference completed in about 22 seconds and emitted the expected 3,889-vertex
  SMAL mesh. The project postprocessor produced a 5,320-vertex seam-expanded
  xatlas mesh with 7,774 triangles, `TEXCOORD_0`, normals, prototype skin
  weights, one skin, and one verification animation.
- The complete Node provider path validated and packaged `pet.glb`,
  `preview.png`, `avatar.json`, and `textures/albedo.png` into
  `pet-avatar.zip`. All seven Node tests and `git diff --check` passed.
- The adapter now projects visible vertex colours from BITE's fitted camera
  into the xatlas UV layout, rejecting pixels outside BITE's predicted dog
  foreground and discarding every connected mask component except the largest
  dog silhouette. Hidden vertices use nearest bilateral transfer across raw SMAL's
  lateral `Y` axis (never its head-to-tail `X` axis), and empty atlas padding
  uses nearest-texel dilation. The generated albedo is therefore based
  on the source dog rather than a checker placeholder or room/floor colours.
- Raw SMAL coordinates (`X` body length, `Y` lateral, `Z` up) are mapped to the
  Unity contract (`X` lateral, `Y` up, `Z` body length) before skeleton fitting,
  preview rendering, and export.
- The BITE preview is generated from the packaged GLB as a five-view render.
  It must never reuse the uploaded photograph as the preview because that would
  falsely imply that the reconstructed geometry had been visually verified.
- BITE inference may estimate a lying or sitting source pose, but the exported
  avatar uses the predicted body shape in the SMAL neutral-standing pose before
  UV unwrapping, rigging, and packaging. The first uploaded photo remains the
  current geometry and visible-texture source, so the UI explicitly asks for a
  clean full-body side view first. Multi-photo fitting is still not claimed.
- This is not likeness-complete: BITE itself exports no UV, textured material,
  skin, or animation. Multi-view fitting, reconstruction of genuinely unseen
  markings, and native SMAL weights remain open work.

## Accepted deployment direction

The reconstruction system will be local-first but split into independently
deployable services from the beginning:

- the main machine owns Web UI, job API, queue, metadata, and object storage;
- a reconstruction worker owns model inference and GLB generation;
- all components initially run locally for development;
- later only the worker and model weights move to a separate NVIDIA V100 host;
- Web UI, job schemas, object URIs, artifact contract, and Unity consumption do
  not change during that move.

Remote workers must never receive host-local filesystem paths. Inputs and
outputs use S3-compatible object URIs or short-lived authenticated HTTP URLs.
Redis, object storage, and worker control endpoints stay on a private network or
behind a VPN; they are not exposed directly to the public internet.

The procedural provider remains as the `mock` profile. Planned profiles are
`mock`, `local-low`, `gpu-v100`, and `gpu-large`. Actual V100 compatibility,
VRAM demand, latency, and concurrency remain hypotheses until a reconstruction
model is selected and benchmarked.
