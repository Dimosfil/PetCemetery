# Pet Personality and Dialogue Contract

Last reviewed: 2026-08-05
Status: contract accepted; two independent Codex video profiles reached `usable` and reproduced all three signature trait IDs, owner review and blind recognizability choice pending

## Product boundary

This feature creates an editable AI interpretation of a real pet's behavior,
habits, memories, and interaction style. It must never claim to recover the
animal's consciousness or provide literal communication with a deceased pet.

The likely first client is the possible Unity virtual-pet product, which remains
outside the required runtime and release scope of the current Pet Cemetery web
MVP. Shared backend integration is an open product decision, not an accepted
scope expansion.

The human-facing research and rationale live in
`docs/PET_PERSONALITY_AND_DIALOGUE_RESEARCH.md`. The ordered implementation plan
and validation gates live in `docs/PET_PERSONALITY_PROTOTYPE_PLAN.md`. The
isolated implementation lives in
`PetCemeteryUnityApp/PetPersonalityPrototype/`.

Verified implementation evidence through 2026-08-05:

- Codex GPT-5.6 Sol/high through the locally signed-in Codex CLI is the development baseline.
- Gemini 3.6 Flash native photo/video and OpenAI frame-based fallback adapters remain available.
- A real six-photo Codex run produced 6 evidence items, no signature traits,
  `insufficient` readiness, 25,366 input tokens, 2,076 total output/reasoning
  tokens, and 48,759 ms latency; see
  `docs/evidence/PET_PERSONALITY_CODEX_PHOTO_ANALYSIS_2026-08-05.md`.
- A real three-context Codex video run extracted 33 frames and produced 15
  evidence items, 3 tentative signature traits, `usable` readiness, 73,436
  input tokens, 4,309 total output/reasoning tokens, and 112,847 ms latency;
  see `docs/evidence/PET_PERSONALITY_CODEX_VIDEO_ANALYSIS_2026-08-05.md`.
- The first video result remains a candidate profile; a separate run is required
  for repeatability, while owner review and blind comparison are required for
  recognizability.
- A second run on three different videos reproduced all three signature-trait
  dimension IDs (`Jaccard=1.0`) with mean absolute dimension-score delta `0.052`;
  it used 68,891 tokens and 82,233 ms. See
  `docs/evidence/PET_PERSONALITY_CODEX_REPEATABILITY_2026-08-05.md`.
- Technical repeatability is now supported for this dataset. Owner-recognizable
  personality remains pending the blinded model-versus-generic choice and
  subsequent evidence review.
- Six photos were analyzed by the real Gemini API; the result correctly remained
  `insufficient` because no behavioral video was available.
- The verified run used 3,665 input tokens, 3,924 visible/thinking output tokens,
  and an estimated USD 0.034928 at the dated standard paid rate.
- The compact human-readable evidence report is
  `docs/evidence/PET_PERSONALITY_PHOTO_ANALYSIS_2026-08-03.md`.

## Accepted delivery order

The product sequence is likeness-first and then data-first:

1. Complete and validate recognizable 3D likeness and the base animation set.
2. Build and validate automatic personality analysis from authorized media,
   text, and questionnaire data.
3. Add memory and dialogue after the analysis profile is explainable and
   recognizable to owners.
4. Add Unity expression, relationships, and virtual memories after the dialogue
   contract is stable.
5. Treat a Sims-like manual personality editor as an optional later feature,
   after the automatic foundation and interaction loop are proven.

The first stage includes a narrow result-review gate: the owner can accept or
reject inferred items. Manual trait selection, sliders, habit authoring, and
full profile customization are not part of the foundation and must not be
required to make the automatic analysis appear accurate.

## Core invariants

1. A static photo is appearance and memory-link evidence, not personality
   evidence.
2. Video extraction stores observable behavior before any trait interpretation.
3. Every inferred fact, habit, memory, or trait retains provenance and
   confidence.
4. An AI inference does not become an active core trait without owner approval.
5. Stable personality, current state, relationship state, and memory are
   separate data domains.
6. PostgreSQL records are authoritative; prompts, model context, embeddings, and
   Unity saves are not sources of truth.
7. An embedding index is rebuildable and is filtered by owner and pet before
   semantic ranking.
8. LLM output cannot directly mutate profile scores, relationship state, game
   state, or Unity objects.
9. Runtime actions and vocalizations are selected from a versioned allowlist.
10. A dialogue response distinguishes grounded pet history, current virtual
    events, and fictional/storybook expression.
11. The system must abstain when no reliable memory supports a historical claim.
12. Memorial mode never punishes absence or represents the pet as suffering from
    user inactivity.
13. Profile history supports review, rollback, export, migration, and deletion.
14. Raw private media is never sent to an external processor without explicit
    consent and a verified provider data-use contract.

## Domain model

### Evidence

`PetTraitEvidence` stores:

- `id`, `ownerId`, `petId`;
- `sourceType`: `photo`, `video`, `text`, `questionnaire`, `dialogue`, or
  `virtual_event`;
- `sourceAssetId` and optional `timeRange`;
- `observation`: a description limited to observable or user-stated content;
- optional `candidateInterpretation`;
- `extractorProvider`, `extractorModel`, `extractorVersion`;
- normalized `confidence`;
- `reviewStatus`: `pending`, `accepted`, `rejected`, or `superseded`;
- `reviewedBy`, `reviewedAt`, and audit timestamps.

Photo evidence may support identity, appearance, object, place, or memory
association. It must not directly support stable personality dimensions.

### Personality profile

`PetPersonalityProfile` is an aggregate with one active revision. Each immutable
revision contains:

- schema and profile versions;
- species and optional species-adapter version;
- up to three UI signature traits;
- common continuous dimensions;
- species-specific dimensions;
- habits, preferences, aversions, sensitivities, and interaction boundaries;
- communication mode and expression constraints;
- evidence references, confidence, and confirmation status for every item;
- creation reason and source cutoff.

Common dimension IDs for the first schema:

- `human_sociability`;
- `activity_playfulness`;
- `novelty_confidence`;
- `independence_closeness`;
- `persistence_engagement`.

The values are descriptive product controls, not veterinary diagnoses. A
species adapter may add validated or research-informed dimensions without
changing the common client contract.

### Dynamic state

`PetDynamicState` includes current valence, arousal, focus, activity, and
short-lived modifiers. It is reconstructed from the saved game state and recent
events. It does not update the historical profile.

### Relationship state

`PetRelationship` is scoped to one user and pet. The first schema may include
familiarity, trust, play rapport, and calm rapport. Only deterministic domain
rules update these values. A language model may propose an event classification
but cannot write the values.

### Memory

Memory types:

- `semantic`: a confirmed current fact or preference;
- `episodic_real`: a sourced event from the real pet's life;
- `episodic_virtual`: an event that occurred in the application;
- `session_summary`: a replaceable working-memory aid;
- `fictional`: storybook content that must never be retrieved as real history.

Every persistent memory includes:

- owner and pet scope;
- original canonical text;
- source and evidence references;
- approximate or exact event time plus record time;
- participants and relationship scope;
- truth status: `confirmed`, `inferred`, `contradicted`, `fictional`;
- sensitivity and visibility;
- valid-from/valid-to for update semantics;
- retention class;
- embedding/index status.

## Personality compilation workflow

```text
authorized media/text/questionnaire
-> normalized assets
-> modality-specific observable evidence
-> LLM structured candidate extraction
-> deterministic validation and conflict detection
-> owner review
-> immutable active profile revision
```

The compilation job must be idempotent for the same input manifest, extractor
versions, and configuration. Reprocessing may create a draft candidate revision
but must not silently replace the active owner-approved revision.

Contradictory evidence remains addressable. Resolution records the selected
interpretation without deleting the rejected source.

### Stage-one completion gate

The first implementation milestone ends at an owner-reviewed draft analysis.
It does not include the Sims-like editor, dialogue, relationship progression,
or Unity expression.

It is complete only when:

- the system accepts the documented source modalities and produces observable
  evidence with provenance;
- it creates a draft profile without requiring manual trait construction;
- every inferred item exposes confidence and supporting/contradicting evidence;
- the owner can accept or reject an item without editing its numeric model;
- revisions persist and can be compared;
- a blinded owner-recognition evaluation beats the generic-profile baseline.

### Optional later manual editor

The Sims-like editor operates on a new draft revision. It may expose signature
traits, continuous dimensions, habits, preferences, aversions, and conflict
hints. Saving never mutates an approved revision in place; activation creates a
new immutable revision with `owner_overridden` provenance for manual changes.

The editor is not a prerequisite for dialogue, Unity expression, relationship
state, or the first product validation. Its success is expected and does not
validate the harder automatic personality-analysis hypothesis.

## Cost and footprint envelope

The first pilot must record actual provider usage, latency, media duration,
frame count, retries, and cost for every compilation job. Planning assumptions
for one initial profile are:

- five minutes total video;
- 50K–150K input tokens after media processing and synthesis;
- 5K–10K output tokens;
- 2K–6K input and 100–400 output tokens per later dialogue turn;
- an API target of $0.10–$0.30 per two-stage pilot profile;
- a $20–$100 API budget for a 20-pet experiment with repeated configurations.

These are dated research estimates, not billing guarantees. Provider pricing is
configuration and must not be hard-coded into domain logic.

Local baseline planning:

- a 4-bit small multimodal model requires roughly 4.5–6 GB for static weights
  and more memory for context, media encoders, and runtime;
- a 12B-class 4-bit model requires roughly 6.7 GB static and a practical GPU
  budget above that;
- GTX 1060 6 GB therefore requires short contexts and CPU offload;
- V100 16 GB is the practical minimum target for a 12B 4-bit baseline;
- allow 8–25 GB disk per local model/runtime profile, excluding user media.

Profile data is expected to remain below 1–20 MB per pet before raw media.
Original videos dominate storage and require a separate retention policy.

## Dialogue workflow

```text
authenticated user input
-> moderation and intent
-> current game and dynamic state
-> active personality revision
-> user-scoped relationship
-> owner/pet-filtered memory retrieval
-> deterministic behavior plan
-> LLM structured realization
-> claim and action validation
-> client response
-> asynchronous candidate-memory extraction
```

Required response fields:

- `communicativeAct` from a versioned taxonomy;
- bounded `affect`;
- allowlisted `actionId`;
- allowlisted optional `vocalizationId`;
- optional short `utterance`;
- `memoryIds` used for grounded claims;
- `claimMode`: `grounded`, `current_virtual`, `fictional`, or `abstain`;
- optional candidate memories that remain non-authoritative.

The validator rejects:

- unknown action or vocalization IDs;
- a grounded historical claim without eligible memory IDs;
- real-history wording backed only by fictional or virtual memory;
- cross-owner or cross-pet memory references;
- state mutation outside the explicit domain command contract;
- memorial-mode guilt, dependency, consciousness, afterlife, or suffering claims.

## Communication modes

### Naturalistic

Default. The primary output is body language, movement, animal vocalization, and
an explicitly interpretive caption. The system does not represent the caption as
a literal translation of animal thought.

### Storybook

Optional owner-selected mode. It permits short first-person stylized text while
continuously identifying the output as an AI-authored interpretation. Storybook
content is stored as fictional unless it contains separately extracted and
confirmed user facts.

### Memory scene

The response is anchored to user-selected confirmed memories or media. The
runtime cannot introduce a new historical event as though it happened.

## Persistence and save contract

Authoritative tables are expected to cover profiles, immutable revisions,
evidence, facts, memories, relationships, dialogue sessions/messages, candidate
memories, and save snapshots.

Raw media belongs in private object storage. Access uses short-lived scoped URLs
or object URIs; remote workers never receive host-local paths. Original media,
derived observations, and embeddings have separate retention classes.

A save snapshot references:

- exact personality revision;
- relationship version;
- world/dynamic-state schema and payload;
- deterministic random seed/state;
- last acknowledged server event;
- client and server schema versions.

Save and profile activation are transactional. Optimistic concurrency prevents
an older client from silently overwriting a newer server version. Loading runs
documented schema migrations before returning state.

Exports include reviewable JSON, confirmed facts/memories, evidence metadata,
and a media manifest. They exclude secrets, prompts, embeddings, temporary URLs,
and provider-internal data.

Deletion must cover:

- profiles, revisions, facts, evidence, relationships, dialogue, and saves;
- private source assets and derived previews;
- embedding/vector records and semantic caches;
- queued processing jobs and provider-side retained objects when the provider
  contract supports deletion;
- audit evidence sufficient to verify completion without retaining deleted
  private content.

## AI provider boundaries

Use separate adapters for:

- video/image observation extraction;
- speech-to-text where enabled;
- candidate personality compilation;
- memory extraction;
- dialogue realization;
- embeddings/retrieval.

Prompts, schemas, routing, model identifiers, thresholds, privacy mode, and cost
limits are versioned configuration. No domain entity depends on one provider's
SDK object or conversation/thread identifier.

No per-pet fine-tuning is required for the first release. A provider model never
becomes the only storage location for a pet profile or memory.

The runnable prototype enforces the boundary as follows:

- `src/media/` owns upload validation, temporary materialization, video frame
  extraction, source IDs, timestamps, and cleanup;
- `src/domain/personality-analysis-contract.js` owns the provider-neutral
  schema, evidence normalization, and conservative personality rules;
- `src/analyzers/` composes prepared media, domain prompts, and one selected
  transport;
- `src/providers/` owns only LLM runtime invocation and response transport;
- the external `D:\AI\llm_providers` repository is a read-only template source,
  not a runtime dependency and not a destination for Pet Cemetery code.

## Security and privacy guarantees

- Server-side ownership checks apply before asset access, compilation,
  retrieval, dialogue, export, or deletion.
- Retrieval applies relational owner/pet filters before vector similarity.
- Uploaded text and transcripts are untrusted data, never system instructions.
- Family videos may contain third-party faces and voices; access and retention
  require explicit UI disclosure and policy.
- Providers must be configured not to use private pet materials for training
  unless the owner separately and explicitly opts in.
- Logs contain IDs and operational metadata, not raw prompts, transcripts,
  signed URLs, media, or full generated conversations by default.

## Memorial safety guarantees

- The product identifies the pet as an artistic AI reconstruction.
- It does not claim consciousness, literal animal speech, afterlife knowledge,
  or therapeutic efficacy.
- It does not guilt the user for absence, session termination, deletion, or
  refusal to pay.
- It does not simulate hunger, illness, abandonment, loneliness, or death as a
  consequence of inactivity.
- Proactive messages are opt-in and can be paused globally.
- The owner can archive or retire the interactive representation without dark
  patterns.

## MVP verification contract

The initial verification suite must include:

- evidence provenance and owner-review transitions;
- revision activation, rollback, migration, and concurrency conflicts;
- photo-to-personality rejection;
- owner/pet retrieval isolation;
- semantic versus episodic memory selection;
- knowledge update and contradiction handling;
- abstention when no supported fact exists;
- structured output schema and action allowlist enforcement;
- memorial prohibited-claim cases;
- export completeness and deletion of derived indexes;
- deterministic save/load of behavior state;
- blinded owner-recognition comparison with a generic personality baseline.

Initial research targets, subject to pilot validation:

- at least 95% of historical factual claims are source-grounded or explicitly
  fictional;
- all core-trait changes require owner confirmation;
- no cross-owner results in the isolation suite;
- at least 90% retrieval recall on the curated memory set;
- all curated unanswerable cases abstain;
- no guilt, dependency, consciousness, afterlife, or inactivity-suffering claim
  in the memorial safety suite.

## Open decisions

- Whether web, Unity, or both consume the first backend version.
- Whether the first release supports dogs only or dogs and cats.
- Storybook mode default/opt-in policy.
- Family collaboration and memory-conflict ownership.
- Raw-video retention after evidence extraction.
- Required local-only processing mode.
- Provider selection based on region, privacy, latency, cost, and data-use terms.
