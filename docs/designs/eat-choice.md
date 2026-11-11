# Eat choice

**Status:** Proposed - eating becomes a choice: plants and carcasses are eaten only while the brain bites, and stored fat slows an agent. Phase 1 (the detectors and the reference) is first.
**Validated:** 9ea74722 (2026-11-11)
**Priority:** 1 - 58% of the food energy on the defaults is eaten by chance on contact, so no agent chooses when to eat or how fat to get; it changes the heat and edge pictures low-density-edge.md reads, so it comes before that plan's 64-seed pass and switch
**Depends on:** [metric-trust.md](metric-trust.md)

The rules this doc enforces ([principles.md](../principles.md)): selection rule 1 (skill, not luck, feeds a line), the
trait **Senses are local and lossy** and the scene **Condition changes the walk** (a fat blob is slower, a hungry one
ranges). The refusal it removes: food that a body takes without deciding to.

## Principle - eating is a choice with a cost

In nature an animal eats by biting: a grazer crops, a browser chews, a scavenger tears. Eating is an act it can withhold
when full, and a body that stores more fat is heavier and slower (small birds carrying fat take off slower and are
caught more). Here:

| Rule                                                                 | What it does today                                                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `feed` in `js/sim/feeding.js` eats every food item an agent overlaps | A non-hunter eats on contact whatever its brain does; only `canEatNow` (sickness, `satiationShare`, `digestTicks`) stops it |
| `updateSize` in `js/sim/energy.js` grows `size` with stored energy   | A fat agent pays more at rest, but thrust and turning in `js/sim/physics.js` ignore `size`                                  |

The brain's `BITE` output (`OUTPUT_INDEX.BITE` in `js/sim/brain-layout.js`) already carries the wish to bite; a hunter's
bite reads it as `outputs[... + OUTPUT_INDEX.BITE] > 0` in `js/sim/feeding.js`.

## Baseline

The defaults, 128 seeds, floor on, 200000 ticks, policy live (`evals/decisions/E155/defaults-floor-on.json`):

| Reading                              | Value | Registry           |
| ------------------------------------ | ----- | ------------------ |
| `eval.food_energy_per_1k`            | 539   | verified, 16 seeds |
| `eval.chance_food_energy_per_1k`     | 313   | verified, 16 seeds |
| `eval.deliberate_food_energy_per_1k` | 226   | verified, 32 seeds |
| `eval.deliberate_food_share`         | 0.42  | verified, 16 seeds |
| `eval.heat_stress_share`             | 0.41  | E155               |

## What changes

| Id  | Change                                                                                                                                                               | Lands                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| G1  | `eatAround` in `js/sim/feeding.js` eats a food item (plant or carcass) only while the agent's `BITE` output is above 0, for every specialisation                     | Screened from an unmerged commit; lands in Phase 3 when no keep-rule guard reads worse |
| G2  | `fatSlowExponent` (new number, default 0): thrust and turn rate are multiplied by `(baseSizeOf / size) ^ fatSlowExponent`, so stored fat slows and stiffens an agent | Phase 3, at the screen's finalist value                                                |

No flag is added; `fatSlowExponent` at 0 multiplies by 1 and is skipped. Every change here is a rules change
(`rulesHash` hashes the whole config, sim-notes 2026-11-11), so the screen runs from an unmerged branch and the switch
targets `season/next`, in the same season line as the low-density-edge.md switch.

## Detectors

Registered in `js/evo/metric-registry/world-3.js` with arithmetic and source tests, liveness and power, from the
scene `js/evo/scene-eat.js` (new), which samples alive agents at the 1000-tick checkpoint in `observeScenes`:

| Detector                       | Meaning                                                                                             | Unit, better |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ------------ |
| `eval.food_contact_bite_share` | Of agents overlapping an edible food item at a checkpoint, the share whose `BITE` output is above 0 | share, watch |
| `eval.full_contact_bite_share` | The same among agents at or above 0.8 of their energy store: eating when already full               | share, lower |
| `eval.fat_speed_ratio`         | Mean speed of agents above the median store over mean speed of those below, among moving agents     | ratio, watch |

## Phases

### Phase 1 - Detectors and the reference

**Targets:** none - detectors and a reference run; no sim behaviour changes, and `worldHash` and the goldens stay as they are

- The three detectors are built, registered and tested.
- One 128-seed floor-on reference of the defaults carries them, its report committed under `evals/decisions/`;
  liveness and power fill their rows through `metric-power-write --merge`.
- Done when each detector is `verified` or the sim-notes entry says why not.

| Chunk | Tasks    | Contents                                       |
| ----- | -------- | ---------------------------------------------- |
| A     | T1, T2   | The detectors (code)                           |
| B     | T3 to T5 | The reference, the readings, the review (runs) |

### Phase 2 - Screen the eat choice and fat

**Targets:** eval.deliberate_food_share, eval.chance_food_energy_per_1k, eval.food_energy_per_1k, eval.median_lifespan

The screen runs from an unmerged branch carrying G1 as one commit and G2 as another, floor on, policy live, seeds 1 to
16 of `evals/seeds.json` for the first pass. G1 starts from brains that never needed to bite to eat, so every arm runs
400000 ticks and reads its metrics after tick 200000.

| Arm        | Code and config                                 |
| ---------- | ----------------------------------------------- |
| `defaults` | the parent of G1                                |
| `fat-0.5`  | the parent of G1, `fatSlowExponent` 0.5         |
| `fat-1`    | the parent of G1, `fatSlowExponent` 1           |
| `bite`     | G1                                              |
| `bite-fat` | G1, the leading `fat-*` value of the first pass |

- `fat-*` arms first pass the purpose guard of low-density-edge.md (`scripts/heat-guard.mjs`): a sitter still dies of
  cold and a rusher of heat.
- The first pass ranks by `held`, then `alive`, then `eval.deliberate_food_share`; `bite-fat` takes its fat value from
  it and is recorded with its prediction before it runs.
- The second pass runs seeds 1 to 64 for `defaults`, `bite`, `bite-fat` and the leading `fat-*` arm, each against
  `defaults` with `npm run eval:compare -- --keep-rule`; the reports are committed under `evals/decisions/`.
- G1 lands when its keep-rule output reads no guard worse; G2 lands at the finalist value when its arm reads no guard
  worse and `eval.deliberate_food_share` `better`. When G1 reads a guard `WORSE`, the record says which, and the plan
  stops before Phase 3.
- Done when the landing changes are named with their keep-rule output at 64 seeds, or the record says why none lands.

| Chunk | Tasks      | Contents                                 |
| ----- | ---------- | ---------------------------------------- |
| C     | T6, T7     | G1 and G2 on the screen branch (code)    |
| D     | T8 to T11a | The grid, the passes, the landing (runs) |

### Phase 3 - The switch

**Targets:** eval.deliberate_food_share, eval.chance_food_energy_per_1k, eval.food_energy_per_1k, bench.step_ms@500

One PR, a breaking commit (`feat!`) to `season/next`, beside the low-density-edge.md switch.

- G1 and G2 land as Phase 2 named them; an unused `fatSlowExponent` is deleted with its code.
- The goldens are re-pinned in Node and Chromium, and `bench/baseline.json` is re-recorded on a quiet machine under the
  CPU lock, each in its own commit.
- low-density-edge.md's 64-seed pass and finalist are re-read on the switched world before its own switch.

Done criteria, on seeds 65 to 128 of `evals/seeds.json`, head against `origin/main`:

| Criterion                                         | Bar                                | 128-seed reference |
| ------------------------------------------------- | ---------------------------------- | ------------------ |
| `alive` and `held` guards                         | not worse                          | 0.74, 0.23         |
| `eval.deliberate_food_share`                      | `eval:compare` `better`            | 0.42               |
| `eval.chance_food_energy_per_1k`                  | `eval:compare` `better` (lower)    | 313                |
| `eval.food_energy_per_1k`, `eval.median_lifespan` | `eval:compare` not `worse`         | 539, -             |
| `bench.step_ms@500`                               | within the budget of `bench-check` | -                  |

| Chunk | Tasks      | Contents                                |
| ----- | ---------- | --------------------------------------- |
| E     | T12 to T15 | The landing, the re-pins (code)         |
| F     | T16, T17   | The paired check and its verdict (runs) |

## Experiments

| Label    | Prediction, written before the run                                                                                                | Falsified when                                                       |
| -------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `E-EC-1` | `bite` raises `eval.deliberate_food_share` and lowers `eval.chance_food_energy_per_1k` at 64 seeds, with no keep-rule guard worse | Either moves the wrong way, or a guard reads `WORSE`                 |
| `E-EC-2` | A `fat-*` arm lowers `eval.full_contact_bite_share` with `bite`: agents stop eating when full once fat costs speed                | `bite-fat` reads no lower `eval.full_contact_bite_share` than `bite` |
| `E-EC-3` | On the switched world `eval.heat_stress_share` falls, since only chosen meals warm a body                                         | It does not fall                                                     |

## Decisions

| Decision                       | Choice                                                                                      | If it fails                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The eat act                    | The existing `BITE` output, for plants and carcasses (user, 2026-11-11)                     | A separate `EAT` output, which changes the brain layout and costs champions                                       |
| Fat in the same plan           | G2 beside G1 (user, 2026-11-11)                                                             | -                                                                                                                 |
| Order against low-density-edge | Built after its 16-seed heat pass and before its 64-seed pass and switch (user, 2026-11-11) | -                                                                                                                 |
| Learning to bite from scratch  | 400000-tick arms read after tick 200000                                                     | When `bite` crashes in the first 200000 ticks on most seeds, the record says so and the plan stops before Phase 3 |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/scene-eat.js` (new, the detectors) and its rows in `js/evo/metric-registry/world-3.js`; `eatAround` in `js/sim/feeding.js` (G1); the turn and thrust lines in `js/sim/physics.js` (G2), with `fatSlowExponent` in `js/sim/config-defaults.js` and `js/sim/config-validate.js`; nothing in the worker or the app                                                                                                                                              |
| Unit tests              | `test/evo/scene-eat.test.js` and `test/evo/metric-source-eat.test.js`: each detector on a hand-built sample and on a scripted world. `test/sim/feeding.test.js`: an agent overlapping food with `BITE` at or below 0 does not eat, above 0 it does, for a forager and a hunter, with carcasses. `test/sim/physics.test.js`: at `fatSlowExponent` 0 thrust and turn are unchanged, above 0 an agent at twice its base size moves and turns by `0.5 ^ fatSlowExponent` |
| Headless e2e            | Phase 1 changes no `worldHash`; the golden cases in `test/sim/golden.json` are re-pinned in Phase 3 with the Chromium hashes (`npm run browser:hash`); `eval-smoke` passes on the new defaults                                                                                                                                                                                                                                                                       |
| Performance budget      | `bench.step_ms@500` within the `bench-check` margin; G1 adds one output read per food overlap and G2 one power per moving agent per tick; the baseline is re-recorded in Phase 3                                                                                                                                                                                                                                                                                     |
| Evolution metrics       | Phase 2's landing rule and Phase 3's Done criteria: `keepRule` at 64 matched seeds and `eval:compare` on the verified Targets                                                                                                                                                                                                                                                                                                                                        |
| Determinism             | No new RNG stream; G1 and G2 read existing state; replay from seed and config holds                                                                                                                                                                                                                                                                                                                                                                                  |
| Config and persistence  | New key `fatSlowExponent` (number, at least 0, default 0 until Phase 3). `rulesHash` changes with G1 and G2, so archives of the old rules are refused by `js/evo/archive-codec.js`; the brain layout is unchanged                                                                                                                                                                                                                                                    |
| Logging and diagnostics | No new sim log event. A failure reads as the guards and `eval.deliberate_food_share` in the keep-rule output; `npm run replay -- --seed <n> --ticks 400000 --level debug` reproduces a seed                                                                                                                                                                                                                                                                          |
| Browser compatibility   | N/A - no app or renderer change; the Chromium golden hashes cover the sim in the browser                                                                                                                                                                                                                                                                                                                                                                             |
| Docs                    | `docs/designs/metrics.md` regenerated; README.md (how blobs eat); body-temperature.md (eating warms only what is chosen); sim-notes.md one entry per run. This doc becomes `Implemented` after Phase 3                                                                                                                                                                                                                                                               |
| Verification            | `scripts/check.sh` green under the CPU lock at the end of each phase; Phase 3's Done criteria table                                                                                                                                                                                                                                                                                                                                                                  |

## Task breakdown

### Phase 1 - Detectors and the reference

| #   | Task                                                                                                                                            | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | `js/evo/scene-eat.js`: the three detectors, registered in `world-3.js`, with arithmetic and source tests; `docs/designs/metrics.md` regenerated | [judgement]  | -          |
| T2  | Conformance review of chunk A, in parallel with `scripts/check.sh`                                                                              | [judgement]  | T1         |
| T3  | Run the 128-seed floor-on defaults reference with the detectors; commit the report under `evals/decisions/`                                     | [mechanical] | T2         |
| T4  | Liveness and power for the detectors, merged into the registry; a sim-notes entry                                                               | [mechanical] | T3         |
| T5  | Conformance review of Phase 1                                                                                                                   | [judgement]  | T4         |

### Phase 2 - Screen the eat choice and fat

| #    | Task                                                                                                    | Nature       | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T6   | G1 on an unmerged branch: `eatAround` eats only while `BITE` is above 0, with the feeding tests         | [judgement]  | T5         |
| T7   | G2 on the same branch below G1: `fatSlowExponent` in `physics.js`, skipped at 0, with the physics tests | [judgement]  | T6         |
| T8   | The grid, the purpose guard on the `fat-*` arms, and `E-EC-1` and `E-EC-2` recorded before the run      | [judgement]  | T7         |
| T9   | First pass: the arms on seeds 1 to 16 for 400000 ticks; ranked; `bite-fat` recorded and run             | [mechanical] | T8         |
| T10  | Second pass on seeds 1 to 64 with `--keep-rule`; reports committed                                      | [mechanical] | T9         |
| T11  | Name what lands, or why nothing does; the verdicts; a sim-notes entry                                   | [judgement]  | T10        |
| T11a | Conformance review of Phase 2                                                                           | [judgement]  | T11        |

### Phase 3 - The switch

| #   | Task                                                                                                                                      | Nature       | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T12 | G1 and G2 as Phase 2 named them; an unused `fatSlowExponent` deleted; the config and feeding tests                                        | [mechanical] | T11a       |
| T13 | Re-pin the goldens in Node and Chromium                                                                                                   | [mechanical] | T12        |
| T14 | Re-record `bench/baseline.json` on a quiet machine under the CPU lock                                                                     | [mechanical] | T13        |
| T15 | README.md and body-temperature.md describe the eat choice and fat                                                                         | [mechanical] | T12        |
| T16 | Run the paired check on seeds 65 to 128 at the head against `origin/main`; reports committed                                              | [mechanical] | T14        |
| T17 | Read the Done criteria; `E-EC-3`; a sim-notes entry; conformance review of Phase 3 in parallel with `scripts/check.sh`; status line moved | [judgement]  | T15, T16   |

## Verification

1. `scripts/check.sh` is green at the end of each phase.
2. After Phase 1, each detector is `verified` or the sim-notes entry says why not.
3. After Phase 2, both passes' reports and the keep-rule output are under `evals/decisions/`, and the record names what
   lands.
4. After Phase 3, `npm run eval:compare -- <origin/main report> <head report> --keep-rule` on seeds 65 to 128 reads no
   guard worse and `eval.deliberate_food_share` `better`.
