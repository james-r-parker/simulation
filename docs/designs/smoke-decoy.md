# Smoke decoy

**Status:** In progress - planned; nothing built yet (T1 is this doc). Next: T2, the failing tests and the decoy reading in the ray march.
**Validated:** 1e3eb3cb (2026-11-22)
**Scheduled by:** [fair-chase.md](fair-chase.md) step 10 - the `defender:predator` row of [role-budget.md](role-budget.md) (gate 1 of "Before any training") is red on the caller's smoke escape, and this is the rule its "Next: decoy" option asks for.
**Depends on:** [role-budget.md](role-budget.md), [body-genes.md](body-genes.md)

> Companion to [role-budget.md](role-budget.md) ("Smoke" and "Defender smoke"), which holds the calculator this doc extends, and to [prey-guilds.md](prey-guilds.md), whose defender the smoke serves.

Scene: **Defender guarding kin** ("Call, or don't": the signal that costs and can save a body) and, for prey smoke, **A real chase** (the flee drop). Selection rule: a signal pays only when it buys time.

## Nature model

A cuttlefish or squid that is struck at releases a blob of ink the size and shape of its own body (a pseudomorph) and jets away while the predator strikes the blob. A diffuse ink cloud hides the animal; the pseudomorph also gives the predator something to attack. Mobbing and distraction displays do the same by other means: the predator's attention goes to a target that is not the prey.

The sim has no target memory: a hunter follows what its rays show. A fresh cloud that also reads as a body on the hunter's own rays pulls the hunter to the cloud with no new rule for the hunter.

## The rule

A cloud younger than `smokeDecoyTicks` ticks is a **decoy**. A ray whose nearest hit is a decoy cloud writes its proximity on `CH_PREY` as well as the 1 on `CH_SMOKE` (`writeRay` in `js/sim/ray-march.js`, `isDecoy`). The reading is the hit's own proximity, so a cloud close to the hunter reads as a body at its mouth, and a ray that starts inside the cloud reads 1.

| Property                   | Value                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Age                        | `smokeTicks - cloudTtl`; the cloud is a decoy for ages 0 to `smokeDecoyTicks - 1`; after that it reads on `CH_SMOKE` alone, as before               |
| Which rays                 | Any caster's rays that meet the cloud first; walls, obstacles and nearer bodies occlude it as they occlude smoke; no spec flag, no scan of agents   |
| What the hunter can tell   | Both channels are set: a brain tells a decoy from a body by `CH_SMOKE`, and `smokeSight` (the ray that sees through smoke) reads the body behind it |
| No new input               | `CH_PREY` and `CH_SMOKE` exist; the layout and `inputCount` do not change                                                                           |
| Per-tick cost              | One age compare for a ray whose best hit is a cloud; no allocation                                                                                  |
| Prey smoke (the flee drop) | Same physics: a hunter closing on a fleeing prey that drops a cloud sees a body in the cloud and turns to it                                        |

A hunter that follows its prey ray turns to the nearest body-like hit, which is the decoy, runs at it and, with its mouth on it, bites a cloud. A hunter that holds its heading through the cloud, or ignores a ray that has `CH_SMOKE` set, is not held. Evolution decides which hunters learn that.

Effect on prey that smoke while fleeing: the decoy is a body-sized target close behind them, so a hunter that follows its rays turns to it for up to `smokeDecoyTicks` ticks and the prey gains that time. Effect on a non-hunter whose rays meet a cloud: the cloud also reads as prey for the same time. A forager has no use for the prey channel today, so nothing changes for it; a predator that releases smoke sees its own fresh cloud as prey, for those ticks.

## Detectors

| Metric                  | What it reads                                                                    | Source                                            |
| ----------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| `eval.smoke_escapes`    | The share of smoke releases after a bite from which the releaser survives        | [metrics.md](metrics.md)                          |
| `eval.smoke_precision`  | The share of smoke releases made with a threat in sight or while recently bitten | [metrics.md](metrics.md)                          |
| `role:budget` smoke row | The defender's smoke slack and the caller's slack, read with the decoy model     | `npm run role:budget -- --rows defender:predator` |

## Phases

### Phase 1 - The decoy

**Targets:** eval.smoke_escapes, eval.smoke_precision

Tasks T2 to T6 build the rule, its key, the re-pins, the calculator and the scene. T7 and T8 read the evolution metrics.

## Decisions

| Decision                                                        | Why                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The decoy is a sensory reading on the existing prey channel     | The brief forbids target memory, scripted retargeting and a new brain input; a new input is a cost that needs a scene metric to move ([principles.md](../principles.md)). The hunter's own rays do the retargeting                                                                                                                                       |
| `smokeDecoyTicks` is 60, a third of `smokeTicks`                | At 60 ticks a second it is one second of a three-second cloud: a pseudomorph holds its body shape while the ink is dense and then disperses to a plain cloud. 30 was tried in the scene and the hunter wandered back to the prey; 60 loses it. It is not tuned to a row                                                                                  |
| The key is an integer, `0` is off, no boolean flag              | A switch that is on by default and has no comparison run left is a path to delete ([AGENTS.md](../../AGENTS.md)); the integer is the strength, so `scripts/flag-ledger.json` has no entry                                                                                                                                                                |
| The decoy reads the hit's proximity, not a fixed value          | The hunter is drawn to the nearest body-like hit, so a decoy beyond the prey is not preferred to a nearer prey; the prey channel stays an honest proximity                                                                                                                                                                                               |
| No rule for the releaser's own rays                             | A releaser stands `size` outside the cloud and its rays meet the cloud first on a few rays; excluding it needs the cloud's owner, which the pool does not hold and a scan would add. The cost is read in T7                                                                                                                                              |
| The hunter oracle of the smoke scenes follows its own prey rays | The scenes must not script the retarget: `readPreyRays` in `js/evo/role-scenes-decoy.js` steers to the strongest prey ray and stops thrusting once the hit is at its mouth (`GRIP`, a proximity of 0.95), as a hunter that has its target in its jaws does. Without the stop the oracle overshoots the cloud and the decoy holds it for 20 ticks, not 60 |
| The budget's hunter is the ray-follower                         | A hunter that reads `CH_SMOKE` and ignores the decoy is not held, and the row's number says so: the decoy is a gain against ray-following hunters, as a pseudomorph is against a predator that strikes at shapes                                                                                                                                         |
| Season 12 moves in place                                        | It is unreleased (v11.0.0 holds season 11), so the new key moves its `rulesHash` in `library/seasons.json` ([AGENTS.md](../../AGENTS.md))                                                                                                                                                                                                                |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/ray-march.js` (`isDecoy`, `writeRay`); `js/evo/role-budget-decoy.js` (the calculator's decoy profile); `js/evo/role-scenes-decoy.js` (the ray-reading hunter of the scenes). No change to the sense kernel (`wasm/src/sense.rs`), which keeps the cloud's hit and key                              |
| Unit tests              | `test/sim/ray-march-decoy.test.js` (the channel, the age edge, off at 0, inside the cloud, occlusion); `test/evo/role-budget-decoy.test.js` (the profile); `test/evo/role-scenes-smoke.test.js` (the calculator against the scene); the brute-force caster of `test/sim/ray-march.test.js` reads the decoy |
| Headless e2e            | `test/sim/golden.json` and the WASM fixtures re-pinned (T3); `BUSY_EFFECT_HASH` and `BUSY_EFFECT_RECORDS` of `test/worker/sim-host.slow.test.js`                                                                                                                                                           |
| Performance budget      | One compare per ray whose best hit is a cloud, in JS `writeRay`; `bench` is read with the PR's CI perf gate, no new `bench.*` metric                                                                                                                                                                       |
| Evolution metrics       | `eval.smoke_escapes` and `eval.smoke_precision`, 16 matched seeds (T7) and the 64-seed `--keep-rule` (T8)                                                                                                                                                                                                  |
| Determinism             | No RNG; the reading is a pure function of the cloud's age and the ray's hit                                                                                                                                                                                                                                |
| Config and persistence  | `smokeDecoyTicks` (60, integer 0 to 65535, 0 is off); `rulesHash` moves, season 12's entry in `library/seasons.json` moves in place; no saved format changes                                                                                                                                               |
| Logging and diagnostics | No new event: the existing `SmokeReleased` and the bite events carry the reading. Replay: `npm run replay -- --seed <n> --ticks 20000 --check-invariants`                                                                                                                                                  |
| Browser compatibility   | Nothing visible changes: the renderer reads clouds from the snapshot, not the ray channels                                                                                                                                                                                                                 |
| Docs                    | [role-budget.md](role-budget.md) (Defender smoke, Decisions, T24a), [fair-chase.md](fair-chase.md), [docs/commands.md](../commands.md) unchanged, a dated note in `docs/handoffs/2026-11-20-build-the-plans.md`                                                                                            |
| Verification            | `scripts/check.sh --fix --quick` green; the CI run on the PR                                                                                                                                                                                                                                               |

## Task breakdown

### Phase 1 - The decoy

| #   | Task                                                                                                                                                                           | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T1  | Write this doc and link it from role-budget.md's decoy option                                                                                                                  | [judgement]  | -          |
| T2  | Failing tests, then `smokeDecoyTicks` and the decoy reading in `js/sim/ray-march.js`                                                                                           | [judgement]  | T1         |
| T3  | Re-pin what the rule moves: season 12's `rulesHash`, `test/sim/golden.json`, the WASM fixtures, the train-throughput archive pin, `BUSY_EFFECT_HASH` and `BUSY_EFFECT_RECORDS` | [mechanical] | T2         |
| T4  | The calculator's decoy profile (`js/evo/role-budget-decoy.js`) and its use in `smokeCell` and `defenderSmokeGeometry`, with the ray-reading hunter of the scenes               | [judgement]  | T2         |
| T5  | A test pinning the calculator to the scene: the prey and the defender smoke read the same hidden and escape ticks at the defaults and with the decoy off                       | [judgement]  | T4         |
| T6  | Read `defender:predator` on the defaults and on `step5-d.json` at both postures and record it in role-budget.md                                                                | [mechanical] | T3, T5     |
| T7  | A 16-seed matched eval, base against head, `eval:compare` on `eval.smoke_escapes` and `eval.smoke_precision`                                                                   | [mechanical] | T3         |
| T8  | The 64-seed `--keep-rule` read (`npm run eval:compare -- <before> <after> --keep-rule`), detached; adopt on no harm, delete the key on `WORSE`                                 | [mechanical] | T7         |
| T9  | Conformance review of the phase by a fresh agent                                                                                                                               | [judgement]  | T6, T7     |

## Verification

- `scripts/check.sh --fix --quick` passes before the push; CI is the gate on the PR.
- `npm run role:budget -- --rows defender:predator --check` reads the new smoke model within tolerance of the scene.
- `npx vitest run test/sim/ray-march-decoy.test.js test/evo/role-scenes-smoke.test.js test/evo/role-budget-decoy.test.js` passes.
