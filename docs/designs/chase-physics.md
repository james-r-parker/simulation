# Chase physics and terrain

**Status:** In progress - adds turning inertia, speed-coupled turn radius, asymmetric reverse thrust and terrain drag so chases are about momentum and landscape. Only Phase 1 T1 (the `scene-kinematics.js` detectors, #449) is built; T2 (the E-CP-1 baseline), T1a (the premise read) and T3 (conformance review) are open, so Phase 1 is not `(built)` and no lever is open.
**Validated:** a8013e98 (2026-11-15)
**Scheduled by:** [fair-chase.md](fair-chase.md) step 3 - heading inertia and terrain, screened on those bodies; `speedTurnDrag` widens the predator's sprint circle
**Depends on:** [senses-and-motor.md](senses-and-motor.md), [sprint-burst.md](sprint-burst.md), [fair-chase.md](fair-chase.md)

Today `actAll` in `js/sim/physics.js` sets heading change straight from `TURN` each tick with zero angular inertia, and `THRUST < 0` pushes backward at full `maxThrust`. Every patch of open ground also has identical drag. Velocity already has inertia: `damping` 0.95 keeps 95% of it each tick and `maxVelocity` caps it at 8. What has none is the heading: at `maxTurn` 0.2 rad a tick a body turns 180 degrees in 16 ticks at any speed, so its turning circle at full speed is about 40 px, inside a bite's reach. A fleeing prey can therefore turn inside a hunter at any speed, a fast hunter can turn as tightly as a slow one, and open flats play identically to rocky or vegetated ground. Whether that closes the chase's fair band is measured before anything is built (T1a).

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

The baseline is the shared run of [detector-baseline.md](detector-baseline.md), read once for every plan that has its prediction written.

Add `js/evo/scene-kinematics.js` with the three kinematics detectors and run a 16-seed baseline (`E-CP-1`, 400,000 ticks, floor on) plus `npm run audit:chase` from `senses-and-motor.md` to record the pre-inertia catch envelope.

#### Chunks

| Chunk | Tasks         | Contents                                                                                 |
| ----- | ------------- | ---------------------------------------------------------------------------------------- |
| A     | T1 to T3, T1a | `scene-kinematics.js`, registry entries, tests, `E-CP-1` baseline and conformance review |

### Phase 2 - Turning inertia, speed-coupled turns and asymmetric reverse

**Targets:** eval.chase_catch_share, eval.chase_escape_share, eval.hunt_abort_rate

Add `turnInertia`, `speedTurnDrag` and `reverseThrustShare` in `js/sim/physics.js` behind `kinematicsEnabled`. Re-run `npm run audit:chase` to verify the fair band widens, screen arms (`E-CP-2`, 16 seeds) and run the 64-seed keep rule (`E-CP-3`).

#### Chunks

| Chunk | Tasks         | Contents                                                                                                                                 |
| ----- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| B     | T4 to T8, T4a | `physics.js` kinematics + WASM parity if needed, `audit:chase` check, `E-CP-2` screen, `E-CP-3` keep rule, switch and conformance review |

### Phase 3 - Terrain drag zones

**Targets:** eval.chase_escape_share, eval.hunt_abort_rate, eval.predator_presence

Add `coverDrag` around refuge/patch-rim zones in `js/sim/physics.js` (and `wasm/src/physics.rs`), screen (`E-CP-4`, 16 seeds) and judge by the 64-seed keep rule (`E-CP-5`), verifying by arena clip that chases visibly bank, overshoot and use terrain.

#### Chunks

| Chunk | Tasks          | Contents                                                                                                    |
| ----- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| C     | T8a, T9 to T13 | Terrain drag in JS and Rust, `E-CP-4` screen, `E-CP-5` keep rule, switch, arena clip and conformance review |

## Test design

### What the code does today

| Part              | Rule today                                                                                                  | Where                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Heading           | `turnRate = TURN x maxTurn x turnMultiplier x fat`, added to the angle the same tick; no state carried over | `actAll` in `js/sim/physics.js`      |
| Velocity          | Thrust is added along the new heading; velocity is multiplied by `damping` and capped at `maxVelocity`      | `actAll`, `move_agent` in the kernel |
| Reverse           | `THRUST` below 0 pushes backwards with the same `maxThrust`                                                 | `thrustOf` in `js/sim/physics.js`    |
| What a brain sees | Its forward and lateral velocity and its turn rate (body inputs 1 to 3)                                     | `writeBodyInputs`                    |
| Cover             | Refuge rings only (`js/sim/cover.js`); patch-rim cover is unbuilt ([habitat-cover.md](habitat-cover.md))    | `stepCover`                          |

### The premise is measured first

T1a reads the body table and the catch grid of `npm run audit:chase` ([senses-and-motor.md](senses-and-motor.md) T4, T5) and the Phase 1 detectors. Phase 2 is built only when one of these holds; otherwise the doc closes with the detectors kept.

| Reading                                                                                                       | Opens              |
| ------------------------------------------------------------------------------------------------------------- | ------------------ |
| The oracle evader escapes on more than 0.8 of trials from inside half the pursuer's view by turning inside it | Speed-coupled turn |
| `eval.chase_turn_jitter` is above 0.25 sign changes a tick inside chases on the baseline                      | Angular inertia    |
| More than a tenth of escaped chases have the prey's `THRUST` below 0 for most of the chase                    | Asymmetric reverse |

Prediction, written before the run (`E-CP-1`): the oracle evader escapes on more than 0.8 of trials inside half of view; jitter is above 0.25; reverse-thrust escapes are under a tenth, so the reverse lever does not open.

### One lever per arm

Phase 2's three mechanisms sit behind three numbers, and `kinematicsEnabled` only gates them. The screen isolates each, so a verdict names a mechanism.

| Arm       | `turnInertia` | `speedTurnDrag` | `reverseThrustShare` |
| --------- | ------------- | --------------- | -------------------- |
| `control` | 0             | 0               | 1                    |
| `inertia` | 0.5           | 0               | 1                    |
| `bank`    | 0             | 1               | 1                    |
| `reverse` | 0             | 0               | 0.4                  |
| `all`     | 0.5           | 1               | 0.4                  |
| `all-lo`  | 0.3           | 0.5             | 0.6                  |

Phase 3 screens `coverDrag` at 0, 0.02 and 0.05 on the Phase 2 defaults. Its rule slows by speed, not by size, so a small body gains only by being slower; the sentence "slows high-speed coursers more than nimble bodies" holds, and no size term is added.

### What counts as a result

- `eval.chase_turn_jitter` falls by construction when inertia is on. It checks the mechanism and is never a Done bar.
- `eval.chase_catch_share`, `eval.chase_escape_share` and `eval.hunt_abort_rate` are `watch` metrics: `eval:compare` gives them an interval and no verdict. They are reported.
- The scene verdict is the envelope and the clip: the fair band of `audit:chase` is not narrower than the control's, `eval.chase_ticks_p50` ([training-stages.md](training-stages.md) T1) does not fall, and a viewer sees a hunter overshoot and a prey cut inside it.
- Adoption is the keep rule on 64 matched seeds ([principles.md](../principles.md), "A realistic mechanism stays"): an arm with no guard `WORSE` and a step inside its margin is kept; it is deleted only on `WORSE` or an unpaid step cost.
- Runs are 200000 ticks, the length the registry's power was measured at; a 400000-tick run is read only beside `npm run eval:power` on a 400000-tick report.

### What a kinematics change breaks

Every staged tool was tuned on the snap heading. With the switch on, T4a re-runs, and records beside the screen: `test/sim/interface-motor.test.js`; the win share of each scripted reference and oracle on each drill (a reference that no longer wins is re-tuned or its drill is invalid); the gate validity check of [training-stages.md](training-stages.md); the turn gain the hunt and flee reflexes seed (`applyHunterReflex` in `js/evo/instinct.js`); and `npm run probe:learn` on `food-ahead` and `prey-ahead`. A lesson that was reached before and is not reached after is a trainability cost, and it blocks adoption until a smaller `turnInertia` clears it.

## Decisions

| Decision                                                                                           | Why                                                                                                                      | Who                                 |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| The premise is measured before Phase 2                                                             | Velocity already carries momentum; only the heading is free, and no run shows that closes the fair band                  | Delegated (plan review, 2026-11-15) |
| No baseline prediction is claimed for `eval.chase_overshoot_share` or `eval.chase_cover_use_share` | These descriptive detectors have no predeclared mechanism; the shared baseline reads their power and liveness only       | Coordinator, 2026-11-17             |
| Each mechanism has its own arm                                                                     | One switch over three levers gives a verdict that names none of them                                                     | Delegated (plan review, 2026-11-15) |
| Jitter is a mechanism check, not a target                                                          | It falls by construction; a number that only moves a number does not belong ([principles.md](../principles.md))          | Delegated (plan review, 2026-11-15) |
| Phase 3 waits for patch-rim cover, or uses refuge rings only                                       | The zone it drags in is built by [habitat-cover.md](habitat-cover.md) Phase 2; a second cover geometry is not added here | Delegated (plan review, 2026-11-15) |
| No brain input is added for cover drag                                                             | A body feels drag through its own velocity inputs; a new input needs a scene metric to move                              | Planner, from principles.md         |
| The kernel change is built by Opus, and the JS reference is the test                               | `move_agent` is in `wasm/src/physics.rs` (user, 2026-11-07)                                                              | Planner, from the user's rule       |

## Experiments

| Id     | Task | Question                                                      | Prediction (written before the run)                                                                                                                     |
| ------ | ---- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-CP-1 | T2   | Does the free heading close the chase's fair band today?      | In "The premise is measured first"                                                                                                                      |
| E-CP-2 | T5   | Which mechanism widens the fair band without costing hunters? | `bank` widens the band most; `inertia` lowers jitter and leaves the band; `reverse` moves nothing; `all` reads hunters alive on fewer seeds than `bank` |
| E-CP-3 | T6   | Does the finalist harm on 64 matched seeds?                   | No guard `WORSE`; `eval.hunter_catches_per_1k` inside its interval                                                                                      |
| E-CP-4 | T10  | Does drag in cover make prey use it?                          | `eval.chase_cover_use_share` rises at 0.05 and not at 0.02; `eval.refuge_prey_use_under_threat` rises with it                                           |

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

| #   | Task                                                                                                                                                                                                                                                                                                          | Nature       | Depends on  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| T1  | Built (#449). Add `js/evo/scene-kinematics.js` (`eval.chase_overshoot_share`, `eval.chase_cover_use_share`, `eval.chase_turn_jitter`) on the shared chase record (`js/evo/chase-outcome.js`: overshoot and cover use are its flags), registry + `liveness.js` entries and `test/evo/scene-kinematics.test.js` | [judgement]  | -           |
| T2  | Run `E-CP-1` (16 seeds x 400,000 ticks) and `npm run audit:chase` baseline; record in [sim-notes.md](sim-notes.md)                                                                                                                                                                                            | [mechanical] | T1          |
| T1a | Read the premise: the body table and catch grid of `audit:chase`, the baseline detectors and the share of escapes on reverse thrust; write which Phase 2 levers open, or close the doc                                                                                                                        | [judgement]  | T2          |
| T3  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                                                                                           | [judgement]  | T1, T2, T1a |

### Phase 2 - Turning inertia, speed-coupled turns and asymmetric reverse

| #   | Task                                                                                                                                                                                                                                           | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T4  | Implement `turnInertia`, `speedTurnDrag` and `reverseThrustShare` in `js/sim/physics.js` behind `kinematicsEnabled`; add `test/sim/physics-kinematics.test.js`                                                                                 | [judgement]  | T3         |
| T4a | With the switch on, re-run the interface-motor tests, each reference's and oracle's drill win share, the gate validity check, the reflex turn gain and `probe:learn` on `food-ahead` and `prey-ahead`; record what broke and what was re-tuned | [judgement]  | T4         |
| T5  | Write `evals/screens/chase-kinematics.grid.json` (the six arms of Test design) and prediction; run `audit:chase` per arm and the 16-seed screen `E-CP-2` at 200000 ticks                                                                       | [judgement]  | T4, T4a    |
| T6  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-CP-3`)                                                                                                                                                                     | [mechanical] | T5         |
| T7  | Switch: adopt winning kinematics defaults, delete `kinematicsEnabled`, open new season, re-pin goldens and `browser:hash`                                                                                                                      | [mechanical] | T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                            | [judgement]  | T7         |

### Phase 3 - Terrain drag zones

| #   | Task                                                                                                                                                                                  | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T8a | Name the zone Phase 3 drags in: patch-rim cover if [habitat-cover.md](habitat-cover.md) Phase 2 is adopted, else refuge rings; confirm a body in it can tell from its velocity inputs | [judgement]  | T8         |
| T9  | Add `coverDrag` in `js/sim/physics.js` and `wasm/src/physics.rs`; rebuild WASM and test JS/Rust parity                                                                                | [judgement]  | T8a        |
| T10 | Write `evals/screens/chase-terrain.grid.json` and prediction; run 16-seed screen `E-CP-4`                                                                                             | [judgement]  | T9         |
| T11 | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-CP-5`)                                                                                                            | [mechanical] | T10        |
| T12 | Switch: adopt winning `coverDrag`, open new season, re-pin goldens/WASM fixtures and `browser:hash`; watch arena clip                                                                 | [judgement]  | T11        |
| T13 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented`                                                                | [judgement]  | T12        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run eval` reports the three kinematics metrics and `audit:chase` records the baseline grid.
3. Phases 2–3: `node scripts/check-wasm.mjs` passes, 64-seed `eval:compare --keep-rule` reports committed under `evals/decisions/E-CP-*/`, and `npm run browser:hash` matches re-pinned goldens.
