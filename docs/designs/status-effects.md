# Status effects

**Status:** Proposed - one registry of stacking, capped, timed effects on a body: every within-life modifier the sim has today (heat, cold, fat, grazing, handling, the rest after a kill, sickness, the sprint reserve, the call rules) moves into it, and the social effects (rally, answer, hoarse, alert, huddle, stagger, wound) are added on it; Phase 1 (the system and the move) is first.
**Validated:** 23e8cc66 (2026-11-21)
**Scheduled by:** [fair-chase.md](fair-chase.md) step 2 - built straight after body-genes.md Phase 1 and before the calculator, which reads the effects; every large rules change lands before any training
**Depends on:** [body-genes.md](body-genes.md)

> Companion to [body-genes.md](body-genes.md), whose lanes are what a body is for its whole life. This doc owns what changes within a life: an effect multiplies a lane, or closes a gate, for as long as it lasts.

A lane is constant for a life. A body is also cold, tired, full, hurt, sick, in a pack that has just called, or pressed against its kin, and each of those changes what it can do for a while. Today each is a rule of its own in a different file. Here each is one entry of a registry: what puts it on a body, how many times it stacks, how it fades, and which lanes it scales. The readers of a lane read the lane with its effects applied, and nothing else in the sim multiplies a lane.

Scenes served: **Pack, or loner**, **Call, or don't**, **Condition changes the walk**, **Refuge** (the huddle) and the trait **Needs conflict in the same tick** ([principles.md](../principles.md)). Selection rules 7 and 8 bound every social effect: the payoff returns to the actor's offspring, and a cheater must not win.

## The registry (`js/sim/effects.js`)

`EFFECTS` is a frozen list. `EFFECT_INDEX` and the per-slot state are built from it.

| Field       | Meaning                                                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `name`      | the effect's name: the key of its config numbers, of its inspector row, and of its detector                                                                                                            |
| `family`    | `body` (a state of the body), `feeding`, `social` or `combat`                                                                                                                                          |
| `maxStacks` | the cap; a stack past it is dropped. 1 for an effect that is on or off                                                                                                                                 |
| `level`     | `stacks` (a count that an applier raises) or `share` (a number from 0 to 1 read from the body each tick, such as how full its store is)                                                                |
| `fades`     | `ticks` (all stacks end when the timer does; a new stack restarts it), `perTick` (one stack leaves every `n` ticks), or `condition` (the level is recomputed from the body each tick and never stored) |
| `scales`    | a list of `{lane, perStack}`: the lane is multiplied by `1 + perStack x level`, never below 0; `perStack` is a config key                                                                              |
| `gates`     | a list of gate names the effect closes while it is on (`eat`, `mate`, `bite`, `sprint`)                                                                                                                |
| `applier`   | the name of the rule that puts it on a body (below)                                                                                                                                                    |
| `visible`   | whether the renderer and the inspector show it                                                                                                                                                         |

Per slot the state is `effectLevel[effect][slot]` (`Float32Array`) and `effectTicks[effect][slot]` (`Uint16Array`), in `world.effects`; both are zeroed by `freeAgent`.

### How a lane is read

`world.live.<lane>[slot] = world.lanes.<lane>[slot] x product over the effects that scale it of (1 + perStack x level)`.

- Only a lane that some effect scales has a `live` array (the affected lanes are the thrust, the turn rate, the speed cap, the passive loss, the sprint drain, the heat loss, the bite and the call cost). Every other lane is read from `world.lanes`.
- `stepEffects(world)` runs once a tick, first in the step, before the senses: it runs each applier in registry order, fades the timers, and recomputes the `live` value of every slot whose levels changed. It allocates nothing and draws nothing from the RNG.
- A gate is read with `gateOpen(world, slot, GATE.EAT)`; `canEatNow`, `blocksMating` and the bite test call it.
- The product is taken in registry order, so a world replays bit for bit.

### Appliers (`js/sim/effect-appliers.js`)

An applier is a pure rule over the world's state and this tick's events. There are four kinds.

| Kind        | Raises a level when                                                         | Examples                                     |
| ----------- | --------------------------------------------------------------------------- | -------------------------------------------- |
| `condition` | a number of the body crosses a line, every tick                             | cold, hot, fat, sated, spent                 |
| `timer`     | an act starts a clock                                                       | handling after a meal, the rest after a kill |
| `event`     | an event of this tick names the body                                        | bitten, shoved, heard a call                 |
| `nearby`    | other bodies are within a range, read from the spatial hash every `n` ticks | huddle                                       |

### What the body feels

A brain already reads its energy, its temperature bands, `ate`, `bitten`, `pregnant` and what it hears. One body input is added with the layout of [body-genes.md](body-genes.md) Phase 1: `reserve`, the sprint store's level, so a brain can pace a graded sprint. No effect adds another input.

## Every modifier of today, as an effect (Phase 1)

Each row replaces the code named and keeps its numbers, so the world is the same; a golden `worldHash` is unchanged, or re-pinned for rounding in its own commit where the order of a multiplication moves.

| Effect         | Level                                                                                               | Replaces                                                                   | Scales or gates                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `fat`          | `share`: energy over the store                                                                      | `fatFactor` in `js/sim/physics.js`                                         | thrust and turn by `-fatSlowShare`                                                                     |
| `cold`         | `condition`: 1 under `temperatureColdModerate`, 2 under `temperatureColdStress`                     | `thrustEfficiency` and `passiveMultiplier` in `js/sim/temperature.js`      | thrust by the cold efficiency levels; passive loss by the cold share of `temperaturePassiveLossFactor` |
| `hot`          | `condition`: 1 above `temperatureHeatModerate`, 2 above `temperatureHeatStress`                     | the same two functions                                                     | thrust by the heat efficiency levels; passive loss by the heat share                                   |
| `chilled`      | `stacks`, plus 1 each tick under `temperatureOptimalMin`, minus `coldRecover` each tick at or above | the cold stack of [body-genes.md](body-genes.md) Phase 3, which moves here | passive loss by `coldStackRate`, capped by `coldStackMax` (off at the defaults)                        |
| `outOfBand`    | `condition`                                                                                         | `blocksMating` in `js/sim/temperature.js`                                  | closes `mate`                                                                                          |
| `grazing`      | `condition`: a non-hunter holding `BITE` above 0                                                    | `grazeFactor` in `js/sim/physics.js`                                       | thrust by `grazeThrust - 1`                                                                            |
| `handling`     | `timer`: `handlingTicks` after a meal                                                               | the `ateTimer` test in `thrustOf`                                          | thrust by `handlingThrust - 1`                                                                         |
| `digesting`    | `timer`: `digestTicks` after a meal                                                                 | `canEatNow` in `js/sim/feeding.js`                                         | closes `eat`                                                                                           |
| `sated`        | `condition`: energy above `satiationShare` of the store                                             | `canEatNow`                                                                | closes `eat`                                                                                           |
| `resting`      | `timer`: `predatorRestTicks` after a kill                                                           | the rest test in `thrustOf`                                                | thrust by -1                                                                                           |
| `spent`        | `share`: how far the sprint store is under `sprintFloor`                                            | `storeFactor` in `js/sim/sprint-store.js`                                  | the sprint boost by -1 at an empty store                                                               |
| `sick`         | `share`: the toxin dose over `sickDose`                                                             | `sickThrust` and `sickDrain` in `js/sim/toxin.js`                          | thrust and passive loss                                                                                |
| `diseased`     | `timer`: `diseaseTicks`                                                                             | `diseaseDrain` in `js/sim/disease.js`                                      | passive loss                                                                                           |
| `juvenile`     | `condition`: a hunter under `maturityTicks`                                                         | `juvenileBurnOf` in `js/sim/juvenile.js`                                   | passive loss by `juvenileBurn - 1`                                                                     |
| `pregnant`     | `timer`: `pregnancyTicks`                                                                           | the pregnancy test in `js/sim/mate-eligibility.js`                         | closes `mate`                                                                                          |
| `alarmSeen`    | `timer`: `callTicks` after an alarm fired with a threat on the caller's rays                        | `alarmBiteShare` in `js/sim/feeding.js`                                    | bites taken by `alarmBiteShare - 1`                                                                    |
| `calling`      | `timer`: `callTicks` after any call                                                                 | `huntTimer` and the alarm timer in `js/sim/calls.js`                       | closes a second call                                                                                   |
| `smokeCooling` | `timer`: `smokeCooldown`                                                                            | the cooldown in `js/sim/smoke.js`                                          | closes smoke                                                                                           |

The store's level, the temperature, the dose and the timers stay where they are; the effect is how each reaches a lane or a gate. After Phase 1 no code outside `stepEffects` multiplies a lane or tests one of these conditions.

## The social effects (Phase 2)

Each is built with its numbers at 0 (no effect) and switched on by [body-genes.md](body-genes.md) Phase 3, which chooses the numbers with the calculator and reads them under the keep rule. Each row states where its payoff returns and what stops a cheater, as selection rules 7 and 8 require.

| Effect      | Who gets it, and when                                                         | What it does                                                 | Its cost                                                                                                      | Cap and fade                                                                                 | Payoff returns by                                                                                                           | A cheater                                                                                                                              |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `rallied`   | a hunter that hears a kin's hunt call above `hearThreshold`                   | thrust and sprint boost by `rallyThrust` a stack             | passive loss and heat gain by `rallyBurn` a stack                                                             | 3 stacks; `ticks`, `rallyTicks` (120)                                                        | the kill the pack makes; a rallied hunter that does not close pays the burn for nothing                                     | cannot rally itself: the caller's own call gives it no stack                                                                           |
| `answered`  | the caller, when a hunter it rallied lands a bite within `rallyTicks`         | the caller's next `answeredTicks` of bites by `answeredBite` | none: it is paid by a result                                                                                  | 2 stacks; `ticks`                                                                            | the bite of the pack-mate it called in                                                                                      | two hunters calling at each other earn nothing: a stack needs a bite on prey, which the bite detectors already tell from a bite on kin |
| `hoarse`    | any caller, one stack a call                                                  | the cost of the next call by `hoarseCost` a stack            | it is the cost                                                                                                | 5 stacks; `perTick`, one every `hoarseTicks` (60); a call that a kin hears removes one stack | a call that reaches kin is cheap; a call into an empty field gets dearer each time                                          | -                                                                                                                                      |
| `alert`     | a non-hunter that hears an alarm above `hearThreshold`                        | turn rate and the sprint boost by `alertBoost` a stack       | thrust while grazing by `alertGraze` (it feeds less well while it watches)                                    | 2 stacks; `ticks`, `alertTicks` (90)                                                         | its own escape                                                                                                              | a false alarm costs its hearers a meal, and the caller its `hoarse` stack and `alarmCost`                                              |
| `huddled`   | a body with kin inside `huddleRange` (2 body sizes), one stack a neighbour    | heat loss by `huddleWarmth` a stack                          | the contagion of [disease.md](disease.md) passes between bodies in contact, and the food under them is shared | 4 stacks; `condition`, read every 8 ticks                                                    | warmth is mutual: each body in the huddle gives what it gets                                                                | a body cannot take warmth without giving it                                                                                            |
| `staggered` | a hunter a defender shoves (`tryDefenderRepel` in `js/sim/defender-repel.js`) | thrust by `staggerThrust`; closes `bite`                     | to the defender: `defenderRepelCost` a shove                                                                  | 3 stacks; `ticks`, `staggerTicks` (30)                                                       | the herd-mate that lives                                                                                                    | -                                                                                                                                      |
| `wounded`   | a body that is bitten and lives, one stack a bite                             | thrust by `woundThrust` a stack                              | -                                                                                                             | 5 stacks; `perTick`, one every `woundTicks` (300)                                            | to the hunter: a wounded body is slower, and the body sense shows it as slow, so a hunter that returns to it takes the weak | -                                                                                                                                      |

`rallied` and `answered` are the pack: a call is worth making only when a pack-mate is there to hear it and closes on the prey. `hoarse` is what a call into nothing costs. Neither pays a body for calling; `answered` pays for the bite the call brought.

| Key                                            | Default   | Meaning                                                    |
| ---------------------------------------------- | --------- | ---------------------------------------------------------- |
| `rallyThrust`, `rallyBurn`, `rallyTicks`       | 0, 0, 120 | the rally's boost, its burn and its length                 |
| `answeredBite`, `answeredTicks`                | 0, 120    | the caller's bite bonus and its length                     |
| `hoarseCost`, `hoarseTicks`                    | 0, 60     | the rise in call cost a stack, and the ticks a stack lasts |
| `alertBoost`, `alertGraze`, `alertTicks`       | 0, 0, 90  | the alert's boost, its grazing cost and its length         |
| `huddleWarmth`, `huddleRange`                  | 0, 2      | the heat loss saved a stack, and the range in body sizes   |
| `staggerThrust`, `staggerTicks`                | 0, 30     | the stagger's slowdown and its length                      |
| `woundThrust`, `woundTicks`                    | 0, 300    | the wound's slowdown a stack, and the ticks a stack lasts  |
| `coldStackRate`, `coldStackMax`, `coldRecover` | 0, 4, 4   | the cold stack of `chilled`                                |

A `perStack` number of 0 leaves the effect's level counted and its lanes untouched, so Phase 2 changes no behaviour and its detectors read how often each effect would be on.

## Detectors

Computed by the eval observer in `js/evo/scene-effects.js`; none is a reward.

| Metric                       | Direction      | Reads                                                                                    |
| ---------------------------- | -------------- | ---------------------------------------------------------------------------------------- |
| `eval.effect_share.<effect>` | watch          | the share of agent-ticks with the effect on, by spec                                     |
| `eval.rally_bite_share`      | watch (higher) | of rallied stacks, the share followed by a bite on prey within `rallyTicks`              |
| `eval.hoarse_call_share`     | watch (lower)  | of calls, the share made at 3 or more `hoarse` stacks                                    |
| `eval.huddle_cold_gain`      | watch          | the passive loss of huddled bodies over that of lone bodies at the same temperature band |

The scene metrics the effects must move exist: `eval.pack_kills_per_eaten_death`, `eval.hunt_call_answer`, `eval.alarm_response`, `eval.alarm_lift`.

## The calculator and the levels

- [role-budget.md](role-budget.md) reads effects through `roleParams(config, specName, traits, effects)`: a level per effect, composed as `stepEffects` composes it. The defender's row reads `staggered`, the scout's row `alert`, the sitter's row `chilled`, and a new row `pack:forager` reads two hunters, one rallied, against one alone and prints `packGain`, the catch margin a rally adds.
- [brain-reflex-tests.md](brain-reflex-tests.md) Phase 5 gains `answer-the-call`: a hunter with a kin's hunt call heard from a bearing and no prey in view turns to the bearing.

## Phases

### Phase 1 - The system, and every modifier of today

**Targets:** bench.step_ms@500, bench.phase_ms.physics@500

Inside the `bench-check` margin; `stepEffects` is a new phase row of `bench:parts`. The world is the same: goldens unchanged, or re-pinned for rounding in their own commit.

| Chunk | Tasks    | Builder |
| ----- | -------- | ------- |
| A     | T1 to T8 | Sonnet  |

### Phase 2 - The social effects, neutral

**Targets:** none - every new number is 0; its readings are the effect shares of "Detectors" on the default world, which say how often each effect's trigger occurs

| Chunk | Tasks     | Builder |
| ----- | --------- | ------- |
| B     | T9 to T14 | Sonnet  |

### Phase 3 - The numbers

**Targets:** eval.pack_kills_per_eaten_death, eval.hunt_call_answer, eval.alarm_response, eval.hunter_catches_per_1k_settled

The numbers are chosen with the calculator and read on the default world with [body-genes.md](body-genes.md) Phase 3, in the same screen and the same keep-rule pair. No trained brain is needed.

| Chunk | Tasks      | Builder |
| ----- | ---------- | ------- |
| C     | T15 to T19 | Sonnet  |

## Decisions

| Decision                                                     | Holds because                                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One registry for every within-life modifier                  | Eighteen rules in ten files each multiply a lane their own way; one place makes them testable by contract, visible in the inspector, readable by the calculator, and cheap to add to |
| An effect scales a lane; it never sets a behaviour           | A scripted mode that plays the life for the brain is refused (`docs/principles.md`); an effect changes what the body can do and the brain still chooses                              |
| No effect pays for an act                                    | A body paid for calling calls for ever. `rallied` goes to the hearer and costs it; `answered` pays the caller only for a pack-mate's bite on prey; `hoarse` prices the call          |
| Every effect has a cap                                       | Stacks without a cap make the largest pack unbeatable and the longest sitter immortal; the cap is in the registry and the contract tests assert it                                   |
| Social numbers start at 0 and are chosen with the calculator | An effect's strength is a balance question; the mechanism lands first so the calculator and the detectors can read it                                                                |
| The effects are built before any training                    | Each changes what a trained brain must learn; one retraining follows all of them (user, 2026-11-21)                                                                                  |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Sim core: `js/sim/effects.js` (`EFFECTS`, `EFFECT_INDEX`, `stepEffects`, `gateOpen`, `GATE`), `js/sim/effect-appliers.js`, `world.effects` and `world.live`; the readers of the eight affected lanes and of the four gates; the deleted rules of the Phase 1 table. Evo: `js/evo/scene-effects.js`, the `effects` argument of `roleParams`. Worker and UI: the inspector's effect rows and the renderer's effect marks ([ambient-display.md](ambient-display.md) reads `visible`). No Rust change: `move_all` already reads the speed cap and the sprint factor as per-slot lanes                                                                                                                                                                                                                                                              |
| Unit tests              | `test/sim/effects.contract.test.js`, over every registry entry: a level of 0 leaves every lane at its base; the level never passes `maxStacks`; a `ticks` effect ends on its tick and a `perTick` effect loses one stack every `n`; a scaled lane equals the base times the product, against a naive loop; a closed gate reads closed; `freeAgent` zeroes the state. `test/sim/effects-legacy.test.js`: for each Phase 1 row, the effect gives the number the replaced function gave over a grid of inputs. `test/sim/effect-appliers.test.js`: each applier on a staged world (a hunter hears a kin's call and gains one `rallied` stack; its own call gives it none; a bite on prey by a rallied hunter gives the caller `answered`, a bite on kin does not; a call heard by kin removes a `hoarse` stack). `test/evo/scene-effects.test.js` |
| Headless e2e            | Phase 1: every golden `worldHash` unchanged, or re-pinned for rounding with an eval report equal to 1e-9. Phase 2: unchanged (every new number is 0). Phase 3: re-pinned with the adoption; one golden with every social effect on, matched by `npm run browser:hash`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Performance budget      | `bench.step_ms@500` inside the margin of `bench/baseline.json`; `stepEffects` under 0.05 ms at 500 agents (it touches only slots whose level changed and the `nearby` appliers run every 8 ticks); no allocation per tick (`scripts/alloc-check.mjs`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Evolution metrics       | Phase 3 with body-genes.md T14 and T15: 16-seed screen, then 64 matched seeds with `eval:compare --keep-rule`; no guard `WORSE`; `eval.pack_kills_per_eaten_death`, `eval.hunt_call_answer` and `eval.alarm_response` reported with intervals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Determinism             | No RNG. Appliers and the product run in registry order; the `nearby` appliers read the spatial hash in slot order. A world replays bit for bit from seed and config                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Config and persistence  | The keys of the social table (each 0 or a length, so off); the effect state is saved and hashed with the world. The body input `reserve` joins the layout of body-genes.md Phase 1. Each rules change is a breaking PR to `main` with its `library/seasons.json` change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Logging and diagnostics | `EffectApplied` (debug: `tick`, `slot`, `effect`, `level`, `source`), once per stack gained, never per tick; `EffectCapped` (debug) when a stack is dropped at the cap. The inspector shows a followed agent's effects with their levels and ticks left. `npm run replay -- --seed <n> --ticks <t> --level debug --follow <genomeId>` lists them                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Browser compatibility   | No kernel change. The inspector rows and the effect marks are verified in Chromium by the walk                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Docs                    | This doc; [body-genes.md](body-genes.md) (the lane or state rule, the cold stack moved here); [role-budget.md](role-budget.md); `docs/commands.md`; a generated effects table beside `docs/trait-table.md` (`npm run traits -- --effects`). Once `Implemented` this doc describes every within-life modifier                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Verification            | `scripts/check.sh --fix --quick` per chunk and CI `check`; the full local gate under the CPU lock for Phase 1; the walk under Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

## Task breakdown

### Phase 1 - The system, and every modifier of today

| #   | Task                                                                                                                                                                                                                                       | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T1  | Add `js/sim/effects.js` (`EFFECTS` empty, the per-slot state, `stepEffects`, `gateOpen`, `world.live` for no lane yet) and its place first in the step; `test/sim/effects.contract.test.js` on two fixture effects; every golden unchanged | [judgement]  | -          |
| T2  | Move the body family: `fat`, `cold`, `hot`, `outOfBand`, `juvenile`, `spent`; delete `fatFactor`, the two temperature functions' lane factors and the `juvenileBurnOf` multiplier; `test/sim/effects-legacy.test.js` rows for each         | [judgement]  | T1         |
| T3  | Move the feeding family: `grazing`, `handling`, `digesting`, `sated`, `resting`, `sick`, `diseased`; the `eat` gate in `canEatNow`; legacy rows                                                                                            | [judgement]  | T1         |
| T4  | Move the social and combat rules of today: `pregnant`, `alarmSeen`, `calling`, `smokeCooling`; the `mate` and `bite` gates; legacy rows                                                                                                    | [judgement]  | T1         |
| T5  | Add the body input `reserve` in the layout commit of [body-genes.md](body-genes.md) T7 (or as its own layout version when that commit has merged); the inspector's effect rows; tests                                                      | [judgement]  | T2         |
| T6  | Add the `stepEffects` row to `bench:parts`, time it under the CPU lock and record it; re-record `bench/baseline.json` in its own commit if the step moved                                                                                  | [mechanical] | T2, T3, T4 |
| T7  | Add a test that fails any lane multiplied outside `stepEffects` (the functions the Phase 1 table deletes are gone, and `thrustOf` reads `world.live` only)                                                                                 | [mechanical] | T2, T3, T4 |
| T8  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                        | [judgement]  | T5, T6, T7 |

### Phase 2 - The social effects, neutral

| #   | Task                                                                                                                                                                                     | Nature      | Depends on   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------ |
| T9  | Add `chilled` (the cold stack) and `wounded` with their keys at 0 and their applier tests                                                                                                | [judgement] | T8           |
| T10 | Add `rallied`, `answered` and `hoarse` with their keys at 0: the hearing applier, the bite-on-prey event that pays `answered`, the call-cost lane; the applier tests of the Delivery row | [judgement] | T8           |
| T11 | Add `alert`, `huddled` and `staggered` with their keys at 0; the `nearby` applier on the spatial hash every 8 ticks; the shove's stagger in `tryDefenderRepel`                           | [judgement] | T8           |
| T12 | Add `js/evo/scene-effects.js` and the four detectors with their source tests and registry entries; run 16 seeds and record `eval.effect_share.*`                                         | [judgement] | T9, T10, T11 |
| T13 | Add the `effects` argument of `roleParams`, the `pack:forager` row and `packGain` to [role-budget.md](role-budget.md), and the `answer-the-call` reflex case; tests                      | [judgement] | T10          |
| T14 | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                      | [judgement] | T12, T13     |

### Phase 3 - The numbers

| #   | Task                                                                                                                                                                                                                                                                                                                                    | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T15 | Choose each effect's numbers with `role:budget`: `rallyThrust` and `rallyBurn` so `packGain` is above `tightTicks` and a lone hunter is no worse; `staggerThrust` and `staggerTicks` so the defender's intercept cell is `ok`; the cold stack with the sitter row; write the arms into the screen of [body-genes.md](body-genes.md) T14 | [judgement]  | T14        |
| T16 | Read the arms in that 16-seed screen and the 64-seed keep-rule pair; record the scene metrics and each effect's share                                                                                                                                                                                                                   | [mechanical] | T15        |
| T17 | Check the cheats on the finalist with scripted bodies: two hunters that only call at each other gain no `answered` stack and lose energy; a body that calls alone reaches 5 `hoarse` stacks; a rallied hunter that never closes ends below an unrallied one                                                                             | [judgement]  | T15        |
| T18 | Adopt with body-genes.md T18 as a breaking PR to `main` with its `library/seasons.json` change: the finalist's numbers become the defaults, goldens re-pinned in their own commit; an effect whose guard reads `WORSE` keeps its numbers at 0                                                                                           | [judgement]  | T16, T17   |
| T19 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`; move the Status line to `Implemented`                                                                                                                                                                                                              | [judgement]  | T18        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh --fix --quick` and CI `check` per chunk.
2. Phase 1: every golden unchanged or re-pinned for rounding; `rg 'fatFactor|grazeFactor|thrustEfficiency' js/sim` finds no caller; the inspector shows `fat`, `cold` and `spent` on a followed agent.
3. Phase 2: `npm run eval -- --seeds 16 --ticks 200000` reports `eval.effect_share.*`, and the report's other metrics equal Phase 1's.
4. Phase 3: the PR body names the scenes **Pack, or loner** and **Call, or don't**, the keep-rule output and the three cheat checks of T17.
5. Browser walk: follow a hunter, hear it call, and see `rallied` appear on a pack-mate and `answered` on the caller when the pack-mate bites; follow a body that stands still in the cold and see `chilled` climb.
