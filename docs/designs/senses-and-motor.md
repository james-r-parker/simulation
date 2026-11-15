# Senses and motor

**Status:** In progress - Phase 1 built (interface checks; no sign or class bug, three findings recorded for T13); Phase 2 built (`npm run audit:chase`; `E-SM-1`, record E185, falsified: no fair band beyond 0.2 of view). Phase 3 code is built (T6 to T9: `npm run audit:signals`, the lesson oracles and the input reader, `npm run probe:learn`); its runs (T10 to T12) and Phase 4 are not. Phase 5 (hunter's eyes, user request 2026-11-15): T16 and T17 built (`rearVisionShare`, neutral at its default 1; the screen grid and record E186); the screen, keep rule and switch (T18 to T21) are not. An audit of what a brain is told and what its outputs do: interface checks for bugs, the envelope of a chase, a census of every input and output, and probes that say whether each lesson is reachable and whether the senses suffice for it.
**Validated:** f5ebac76 (2026-11-15)
**Priority:** 10 - a sign error, a dead input or a chase that cannot be won voids every training run and scene verdict built on it, and Phases 1 to 3 change no behaviour, so they come before the stage ladder
**Depends on:** [training.md](training.md)

A brain reads 92 inputs (54 pooled ray values, 2 food hues, 36 body inputs: `brainLayout` in `js/sim/brain-layout.js`, `writeBodyInputs` in `js/sim/body-inputs.js`) and writes 11 outputs (`OUTPUT_INDEX`). `actAll` in `js/sim/physics.js` turns two of them into motion. Trained predators learn to close and do not learn to kill ([training.md](training.md), T12 to T22), and the scripted `memoryless` reference wins `prey-ahead` on 0.31 of trials. Three causes fit that: selection, a fault or a limit in the interface, or a chase the body cannot win. This doc tests the second and third. It answers four questions: is the interface correct, is the chase fair, is each input and output alive, and is each lesson both reachable by evolution and possible with these senses.

Scenes served: every scene, through the trait "Senses are local and lossy" and the refusal "More sensors or more hidden units as a substitute for a scene" ([principles.md](../principles.md)). No fitness, merit, mate rank or archive rank reads anything here.

## Scope

| Question                                                                    | Owner                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Is each input and output correct, in range, and of the sign the motor uses? | This doc, Phase 1                                                          |
| Can a chase be won, and can it be escaped, by the bodies as configured?     | This doc, Phase 2                                                          |
| Which inputs and outputs carry signal, flicker or sit dead?                 | This doc, Phase 3                                                          |
| Is each lesson reachable from random brains, and possible with the senses?  | This doc, Phase 3                                                          |
| How many hidden units, which mutation, how much memory?                     | [brain-capacity-and-memory.md](brain-capacity-and-memory.md); not repeated |
| What one champion's weights hold                                            | [brain-inspection.md](brain-inspection.md); not repeated                   |
| Does a genome hold a reflex?                                                | [brain-reflex-tests.md](brain-reflex-tests.md); its cases are reused       |

## Leads

Read from the code on 2026-11-15. Each is a question for a task, not a finding.

| #   | Lead                                                                                                                                                                                                                                                                                                       | Checked by |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| L1  | `BITE`, `SPRINT` and `MATE` fire when their output is above 0 (`OUTPUT_INDEX`); the alarm, hunt call and smoke fire above `alarmThreshold`, `huntCallThreshold` and `smokeThreshold` (0.65, 0.65, 0.8). An output near its threshold flips the action every tick: a bite, a sprint or a call that chatters | T7         |
| L2  | A pooled channel keeps its two strongest hits, strongest first (`POOLED_HITS`). When two hits are near in strength they swap slots, and six inputs jump at once                                                                                                                                            | T7         |
| L3  | 16 rays ring the agent (`rayCount`), 22.5 degrees apart. At a `visionRange` of 300 two neighbouring rays are about 117 px apart at their tips, so a small body at range falls between rays and is seen in flashes                                                                                          | T7         |
| L4  | `actAll` sets the heading change straight from `TURN` (up to `maxTurn` 0.2 rad a tick, a full circle in 32 ticks) and adds thrust along the new heading. `THRUST` below 0 pushes backwards at full strength. There is no turning inertia                                                                   | T4         |
| L5  | The age input is `ageTicks / maxAgeTicks` (72000). The median life is 3670 ticks (review of 2026-11-11), so the input spends a life under 0.06                                                                                                                                                             | T6         |
| L6  | The alarm, hunt-call, smoke and megafauna inputs read 0 on most seeds (no call on 123 of 128 seeds). The three refuge inputs were kept with no measured effect (review of 2026-11-11, H5)                                                                                                                  | T6         |
| L7  | A predator's `sprintBoost` is 1.6 and its `turnMultiplier` 0.7; a forager's are 1 and 1. Whether a predator at a sprint can reach a forager that turns, and whether that forager can ever get away in the open, is not written down anywhere                                                               | T4, T5     |
| L8  | Thrust is scaled by temperature, grazing, handling, sickness, fat and the rest timer (`thrustOf`). The brain is told some of these states and not others, so the same output moves the body differently for reasons it cannot sense                                                                        | T3         |
| L9  | The hunt reflex seeds prey sine into `TURN` (`applyHunterReflex` in `js/evo/instinct.js`). The sign that turns towards a body is fixed by `actAll`'s heading convention and the pooled sine's; one test pins both together                                                                                 | T1         |

## Interface checks

`test/sim/interface.test.js` and `test/sim/interface-motor.test.js` (new) stage one agent and one object in a small world and pin, for the JS path and the WASM kernels alike:

| Check              | Pins                                                                                                                                                                                              |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Range              | Every input of a 2000-tick default world lies in [-1, 1] (or its documented range); none is `NaN`; the report lists any that leave it                                                             |
| Ahead              | A body dead ahead reads cosine near 1 and sine near 0 on its channel's first hit; behind, cosine near -1                                                                                          |
| Sign               | A body on the side of positive sine comes nearer to dead ahead after one tick of `TURN` above 0, for every channel; the hunt, flee and food reflexes of `js/evo/instinct.js` turn the right way   |
| Mirror             | Mirroring the scene across the agent's heading flips every sine and the two lateral body inputs, and leaves every other input equal                                                               |
| Rotation and shift | Rotating or translating the scene and the agent together leaves the input row equal to within float error                                                                                         |
| Monotone           | Strength rises as a body nears; the energy, size, temperature and timer inputs move in the direction their label says                                                                             |
| Class              | Each body kind lands on its channel (`agentChannel` in `js/sim/ray-march.js`): kin, threat, prey, other, and a body that is two of them lands on the documented first                             |
| Motor              | `THRUST` 1 for 200 ticks reaches a terminal speed at or under `maxVelocity`; the forward-velocity input reads it; `TURN` 1 turns `maxTurn x turnMultiplier` a tick; each multiplier of `thrustOf` |
| Actions            | Each action output fires exactly when above 0, costs what its config key says, and does nothing at or below 0                                                                                     |

A failing check is a bug: a failing test, the fix, a golden re-pin if behaviour moved, and a [sim-notes.md](sim-notes.md) entry.

## Chase envelope

`npm run audit:chase` (`scripts/audit-chase.mjs`, with `js/evo/chase-envelope.js`) plays two scripted bodies with full knowledge of each other (an oracle pursuer that steers to intercept, an oracle evader that steers away and turns inside the pursuer) in an empty arena, for each pair of specialisations and each start distance and bearing.

| Output             | Meaning                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Body table         | Per specialisation: terminal speed, sprint speed, turning circle at each, stopping distance, energy per 100 ticks of each |
| `catchShare[d][b]` | The share of trials the oracle pursuer kills the oracle evader, by start distance and bearing                             |
| Fair band          | The start distances at which `catchShare` is between 0.2 and 0.8: where skill, not the body, decides                      |
| Energy to kill     | The pursuer's energy spent per kill against the energy a kill returns                                                     |

The chase is **fair** when a fair band exists inside the pursuer's `visionRange`. A catch share of 1 at every distance means no prey can dodge; 0 at every distance means no hunter can hunt. Either is a finding for the world work, recorded and handed to [honest-budgets.md](honest-budgets.md) (the kill) or [sprint-burst.md](sprint-burst.md) (the sprint), not tuned here.

## Signal census

`npm run audit:signals -- --seeds 16 --ticks 200000` (`scripts/audit-signals.mjs`, with `js/evo/signal-census.js`, sampled by the observer every `CENSUS_EVERY` (50) ticks on `CENSUS_AGENTS` (32) agents) prints one row per input and output:

| Column          | Reads                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Nonzero share   | The share of samples in which the input is not 0                                                                             |
| Mean, sd, range | Its distribution; an input that never leaves a tenth of its range is flagged `narrow`                                        |
| Use             | The mean absolute weight leaving the input (its `wIn` row and its skip row) over the mean of all inputs, among living agents |
| Swap rate       | For a pooled hit: the share of ticks, with both hits present, on which the two swapped slots                                 |
| Flash rate      | For a ray channel: the share of ticks a body of that class is inside `visionRange` and on no ray                             |
| Fire share      | For an action output: the share of ticks it is above 0                                                                       |
| Chatter         | For an action output: sign changes per 100 ticks while the agent's inputs moved less than `CHATTER_INPUT_EPS`                |

An input is **dead** when its nonzero share is under 0.01 on every seed, **unused** when its use is under 0.1, **alive** otherwise. The census reports; it deletes nothing.

## Lesson probes

Two probes say on which side of "too hard to train, too simple to see" each lesson falls. A lesson is a drill or a reflex case.

| Bar       | What plays                                                                                                                                                                                                                                                        | Says                                                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Oracle    | A scripted controller with the full world state (`js/evo/lesson-oracles.js`, new)                                                                                                                                                                                 | What the body allows                                              |
| Reference | A scripted controller that reads only the brain's input row (`referenceSubject` in `js/evo/memory-probe-references.js`, extended to every drill)                                                                                                                  | What the senses allow                                             |
| Reached   | The best of `LEARN_SEEDS` (8) populations of 64 random brains (same `brainHidden`, mutation sigmas and leak floor as the live trainer) evolved for `LEARN_GENERATIONS` (200) on that one lesson's win share (`js/evo/learn-probe.js`, new; `npm run probe:learn`) | What this brain, with this mutation, can find when asked directly |
| Champion  | The trainer's export                                                                                                                                                                                                                                              | What whole-world selection found                                  |

| Gap                 | Reading                                                                    | Goes to                                                                                          |
| ------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Oracle low          | The body cannot do it                                                      | The world work, with the chase envelope                                                          |
| Oracle - reference  | The senses lose what the lesson needs: too simple                          | A sense finding in Phase 4                                                                       |
| Reference - reached | The brain cannot find it even when selected on it alone: too hard to train | [brain-capacity-and-memory.md](brain-capacity-and-memory.md), or an interface finding in Phase 4 |
| Reached - champion  | The lesson is reachable and whole-world selection does not reach it        | [training-stages.md](training-stages.md): the stage and its gate                                 |

> Note: the learn probe selects on a detector score. Its populations are never offered to an archive, exported, or seeded into any world; `scripts/learn-probe.mjs` writes no genome file. It measures the interface, and a brain it finds is thrown away.

## Phases

### Phase 1 - Interface checks (built)

**Targets:** none - tests only; a failing check becomes a bug fix with its own failing test

The checks of the table, on the WASM kernels (the JS sense and pool paths no longer exist). Done when every check passes or has a recorded bug.

Result (2026-11-15; the entry in [sim-notes.md](sim-notes.md) holds the failing cases): every check passes and no sign, class, mirror or
frame bug was found, so no fix commit was needed. Three findings stay open as candidate outcomes for T13, none fixed here because each
changes what a brain reads or does and so moves the golden hashes:

| #   | Finding                                                                                                                                                         | Proposed fix                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| F1  | The forward and lateral velocity inputs reach 1.5 to 1.8 on a sprint; `poolRays` documents [-1, 1]                                                              | Divide by the agent's own sprint cap or clamp; a new layout name     |
| F2  | The alarm, hunt call and smoke fire above `alarmThreshold`, `huntCallThreshold` and `smokeThreshold`, not above 0 (L1 is true of `BITE`, `SPRINT`, `MATE` only) | Done: the `OUTPUT_INDEX` comment and lead L1 corrected; no behaviour |
| F3  | `THRUST` from 0.6 to 1 gives the same speed (the cap binds); reverse is as strong as forward; turning has no inertia                                            | Weigh in the chase envelope (T4, T5) before any `actAll` change      |

#### Chunks

| Chunk | Tasks    | Holds                                  |
| ----- | -------- | -------------------------------------- |
| A     | T1 to T3 | The interface and motor tests (Sonnet) |

### Phase 2 - Chase envelope (built)

**Targets:** none - a scripted tool; no sim behaviour change

`npm run audit:chase` and its table for the defaults. T4 built the tool: the oracle pursuer aims at where the evader will be, the oracle evader runs from it and breaks across its path inside `JINK_RANGE` (120), both play the sim's own `step` from rest at half a store in an arena with no food, herds or refuges, and a catch is the evader's death within 250 ticks. They are heuristics, so a catch share is what the bodies allow against this evader and not a bound; `--straight` (an evader that never breaks) is the upper bound for the pursuer. Prediction, written before the run (`E-SM-1`, ledger record E185): a predator at a sprint catches a forager from inside 0.6 of its view at every bearing, a fair band exists between 0.6 and 1.0 of view, and a kill returns more energy than the chase costs only inside the fair band's near half.

Result (2026-11-15; `evals/decisions/E185/`, [sim-notes.md](sim-notes.md)): the prediction is falsified. A predator catches a forager that breaks only from inside 0.2 of its view (0.31 there, 0 at 0.4 to 1.0), against 0.75 to 0.88 for a straight runner, so no fair band exists between 0.6 and 1.0. The 1.2x sprint edge is spent by the 75 px sprint turning circle against the forager's 32 (lead L7). Handed to the world work and to T13, not tuned here.

#### Chunks

| Chunk | Tasks  | Holds                                              |
| ----- | ------ | -------------------------------------------------- |
| B     | T4, T5 | The envelope tool and its run (Sonnet, then a run) |

### Phase 3 - Census and lesson probes

**Targets:** none - detectors and probes; `worldHash` and the golden cases are unchanged

The census, the oracle and reference controllers for every drill, the learn probe, and one table per lesson with the four bars. Prediction (`E-SM-2`): the alarm, hunt-call, smoke and refuge inputs are dead or unused; `BITE` chatters more than `THRUST` changes sign; the food hits swap slots on more than a tenth of ticks in a patch. Prediction (`E-SM-3`): `food-ahead` is reached on 8 of 8 populations inside 50 generations; `prey-ahead` is reached on under half; the oracle wins `prey-ahead` on over 0.8 of trials, so the gap to the reference's 0.31 lies in the senses or the reference, not the body.

Built (2026-11-15, chunk C): the census (`js/evo/signal-census.js` and `signal-census-ticks.js`, sampled by the tool's own loop through `noteCensusTick` after each `step`, not by the eval observer, so `npm run eval` is unchanged), `js/evo/lesson-oracles.js`, the `input-reader` reference (`js/evo/lesson-reference.js`, reached through `referenceSubject('input-reader')` and kept out of `REFERENCES`, which the memory probe prints in full) and the learn probe. No genome is written. First win shares on 16 trials of seed 1, oracle then reader: `food-ahead` 1 and 1, `food-behind` 1 and 1, `two-foods` 1 and 0.81, `prey-ahead` 0.19 to 0.38 and 0.75, `prey-too-big` 1 and 1, `hunter-closing` 0.63 and 0.06, `rock-refuge` 0 and 0. Two readings for T11 follow. The `prey-ahead` oracle wins less than the reader, so on that drill it is a lower bound on the body and "oracle low" cannot be read until a better oracle exists. The `rock-refuge` oracle cannot win: the scripted hunter reaches an agent that has settled inside the ring, so that drill's win needs more than reaching the refuge. Census choices: an input is `narrow` when it is not 0 and its span is under 0.1 (a tenth of the unit span, since the inputs have no per-input range); a flash counts a body inside `visionRange` while its pooled channel holds no hit, so an occluded body counts too and the rate is an upper bound.

#### Chunks

| Chunk | Tasks      | Holds                                                    |
| ----- | ---------- | -------------------------------------------------------- |
| C     | T6 to T9   | The census, the controllers and the learn probe (Sonnet) |
| D     | T10 to T12 | The runs, the lesson table and the conformance review    |

### Phase 4 - Fix what the audit confirms

**Targets:** eval.chase_catch_share, eval.bite_on_prey_view, eval.circling_share, eval.deliberate_food_share

One record per confirmed finding ("Outcome to task" in the `run-evolution-loop` skill), then one switch per fix, screened on 16 seeds and judged by the keep rule on 64. The candidates below are written only so their cost is known; none is built without its finding.

| Finding that would open it               | Candidate                                                                                                                                                                                | Cost                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| An action chatters (L1)                  | Held binary actions (`BITE`, `SPRINT`) start above `actionOn` and stop below `actionOff`; impulse calls (`ALARM`, `HUNT`) keep their threshold/cooldown rather than staying held         | Two keys; no layout change                              |
| Hits swap slots (L2)                     | Compare ordering the two hits by bearing (left, right) against keeping slot 1 as strongest-overall and slot 2 as strongest-other-side (so a far-side hit never displaces a close threat) | A new layout name (`pooled-v6`): every champion is void |
| Bodies flash between rays (L3)           | A ray reports the nearest body within half the ray spacing, as an eye with a field and not a line                                                                                        | The ray march in JS and Rust                            |
| The chase has no fair band (L4, L7)      | Hand to [honest-budgets.md](honest-budgets.md) or [sprint-burst.md](sprint-burst.md), or test turning inertia and weaker reverse thrust in `actAll` if instant reversals close the band  | None here (or `actAll` + chase re-pin)                  |
| The age input is narrow (L5)             | Scale by `juvenileTicks x 4`, clamped at 1                                                                                                                                               | A changed input meaning: a new layout name              |
| Inputs are dead (L6)                     | Deleted with the mechanism's own plan ([alarm-calls.md](alarm-calls.md), [habitat-cover.md](habitat-cover.md))                                                                           | None here                                               |
| The body moves for reasons unsensed (L8) | Nothing, unless a lesson's oracle-to-reference gap names the missing state                                                                                                               | A brain input needs a scene metric to move              |

Done when each confirmed finding has a verdict: adopted with its switch deleted, refused with its code deleted, or handed to the plan that owns the mechanism.

#### Chunks

| Chunk | Tasks    | Holds                                                                |
| ----- | -------- | -------------------------------------------------------------------- |
| E     | T13      | The records and the task rows for confirmed findings                 |
| F     | T14, T15 | The screens and verdicts those rows name, and the conformance review |

### Phase 5 - Hunter's eyes

**Targets:** eval.hunter_catches_per_1k, eval.chase_catch_share

The user's request (2026-11-15): the hunter sees further than any other body, the scout alone equal to it. In nature a predator's eyes face forward, overlap and see far; a prey animal's sit on the sides of its head and see all round, nearer. Today every body casts 16 rays evenly round 360 degrees, all to one `visionRange` (forager 300, predator 350, reproducer 250, scout 400, defender 350), so a predator sees as far behind it as ahead, and E185 found no chase it can win from beyond 0.2 of its view.

The change keeps the ray directions and the brain layout and shapes each ray's reach. A new per-specialisation `rearVisionShare` `s` (0 to 1, default 1, today's world) gives ray `k`, at angle `theta_k = 2 pi k / rayCount` from the heading, a reach of `visionRange x vision trait x reach_k`, with `reach_k = min(1, s + (1 - s) x (1 + cos theta_k) / 2)`: the ray dead ahead keeps the full range and the ray behind gets `s` of it. `allocateWorld` builds the factor table (`rayReachBySpec`, one row of `rayCount` factors per specialisation, from the same `detCos` as `rayCos`) once; the sense kernel (`sense_slot` in `wasm/src/sense.rs`) multiplies the caster's range by its row into a per-ray reach before the march and tests every hit and wall against it, so the tick allocates nothing and the JS and Rust agree by construction (only the kernel computes a reach). The gather keeps the full range, a superset of every ray's reach. At `s` 1 every factor is exactly 1, so `worldHash` and the golden cases do not move.

Proximity stays `1 - t / range` with the full range, not the ray's own reach: a body at a given distance reads the same on every ray, so the pooled channel's two strongest hits still rank bodies by true distance and no input changes meaning (no new layout name; every champion stays valid). A rear ray's proximity therefore never falls under `1 - s`.

Range arms move the predator to 400 (equal to the scout) and the defender to 300, so the hunter's top range is equalled only by the scout. Prediction (`E-SM-4`, recorded in the ledger before the run): on the 16-seed screen (`evals/screens/hunter-vision.grid.json`, 400000 ticks, floor on) the range-plus-rear arms raise `eval.hunter_catches_per_1k` by at least a tenth over control with the keep rule's seed guards (hunters alive, held) not worse; range alone moves catches less than range with `s` 0.4; `eval.chase_catch_share` rises with them; `eval.collision_death_share` does not rise. Falsified when no arm raises catches beyond the screen's margin. `npm run audit:chase` reads only the range arms' start distances (its oracles see all, so `s` does not touch it), and is run for the range and `s` arms so the start-distance grid is on record.

| Arm         | predator   | scout | defender   | forager, reproducer |
| ----------- | ---------- | ----- | ---------- | ------------------- |
| control     | 350, s 1   | 400   | 350        | s 1                 |
| range       | 400, s 1   | 400   | 300        | s 1                 |
| range-s06   | 400, s 0.6 | 400   | 300        | s 1                 |
| range-s04   | 400, s 0.4 | 400   | 300        | s 1                 |
| range-s04-d | 400, s 0.4 | 400   | 300, s 0.8 | s 1                 |
| far-s03     | 450, s 0.3 | 400   | 300        | s 1                 |

#### Test design

| Test                                     | Pins                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/sim/ray-reach.test.js` (new)       | The factor table: 1 dead ahead, `s` behind, symmetric left and right, every factor exactly 1 at `s` 1, never above 1                                                            |
| `test/sim/ray-march-reach.test.js` (new) | A predator with `s` 0.4 does not see a body behind it at 0.5 of its range that a forager (`s` 1) sees; it sees the same body ahead; a wall behind past the rear reach is unseen |
| Kernel against a naive JS reference      | Random seeded scenes with mixed `s`: every ray's nearest hit and key from the kernel equal a per-ray scalar JS march with the same reach, on the plain and the covered path     |
| Defaults                                 | `createConfig()` passes with `rearVisionShare` 1 on every specialisation; `test/sim/golden.json` and the sense reference digests are unchanged                                  |

#### Chunks

| Chunk | Tasks    | Holds                                                                       |
| ----- | -------- | --------------------------------------------------------------------------- |
| G     | T16, T17 | The key, the reach table and kernel, the tests, the grid and the prediction |
| H     | T18, T19 | The 16-seed screen, the finalist and the 64-seed keep rule (runs)           |
| I     | T20, T21 | The default switch or the park record, and the conformance review           |

## Decisions

| Decision                                                                                  | Why                                                                                                                                                                               | Who                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| The audit comes before the stage ladder                                                   | A gate that cannot pass because the chase cannot be won, or a sign that is wrong, would read as a training failure                                                                | Delegated (planning, 2026-11-15)        |
| No input is added or removed by this doc's first three phases                             | A new input is a cost that needs a scene metric to move; a deletion belongs to the plan that owns the mechanism                                                                   | Planner, from principles.md             |
| The learn probe may select on a lesson's score because nothing it breeds leaves the probe | It measures whether the interface makes a lesson reachable; a reflex or drill score still never enters fitness, merit, mate rank, archive rank or an offer filter of any world    | Delegated (planning, 2026-11-15)        |
| Brain size, mutation and memory are not screened here                                     | [brain-capacity-and-memory.md](brain-capacity-and-memory.md) owns them; a "too hard to train" reading is handed to it with the lesson table                                       | Delegated (planning, 2026-11-15)        |
| A fix that changes an input's meaning takes a new layout name and waits for a season      | `BRAIN_LAYOUT_NAME` is stamped into every genome and champion file; a silent change of meaning would load old brains wrongly                                                      | Planner, from brain-layout.js           |
| A ray's proximity is normalised by the full vision range, not by its own reach (Phase 5)  | A body at one distance then reads the same on every ray, the pooled hits keep ranking by true distance, and no input changes meaning, so no layout name and no champion is voided | Delegated (overnight build, 2026-11-15) |
| `rearVisionShare` stays a numeric body trait after its verdict, not a deleted switch      | It is a per-specialisation shape of the eye like `visionRange`, not a flag between two code paths; at 1 it is the all-round eye                                                   | Delegated (overnight build, 2026-11-15) |
| Ray directions stay evenly spaced (Phase 5)                                               | Moving rays forward would change what each input slot means and void every champion; shaping the reach keeps the layout                                                           | User (2026-11-15)                       |
| Every Phase 4 switch is deleted at its verdict                                            | Delete what a switch replaces (`AGENTS.md`)                                                                                                                                       | Planner, from AGENTS.md                 |

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Tests under `test/sim/`. New in `js/evo/`: `chase-envelope.js` (with `chase-arena.js`, `chase-body.js` and `chase-oracles.js`; the report is `scripts/lib/chase-report.mjs`), `signal-census.js`, `lesson-oracles.js`, `learn-probe.js`; `referenceSubject` extended. New scripts: `scripts/audit-chase.mjs`, `scripts/audit-signals.mjs`, `scripts/learn-probe.mjs`, `scripts/lib/lesson-table.mjs`. No sim-core, worker, renderer or UI change before Phase 4                                                  |
| Unit tests              | `test/sim/interface.test.js`, `test/sim/interface-motor.test.js` (the Interface checks table); `test/evo/chase-envelope.test.js` (a faster pursuer always catches a straight runner; an equal one never does); `test/evo/signal-census.test.js` (a constant input reads `narrow`, a zero one `dead`, planted swaps and chatter are counted); `test/evo/lesson-oracles.test.js` (each oracle wins its drill); `test/evo/learn-probe.test.js` (a one-weight lesson is reached; the same seed gives the same curve) |
| Headless e2e            | The golden hashes in `test/sim/golden.json` and `eval-smoke` are unchanged through Phase 3. `npm run audit:signals -- --seeds 1 --ticks 2000` and `npm run probe:learn -- --lessons food-ahead --generations 2` run in the slow tests                                                                                                                                                                                                                                                                            |
| Performance budget      | No `bench.step_ms` change through Phase 3. The census samples 32 agents every 50 ticks in the audit script only, not in `npm run eval`. Phase 4 prices each fix with `npm run bench:parts -- --area <phase> --compare <base>` under the CPU lock                                                                                                                                                                                                                                                                 |
| Evolution metrics       | Phases 1 to 3: none; the outputs are tables in [sim-notes.md](sim-notes.md) and files under `evals/decisions/`. Phase 4: the Targets above with `eval:compare` on 16 seeds and `--keep-rule` on 64                                                                                                                                                                                                                                                                                                               |
| Determinism             | New streams: `fork(createRng(seed), 'chase-envelope')`, `fork(createRng(seed), 'signal-census')`, `fork(createRng(seed), 'learn-probe:<lesson>')`. Every table replays from its seed and arguments                                                                                                                                                                                                                                                                                                               |
| Config and persistence  | No `createConfig` key through Phase 3. Phase 4 keys are named by T13's rows, each with a `scripts/flag-ledger.json` entry when boolean. The learn probe writes curves, never genomes                                                                                                                                                                                                                                                                                                                             |
| Logging and diagnostics | `ChaseEnvelopeCell` (debug: specs, distance, bearing, catches, trials), `SignalCensusRow` (info: one per input and output), `LearnGeneration` (debug: lesson, seed, generation, best), `LessonBars` (info: lesson and the four bars). Logs under `.sim/logs/audit-<name>-<seed>.jsonl`. A failed interface check names the input index and its label from `js/worker/inspect.js`                                                                                                                                 |
| Browser compatibility   | N/A - Node tools and tests only; Phase 4 fixes run in the same sim core the worker loads and are checked with `npm run browser:hash` when they re-pin                                                                                                                                                                                                                                                                                                                                                            |
| Docs                    | `AGENTS.md` Commands rows for `audit:chase`, `audit:signals` and `probe:learn`; [sim-notes.md](sim-notes.md) entries for the envelope, the census and the lesson table; a pointer from [brain-capacity-and-memory.md](brain-capacity-and-memory.md). Once `Implemented` this doc is the record of the interface's checks and tools                                                                                                                                                                               |
| Verification            | `scripts/check.sh` green per chunk PR, and the steps under Verification                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Task breakdown

### Phase 1 - Interface checks

| #   | Task                                                                                                                                                                                                              | Nature      | Depends on |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T1  | Add `test/sim/interface.test.js`: range, ahead, sign, mirror, rotation and shift, monotone and class, on the JS path and the WASM kernels; each failure becomes a bug with its own failing test and fix commit    | [judgement] | -          |
| T2  | Add `test/sim/interface-motor.test.js`: terminal speed, the velocity inputs, the turn rate, reverse thrust and each action's firing and cost                                                                      | [judgement] | -          |
| T3  | Table every multiplier on thrust and turn (`thrustOf`, `actAll`) against the input that tells the brain of it, in [sim-notes.md](sim-notes.md); conformance review of Phase 1 in parallel with `scripts/check.sh` | [judgement] | T1, T2     |

### Phase 2 - Chase envelope (built)

| #   | Task                                                                                                                                                                       | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T4  | Add `js/evo/chase-envelope.js` (the oracle pursuer and evader, the body table, the catch grid, the fair band), `scripts/audit-chase.mjs`, `npm run audit:chase`, the tests | [judgement]  | T2         |
| T5  | Run `E-SM-1` on the defaults for every hunter and prey pair; the table under `evals/decisions/` and in [sim-notes.md](sim-notes.md); conformance review of Phase 2         | [mechanical] | T4         |

### Phase 3 - Census and lesson probes

| #   | Task                                                                                                                                                                        | Nature       | Depends on               |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------ |
| T6  | Add `js/evo/signal-census.js` (nonzero share, distribution, use, fire share), `scripts/audit-signals.mjs`, `npm run audit:signals`, the tests                               | [judgement]  | -                        |
| T7  | Add the swap rate, the flash rate and the chatter count to the census, with planted cases in the tests                                                                      | [judgement]  | T6                       |
| T8  | Add `js/evo/lesson-oracles.js` and extend `referenceSubject` so every drill has an oracle and an input-only reference, each tested to win its drill or recorded as unable   | [judgement]  | -                        |
| T9  | Add `js/evo/learn-probe.js`, `scripts/learn-probe.mjs` and `npm run probe:learn` (`--lessons`, `--generations`, `--seeds`, `--workers`); no genome is written; the tests    | [judgement]  | T8                       |
| T10 | Run `E-SM-2`: the census on 16 floor-on seeds x 200000 ticks; the table under `evals/decisions/` and in [sim-notes.md](sim-notes.md)                                        | [mechanical] | T7                       |
| T11 | Run `E-SM-3`: the four bars for every drill and reflex case; the lesson table (`scripts/lib/lesson-table.mjs`) under `evals/decisions/` and in [sim-notes.md](sim-notes.md) | [mechanical] | T9                       |
| T12 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`                                                                                         | [judgement]  | T6, T7, T8, T9, T10, T11 |

### Phase 4 - Fix what the audit confirms

| #   | Task                                                                                                                                                                                           | Nature      | Depends on  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| T13 | Write one outcome record per confirmed finding of T3, T5, T10 and T11: the principle check, the biology, the prediction, and its task rows appended to this phase or handed to the owning plan | [judgement] | T3, T5, T12 |
| T14 | Build, screen and judge each fix T13 names: one switch each, 16 seeds then the keep rule on 64, the switch deleted at the verdict                                                              | [judgement] | T13         |
| T15 | Conformance review of Phase 4 by a fresh agent, in parallel with `scripts/check.sh`; move the Status line                                                                                      | [judgement] | T13, T14    |

### Phase 5 - Hunter's eyes

| #   | Task                                                                                                                                                                                                                                                 | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T16 | Add `rearVisionShare` (rule `num(0, 1)`, default 1 on every specialisation), the `rayReachBySpec` table, the per-ray reach in `sense_slot` (plain and covered paths), `scripts/build-wasm.sh`, the tests of the Test design; season 10's `rulesHash` | [judgement]  | -          |
| T17 | Add `evals/screens/hunter-vision.grid.json` (six arms), the `E-SM-4` record with its prediction before any run, and `npm run audit:chase` for the range and `s` arms under `evals/decisions/`                                                        | [judgement]  | T16        |
| T18 | Run the 16-seed screen at 400000 ticks (`npm run screen -- --grid evals/screens/hunter-vision.grid.json --workers 16`); the table under `evals/screens/results/`                                                                                     | [mechanical] | T17        |
| T19 | Name the finalist; run it against control on 64 matched floor-on seeds and `npm run eval:compare -- --keep-rule`; the verdict in the record                                                                                                          | [judgement]  | T18        |
| T20 | On no harm and a scene gain switch the defaults (season 10 `rulesHash`, goldens re-pinned in their own commit, `npm run browser:hash` where Chromium runs); on `WORSE` park it and record why                                                        | [judgement]  | T19        |
| T21 | Conformance review of Phase 5 by a fresh agent, in parallel with `scripts/check.sh`; move the Status line                                                                                                                                            | [judgement]  | T20        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npx vitest run test/sim/interface.test.js test/sim/interface-motor.test.js` passes, and every bug it found has a fix commit.
3. Phase 2: `npm run audit:chase` prints the body table, the catch grid and the fair band for each pair.
4. Phase 3: `npm run audit:signals -- --seeds 16 --ticks 200000` prints a row per input and output; `npm run probe:learn` prints the reached bar per lesson; the lesson table shows four bars per lesson.
5. Phase 4: each confirmed finding has a verdict in [sim-notes.md](sim-notes.md) and no switch is left.
6. Phase 5: `npx vitest run test/sim/ray-reach.test.js test/sim/ray-march-reach.test.js` passes; the screen table and the keep-rule verdict are in the `E-SM-4` record.
