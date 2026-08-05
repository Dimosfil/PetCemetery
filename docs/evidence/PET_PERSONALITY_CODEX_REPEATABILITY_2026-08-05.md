# Pet Personality Codex Repeatability — 2026-08-05

## Purpose

Measure whether the same personality dimensions and signature traits reappear
when the analyzer receives an independent set of videos and no conclusions from
the first run.

## Independent input set

- `photo/video_2026-08-05_14-06-26.mp4` — object interaction.
- `photo/video_2026-08-05_14-06-42.mp4` — close interaction with a person at home.
- `photo/video_2026-08-05_14-06-58.mp4` — separate yard episode near another animal.
- Total source duration: 124.60 seconds.
- Extracted input: 28 JPEG frames with source IDs and timestamps.
- The prompt explicitly prohibited using conclusions from earlier runs.

## Second-run result

- Profile: `affeb0d9-87e9-4587-a920-d3d9b9c886ca`, revision 1.
- Readiness: `usable`.
- Evidence items: 15.
- Signature traits: 3.
- Input tokens: 65,227.
- Visible output tokens: 3,151.
- Reasoning output tokens: 513.
- Total tokens: 68,891.
- Latency: 82,233 ms.
- Stored profile size: 20,765 bytes.

## Cross-run agreement

All three signature-trait dimension IDs from the first run were reproduced:

- `human_sociability`;
- `activity_playfulness`;
- `persistence_engagement`.

Signature-trait Jaccard similarity is `1.0`. Dimension score comparison:

| Dimension | First | Second | Absolute delta |
| --- | ---: | ---: | ---: |
| `human_sociability` | 0.78 | 0.82 | 0.04 |
| `activity_playfulness` | 0.82 | 0.86 | 0.04 |
| `novelty_confidence` | 0.50 | 0.50 | 0.00 |
| `independence_closeness` | 0.58 | 0.74 | 0.16 |
| `persistence_engagement` | 0.88 | 0.90 | 0.02 |

Mean absolute score delta is `0.052`. The largest shift is
`independence_closeness`, which is expected to be context-sensitive because the
second set contains a long close-contact episode and no independent walk.
`novelty_confidence` remained `insufficient` in both runs.

## Interpretation

The result supports technical repeatability for the three strongest candidate
traits on these six videos. It does not yet prove owner-recognizable personality:
the owner must complete the generated blind model-versus-generic comparison
without being told which option came from the media profile. Both options use
the same neutral summary, three trait labels, five dimension scores, and no
scene-specific candidates, so formatting and evidence detail do not reveal the
answer. Detailed evidence review should follow the blind choice so it does not
unblind the evaluation.

The frame-based Codex path still omits audio and continuous motion between
sampled frames. Interaction with the chicken remains motivation-ambiguous and
potentially unsafe regardless of inferred intent.
