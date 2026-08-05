# Pet Personality Codex Photo Analysis — 2026-08-05

## Purpose

Verify the project-local Codex transport, GPT-5.6 Sol/high vision input,
provider-neutral JSON Schema, conservative personality compiler, telemetry, and
temporary-media cleanup on the same six local pet photographs used by the
earlier Gemini run.

## Configuration

- Analyzer: `codex-multimodal:gpt-5.6-sol:high`
- Transport: isolated local `codex exec` using the signed-in ChatGPT session
- Execution: ephemeral, read-only, user config and project rules disabled
- Media: 6 JPEG photographs, no video
- Output schema: `pet-personality/0.1` observation contract
- Billing mode: ChatGPT subscription usage; no OpenAI API-key charge estimate

## Result

- Latency: 48,759 ms
- Input tokens: 25,366
- Cached input tokens: 0
- Visible output tokens: 1,783
- Reasoning output tokens: 293
- Total output tokens: 2,076
- Total tokens: 27,442
- Observable evidence items: 6
- Signature traits: 0
- Readiness: `insufficient`

The analyzer recognized consistent visual identity and produced one bounded
observation per photograph. It correctly refused to activate stable personality
traits because the input contained no behavioral sequence. The normalized
summary remained:

> Фото подтверждают внешний контекст и отдельные позы, но не дают достаточной
> поведенческой последовательности для профиля характера.

## Boundary verification

- `src/media/frame-media-preparer.js` owned materialization, source labels, and
  cleanup.
- `src/providers/codex-cli-provider.js` only transported prepared inputs to the
  signed-in Codex runtime and parsed its event stream.
- `src/domain/personality-analysis-contract.js` applied the same evidence and
  abstention rules used by the Gemini and OpenAI paths.
- Both `var/media-work` and `var/codex-work` were empty after completion.
- No files were written to or imported from `D:\AI\llm_providers`.

## Remaining product gap

This verifies integration and conservative photo handling, not personality
recognizability. The next valid experiment still requires behavioral video from
at least three distinct contexts, followed by owner review and blind comparison.
