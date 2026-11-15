# Stillness

**Status:** Proposed - stub: measure whether blobs freeze or lie in wait today, then, if they cannot gain from it, make a still body fainter on another blob's rays; Phase 1 (detectors and baseline) is first.
**Validated:** f5ebac76 (2026-11-15)
**Priority:** 28 - it gives the ambusher and the freezing prey a reason to exist, but it changes the ray march every scene reads, so it follows the world work ([honest-budgets.md](honest-budgets.md)), cover ([habitat-cover.md](habitat-cover.md)) and [sprint-burst.md](sprint-burst.md)
**Depends on:** [honest-budgets.md](honest-budgets.md), [habitat-cover.md](habitat-cover.md), [training-stages.md](training-stages.md)

A ray reports a body by its class and its proximity, `1 - distance / range` (`js/sim/ray-march.js`, and the Rust kernel `wasm/src/sense.rs`). A body that stands still reads exactly as one that runs. So holding still hides nothing: an ambusher at the rocks is seen as early as a courser, and a prey that freezes gains nothing over one that flees. The scene table asks for both ([principles.md](../principles.md): "Same spec, different custom: one courser and one ambusher at the rocks"; "A real chase: losing sight is not the same as the prey ceasing to exist").

Scenes served: **Same spec, different custom**, **A real chase**, **Refuge**, **Call, or don't** (staying quiet and still is sometimes better), and the trait "Senses are local and lossy". No brain input is added and none is removed.

## Nature model

Sources are cited from memory and are to be checked before a number from them is relied on.

| Behaviour in nature                                                                                                               | Maps to                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Many predators detect prey by motion; a still animal against its background is found late (Lettvin et al. 1959; Cott 1940)        | A still body is fainter at range                                            |
| Fawns, hares and ground-nesting birds freeze as a first defence and flee only when the predator is close (Ydenberg and Dill 1986) | Freezing pays at range and fails up close: the faint read ends near the eye |
| Ambush predators (pike, mantises, cats in cover) hold still and strike from a short distance                                      | A still hunter is seen late by prey                                         |
| Moving costs concealment as well as energy: foraging and vigilance trade off (Lima and Dill 1990)                                 | Feeding on the move is the visible, risky state                             |

## Detectors

All computed by the eval observer; none is a reward.

| Metric                          | Direction      | Reads                                                                                                                                                 |
| ------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.freeze_under_threat`      | watch (higher) | The share of non-hunter ticks spent still (the speed bar of `js/evo/style.js`) with a threat on the rays, minus the same blobs' still share when calm |
| `eval.freeze_survival_gain`     | higher         | Of threat episodes, the survival share of those in which the prey was still when the threat was first seen, minus that of the rest                    |
| `eval.ambush_kill_share`        | higher         | Of deliberate hunter kills, those whose chase opened with the hunter still for at least `AMBUSH_STILL_TICKS` (60) before it                           |
| `eval.first_sight_range.still`  | watch (lower)  | Phase 2: the mean range, as a share of view, at which a body that was still is first on another blob's rays                                           |
| `eval.first_sight_range.moving` | watch          | Phase 2: the same for a moving body                                                                                                                   |

## Phases

### Phase 1 - Detectors and baseline

**Targets:** none - detectors only; `worldHash` and the golden cases are unchanged

The first three detectors and a 16-seed baseline on the defaults (`E-ST-1`). Prediction, written before the run: `eval.freeze_under_threat` is at or under 0 (threatened prey move more, not less), `eval.freeze_survival_gain` has an interval that includes 0, and `eval.ambush_kill_share` is under 0.1. Phase 2 is built only if the prediction holds: if blobs already freeze or ambush with a gain, the world gives the reason and this doc closes with the detectors kept.

### Phase 2 - A still body is fainter

**Targets:** eval.chase_catch_share, eval.refuge_prey_use_under_threat, eval.style_separation

With `stillSight` on, the proximity a ray reports for an agent body is multiplied by a factor that depends on that body's speed and on the true proximity: 1 when its speed is at or above `stillSpeed` (a share of `maxVelocity`) or its proximity is at or above `stillNear`; otherwise it falls linearly with speed to `stillFaint` at rest. Food, rocks, walls, herds, scent and calls are unchanged. A bite, a call and smoke are unchanged, so a blob that calls or bites is not hidden by them, only by holding still.

| Arm       | `stillFaint` | `stillNear` | Reading                                            |
| --------- | ------------ | ----------- | -------------------------------------------------- |
| `control` | 1            | -           | Today                                              |
| `faint`   | 0.5          | 0.6         | A still body reads half as near beyond 40% of view |
| `hidden`  | 0.2          | 0.6         | A still body is almost unseen beyond 40% of view   |
| `close`   | 0.5          | 0.8         | The faint read reaches to 20% of view              |

| Done when                                                                                                                                                 | Stop when               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `eval.freeze_survival_gain` or `eval.ambush_kill_share` is `better` on 16 seeds and `eval:compare --keep-rule` on 64 matched seeds reads no guard `WORSE` | Every arm reads `WORSE` |

### Phase 3 - Adopt or delete

**Targets:** eval.chase_catch_share, eval.predators_at_end

The keep rule decides ([principles.md](../principles.md), "A realistic mechanism stays"). An arm with no guard `WORSE` on 64 matched seeds and a ray march inside its margin becomes the default even if neither detector moved; the switch and its off path are deleted in JS and in the Rust kernel and the golden cases re-pinned. The rule, its keys and its ledger entry are deleted only when every arm reads `WORSE`, or the ray march is slower than its margin and no scene metric moved. The detectors stay either way.

## Decisions

| Decision                                                                  | Why                                                                                                                                      | Who                              |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Measure before building                                                   | If blobs already gain by freezing, the rule is not needed                                                                                | Delegated (planning, 2026-11-15) |
| The existing proximity value is scaled; no input is added                 | A new input is a cost that needs a scene metric to move ([principles.md](../principles.md), "More sensors as a substitute for a scene")  | Delegated (planning, 2026-11-15) |
| It queues behind cover and the sprint store                               | Cover ([habitat-cover.md](habitat-cover.md)) and stillness both hide a body; reading them together would not say which one moved a scene | Delegated (planning, 2026-11-15) |
| The Rust kernel change is built by Opus, and the JS reference is the test | The ray march runs in `wasm/src/sense.rs`; a kernel is tested against its JS reference (`AGENTS.md`, wasm-kernels.md)                    | Planner, from the user's rule    |
| The switch `stillSight` is deleted at Phase 3 on either verdict           | Delete what a switch replaces (`AGENTS.md`)                                                                                              | Planner, from AGENTS.md          |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Phase 1: `js/evo/scene-stillness.js` and its registry entries. Phase 2: the factor in `js/sim/ray-march.js` and `wasm/src/sense.rs` (`scripts/build-wasm.sh`), a pure `stillFactor` in `js/sim/still-sight.js`                                                                                 |
| Unit tests              | `test/evo/scene-stillness.test.js` (a prey that stops under threat reads a positive freeze share; a hunter that waits then strikes reads an ambush kill). Phase 2: `test/sim/still-sight.test.js` (the factor's four corners), the kernel against its JS reference, the off path bit-identical |
| Headless e2e            | Phase 1: golden hashes unchanged. Phase 2: unchanged with the switch off; a 6000-tick replay with it on runs clean under `--check-invariants`                                                                                                                                                  |
| Performance budget      | TBD - Phase 2 is priced with `flock /tmp/claude-1000/cpu.lock npm run bench:micro -- --area wasm --compare HEAD` once the kernel change exists                                                                                                                                                 |
| Evolution metrics       | The Phase 2 Done row; experiments `E-ST-1` to `E-ST-3` in `evals/experiments.json`                                                                                                                                                                                                             |
| Determinism             | No RNG stream; the factor is a pure function of speed and proximity                                                                                                                                                                                                                            |
| Config and persistence  | Phase 2: `stillSight` (false), `stillSpeed` (0.1), `stillFaint` (0.5), `stillNear` (0.6); a `scripts/flag-ledger.json` entry for the boolean pointing at T9. A new key changes `rulesHash`, so the switch lands on `season/next`; no layout change                                             |
| Logging and diagnostics | `StillSightConfig` (info, tick 0, with the switch on). Replay: `npm run replay -- --seed <n> --ticks 20000 --config <on.json> --level debug --check-invariants`                                                                                                                                |
| Browser compatibility   | TBD - whether a still, faint blob is drawn differently is decided with [crisp-renderer.md](crisp-renderer.md) when Phase 2 is planned in full                                                                                                                                                  |
| Docs                    | [metrics.md](metrics.md) regenerated; the [principles.md](../principles.md) scene table gains the detectors under **Same spec, different custom** and **Refuge**; one [sim-notes.md](sim-notes.md) entry per run                                                                               |
| Verification            | `scripts/check.sh` green per chunk PR; the baseline and the keep-rule reports committed under `evals/decisions/`                                                                                                                                                                               |

## Task breakdown

### Phase 1 - Detectors and baseline

| #   | Task                                                                                                                                                                                      | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/scene-stillness.js` with `eval.freeze_under_threat`, `eval.freeze_survival_gain` and `eval.ambush_kill_share`, registry entries and `test/evo/scene-stillness.test.js`        | [judgement]  | -          |
| T2  | Run `E-ST-1`: prediction first, 16 floor-on seeds x 200000 ticks on the defaults, `npm run eval:power` on the new metrics, the report under `evals/decisions/`; write the Phase 2 verdict | [mechanical] | T1         |
| T3  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`; replace every `TBD` if Phase 2 is to be built, or close the doc                                      | [judgement]  | T1, T2     |

### Phase 2 - A still body is fainter

| #   | Task                                                                                                                                                                                                                                                                              | Nature       | Depends on     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------- |
| T4  | Add `js/sim/still-sight.js`, the keys, the ledger entry and the factor in `js/sim/ray-march.js`, with the tests and the off-path checks                                                                                                                                           | [judgement]  | T3             |
| T5  | Port the factor to `wasm/src/sense.rs`, rebuild with `scripts/build-wasm.sh`, test the kernel against the JS reference, price it                                                                                                                                                  | [judgement]  | T4             |
| T6  | Add the two `eval.first_sight_range` metrics; write `evals/screens/stillness.grid.json`                                                                                                                                                                                           | [judgement]  | T4             |
| T7  | Run the screen (`E-ST-2`, 16 seeds) and the keep-rule pass of the best arm (`E-ST-3`, 64 matched seeds); with the switch on, re-run the gate validity check and the reference drill tables of [training-stages.md](training-stages.md), whose stagings hold still bodies at range | [mechanical] | T5, T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                                                               | [judgement]  | T4, T5, T6, T7 |

### Phase 3 - Adopt or delete

| #   | Task                                                                                                                                                                                                                           | Nature      | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------- |
| T9  | Verdict by the keep rule: adopt the best harmless arm and delete the switch and its off path in JS and Rust with the golden re-pin; delete the rule, its keys and its ledger entry only on `WORSE` or an unpaid ray-march cost | [judgement] | T8         |
| T10 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`; the clip of an ambush for the user; move the Status line                                                                                  | [judgement] | T9         |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: an eval report carries the three stillness metrics, and the sim-notes entry states the Phase 2 verdict.
3. Phase 2: the golden hashes are unchanged with the switch off; `node scripts/check-wasm.mjs` passes; the screen table and the keep-rule output are in the PR.
4. Phase 3: `npm run browser:hash` matches the re-pinned goldens, or the rule's files are gone.
