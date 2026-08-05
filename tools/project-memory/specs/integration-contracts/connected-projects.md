# Connected Projects

Last reviewed: 2026-08-05

## LLM Providers templates

- Local folder: `D:\AI\llm_providers`
- Role: read-only reference implementation for reusable LLM transport patterns.
- Current use: the Pet Personality prototype adapted the isolated Codex CLI
  invocation pattern into its own project-local provider module.
- Runtime contract: none; Pet Cemetery does not import, execute, or mutate this
  repository at runtime.
- Source of truth for Pet Cemetery behavior: files under
  `PetCemeteryUnityApp/PetPersonalityPrototype/src/` and the personality
  contract in `tools/project-memory/specs/pet-personality-dialogue.md`.
- Privacy boundary: pet media, prompts, generated profiles, credentials, and
  runtime artifacts must never be written to the template repository.
- Update policy: inspect only when the user explicitly names it as a reference;
  copy portable transport ideas rather than coupling project modules to its
  filesystem location.
