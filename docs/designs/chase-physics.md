# Chase physics and terrain

**Status:** Proposed - add turning inertia, speed-coupled turn radius, asymmetric reverse thrust, and terrain drag/cover zones so chases are about momentum, banking and landscape rather than instant 180-degree reversals; Phase 1 (chase-kinematics detectors and baseline) is first.
**Validated:** 5abe7bfb (2026-11-15)
**Priority:** 32 - builds on the chase envelope audit of [senses-and-motor.md](senses-and-motor.md) and the sprint store of [sprint-burst.md](sprint-burst.md)
**Depends on:** [senses-and-motor.md](senses-and-motor.md), [sprint-burst.md](sprint-burst.md)

Today `actAll` in `js/sim/physics.js` sets heading change straight from `TURN` each tick with zero angular inertia, and `THRUST < 0` pushes backward at full `maxThrust`. Every patch of open ground also has identical drag. As a result, fleeing prey can snap-reverse inside a hunter's turning circle on a single tick, high-speed hunters never overshoot, and open flats play identically to rocky/vegetated ground.

This doc introduces real kinematics (angular momentum, speed-coupled turn radius, weaker reverse thrust) and terrain drag zones (dense cover/reeds around patch rims and rock rings) so pursuit and evasion look and behave like physical bodies moving through a landscape.

Scenes served: **A real chase** (banking, overshooting, cutting inside a turn), **Abort** (peeling off after an overshoot), **Refuge**, **Place is part of the animal**, and **Same spec, different custom** (agile ambushers in dense cover vs. fast coursers on open flats) ([principles.md](../principles.md)).

## Principle and refusals

- **Bodies have momentum:** Heading and velocity cannot flip instantaneously; fast movement trades off against tight turning.
- **No scripted steering:** Brains still output `THRUST` and `TURN`; physics only integrates angular velocity and terrain drag.
- **Place shapes the animal:** Dense cover slows high-speed coursers more than nimble/smaller bodies, giving refuge zones real tactical value without hard walls.

## Mechanics

| Mechanism          | Rule                                                                                                                        | Effect on chases                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Angular inertia    | `turnRate[i]` blends toward target turn rate via `angularDamping` (`turnInertia` in `[0, 1)`) instead of snapping in 1 tick | Eliminates 1-tick 180-degree jitter; forces commitment to a turn                                      |
| Speed-coupled turn | Effective `maxTurn` scales by `1 / (1 + speedTurnDrag * speed / maxVelocity)`                                               | Sprinting predators run fast in straight lines and bank wide; slowing down tightens turns for dodging |
| Asymmetric reverse | `THRUST < 0` is multiplied by `reverseThrustShare` (e.g. `0.4`)                                                             | Blobs must turn to flee or pursue rather than backpedaling at full sprint speed                       |
| Terrain drag zones | Patch/rock-rim cover zones apply `coverDrag` to `damping` (stronger at high speed, quadratic drag)                          | Open flats favour fast coursers; dense rims favour smaller, slower ambushers and dodging prey         |

## Detectors

All computed by the eval observer; none is a reward.

| Metric                       | Direction      | Reads                                                                                                        |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ |
| `eval.chase_overshoot_share` | watch          | Share of resolved chases where the hunter's minimum range occurred before a missed lunge and range re-opened |
| `eval.chase_cover_use_share` | watch (higher) | Share of prey-evaded chases that crossed a terrain cover zone                                                |
| `eval.chase_turn_jitter`     | lower          | Mean tick-to-tick sign reversals of `turnRate` inside active chases                                          |

## Phases

### Phase 1 - Chase-kinematics detectors and baseline

**Targets:** none - detectors only; `worldHash` and golden cases are unchanged

Add `js/evo/scene-kinematics.js` with the three kinematics detectors and run a 16-seed baseline (`E-CP-1`, 400,000 ticks, floor on) plus `npm run audit:chase` from `senses-and-motor.md` to record the pre-inertia catch envelope.

#### Chunks

| Chunk | Tasks    | Contents                                                                                 |
| ----- | -------- | ---------------------------------------------------------------------------------------- |
| A     | T1 to T3 | `scene-kinematics.js`, registry entries, tests, `E-CP-1` baseline and conformance review |

### Phase 2 - Turning inertia, speed-coupled turns and asymmetric reverse

**Targets:** eval.chase_catch_share, eval.chase_escape_share, eval.hunt_abort_rate

Add `turnInertia`, `speedTurnDrag` and `reverseThrustShare` in `js/sim/physics.js` behind `kinematicsEnabled`. Re-run `npm run audit:chase` to verify the fair band widens, screen arms (`E-CP-2`, 16 seeds) and run the 64-seed keep rule (`E-CP-3`).

#### Chunks

| Chunk | Tasks    | Contents                                                                                                                                 |
| ----- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| B     | T4 to T8 | `physics.js` kinematics + WASM parity if needed, `audit:chase` check, `E-CP-2` screen, `E-CP-3` keep rule, switch and conformance review |

### Phase 3 - Terrain drag zones

**Targets:** eval.chase_escape_share, eval.hunt_abort_rate, eval.predator_presence

Add `coverDrag` around refuge/patch-rim zones in `js/sim/physics.js` (and `wasm/src/physics.rs`), screen (`E-CP-4`, 16 seeds) and judge by the 64-seed keep rule (`E-CP-5`), verifying by arena clip that chases visibly bank, overshoot and use terrain.

#### Chunks

| Chunk | Tasks     | Contents                                                                                                    |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------- |
| C     | T9 to T13 | Terrain drag in JS and Rust, `E-CP-4` screen, `E-CP-5` keep rule, switch, arena clip and conformance review |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `actAll` and `integrate` in `js/sim/physics.js`, `move_agent` in `wasm/src/physics.rs`, `js/sim/config-defaults.js` / `config-rules.js`, and `js/evo/scene-kinematics.js` + `js/evo/metric-registry/`. No brain-layout, worker or UI change |
| Unit tests              | `test/sim/physics-kinematics.test.js` (angular inertia lag, tighter turn at low speed, reverse thrust scaled by `reverseThrustShare`, terrain drag inside cover zone); Rust `#[test]` parity in `wasm/src/physics.rs`                       |
| Headless e2e            | `test/sim/golden.json` and `BUSY_EFFECT_HASH` unchanged in Phase 1 and re-pinned at each phase switch with WASM fixtures and `npm run browser:hash`; `eval-smoke` passes                                                                    |
| Performance budget      | `bench.step_ms@500` within `bench-check` margin; Phase 2 adds two multiply-adds per alive agent in `actAll`; Phase 3 one zone lookup/drag multiply in `move_agent`                                                                          |
| Evolution metrics       | Phase 1: `E-CP-1` (16 seeds). Phases 2–3: 16-seed screens (`E-CP-2`, `E-CP-4`) and 64-seed `eval:compare --keep-rule` (`E-CP-3`, `E-CP-5`)                                                                                                  |
| Determinism             | Deterministic arithmetic in `actAll` and `move_agent`; no new RNG stream                                                                                                                                                                    |
| Config and persistence  | New keys: `kinematicsEnabled` (boolean switch with `scripts/flag-ledger.json` entry, deleted at Phase 2 switch), `turnInertia`, `speedTurnDrag`, `reverseThrustShare`, `coverDrag`. Saved genomes and `BRAIN_LAYOUT_NAME` unchanged         |
| Logging and diagnostics | No per-tick log event; `npm run audit:chase` prints the updated catch envelope; `npm run replay` reproduces deterministically                                                                                                               |
| Browser compatibility   | Verified with `npm run browser:hash` after each WASM/physics switch                                                                                                                                                                         |
| Docs                    | [metrics.md](metrics.md) regenerated; [sim-notes.md](sim-notes.md) entry per phase verdict                                                                                                                                                  |
| Verification            | `scripts/check.sh` green per chunk PR; `node scripts/check-wasm.mjs` passes; arena clip shows banking chases                                                                                                                                |

## Task breakdown

### Phase 1 - Chase-kinematics detectors and baseline

| #   | Task                                                                                                                                                                                              | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/scene-kinematics.js` (`eval.chase_overshoot_share`, `eval.chase_cover_use_share`, `eval.chase_turn_jitter`), registry + `liveness.js` entries and `test/evo/scene-kinematics.test.js` | [judgement]  | -          |
| T2  | Run `E-CP-1` (16 seeds x 400,000 ticks) and `npm run audit:chase` baseline; record in [sim-notes.md](sim-notes.md)                                                                                | [mechanical] | T1         |
| T3  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                               | [judgement]  | T1, T2     |

### Phase 2 - Turning inertia, speed-coupled turns and asymmetric reverse

| #   | Task                                                                                                                                                           | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T4  | Implement `turnInertia`, `speedTurnDrag` and `reverseThrustShare` in `js/sim/physics.js` behind `kinematicsEnabled`; add `test/sim/physics-kinematics.test.js` | [judgement]  | T3         |
| T5  | Write `evals/screens/chase-kinematics.grid.json` and prediction; run `audit:chase` and 16-seed screen `E-CP-2`                                                 | [judgement]  | T4         |
| T6  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-CP-3`)                                                                                     | [mechanical] | T5         |
| T7  | Switch: adopt winning kinematics defaults, delete `kinematicsEnabled`, open new season, re-pin goldens and `browser:hash`                                      | [mechanical] | T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                            | [judgement]  | T7         |

### Phase 3 - Terrain drag zones

| #   | Task                                                                                                                   | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T9  | Add `coverDrag` in `js/sim/physics.js` and `wasm/src/physics.rs`; rebuild WASM and test JS/Rust parity                 | [judgement]  | T8         |
| T10 | Write `evals/screens/chase-terrain.grid.json` and prediction; run 16-seed screen `E-CP-4`                              | [judgement]  | T9         |
| T11 | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-CP-5`)                                             | [mechanical] | T10        |
| T12 | Switch: adopt winning `coverDrag`, open new season, re-pin goldens/WASM fixtures and `browser:hash`; watch arena clip  | [judgement]  | T11        |
| T13 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented` | [judgement]  | T12        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run eval` reports the three kinematics metrics and `audit:chase` records the baseline grid.
3. Phases 2–3: `node scripts/check-wasm.mjs` passes, 64-seed `eval:compare --keep-rule` reports committed under `evals/decisions/E-CP-*/`, and `npm run browser:hash` matches re-pinned goldens.
