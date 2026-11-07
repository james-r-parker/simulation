# Alarm calls

**Status:** Proposed - research and diagnosis only; nothing built. Phase 1 adds instruments and a forced-call diagnosis, Phase 2 adds three default-off switches, Phase 3 judges them, Phase 4 adopts or deletes.
**Validated:** f5c7880 (2026-11-07)
**Priority:** 21 - the Call, or don't scene is absent (alarm rate 0, precision null on every diagnosis seed); it follows the refuge and keepers work because a call needs prey near kin and a hunter to bite, which cover and juvenile dependency change
**Depends on:** [realistic-keepers.md](realistic-keepers.md), [refuge.md](refuge.md)

The goal ([principles.md](../principles.md)) is a world that is interesting to watch. The scene **Call, or don't** reads: an
alarm moves neighbours, and another blob in the same trouble stays quiet and keeps the meal. Calling has a cost, and hearing
is not obedience. Today no blob calls at all. This doc explains why from nature and from the code, and plans the smallest
mechanisms that give calling a chance to be worth its cost, each behind a default-off switch and judged for no harm.

The scenes served: **Call, or don't** (all phases), **Kin is not a stranger** (the kin term of the benefit), **Pack, or
loner** (hunters eavesdrop). Nothing pays fitness for a call ([principles.md](../principles.md), "Measure scenes, reward them
almost never"); the mechanisms change a cost, a permission or a starting prior, and selection finds the use.

## Context

### Nature - why animals give alarm calls

| Route                           | What it says                                                                                                                                                      | Source                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Kin selection                   | Callers pay and relatives gain. Belding's ground squirrels with kin nearby call more, and calls mostly warn relatives                                             | Hamilton 1964; Sherman 1977 (Science 197), 1985 (Behav. Ecol. Sociobiol. 17) |
| Direct benefit, no altruism     | The call tells the predator it has been seen (perception advertisement, pursuit deterrence), so the caller is the one who gains                                   | Zahavi 1987; Caro 2005 (Antipredator Defenses in Birds and Mammals)          |
| Costly signal of vigilance      | A call that only a watchful animal can afford is believed by the predator; a dishonest caller pays when the predator tests it                                     | Bergstrom and Lachmann 2001 (Anim. Behav. 61)                                |
| Selfish herd and manipulation   | A call scatters neighbours, so the caller hides in the confusion; or it makes others flee first and the predator takes them                                       | Hamilton 1971; Charnov and Krebs 1975 (Am. Nat. 109)                         |
| Reciprocity                     | Group members take turns to watch and call. Evidence in the wild is thin; kin and direct benefit explain most cases                                               | Trivers 1971; Hollen and Radford 2009 (Anim. Behav. 78)                      |
| The meaning of a call is learnt | Production is largely innate; receivers learn which call means which predator and refine the response with age and experience                                     | Seyfarth, Cheney and Marler 1980 (vervets); Hollen and Radford 2009          |
| Costs                           | A call can attract the predator (eavesdropping), costs time and vigilance, and a false call loses the group's trust (cry wolf)                                    | Klump and Shalter 1984; Magrath et al. 2015 (Biol. Rev. 90)                  |
| Hearing range                   | High pitched, short calls are hard to locate and carry little; calls that recruit carry far. Range is set by where the receivers are: kin live next to the caller | Marler 1955 (Nature 176); Blumstein 2007 (Marmot alarm calls)                |

> Note: These sources are cited from memory of the literature and were not re-fetched in the session that wrote this doc.
> Phase 1 does not depend on any number in them; the first task re-checks each reference before it is quoted in sim-notes.

Two facts from the table shape the plan. A call with a **direct benefit** needs no kin and works at low density, so it is
the first route to give the sim. A call that only helps others needs **receivers who are near and kin**, and receivers
that already respond.

### What the code does today (read from code)

| Part              | Where                                                                                                                       | Behaviour                                                                                                                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trigger           | `alarm` in `js/sim/calls.js`                                                                                                | A non-hunter (`canHunt` false) calls when output `OUTPUT_INDEX.ALARM` is above `alarmThreshold` (0.65), its timer is 0 and its energy is above `alarmCost` (5). It pays `removeEnergy` with `LOSS_CAUSE.COST`  |
| Effect of a call  | `alarm`, `hearPass`, `spread`, `hearOne`                                                                                    | Sets `alarmTimer` to `callTicks` (60), deposits danger pheromone, pushes `ALARM_CALLED`; every alive agent within `callRadius` (300 px) gets a loudness (linear in distance, fading with the timer) in `heard` |
| Who hears         | `hearOne`                                                                                                                   | Everyone alive, hunters included. The loudest call wins the row; no check of kin, lineage or species                                                                                                           |
| What hearing does | `js/sim/scent-inputs.js`, `BODY_INPUT.HEARD_ALARM`                                                                          | The loudness, ahead and side become brain inputs. Nothing else in the sim reacts to a call. No reflex, no fitness, no rule reads `heard`                                                                       |
| Founders          | `applyInstinct` in `js/evo/instinct.js`                                                                                     | A non-hunter thrusts and turns away from a threat ray. The alarm, hunt-call and smoke output biases start at `SILENT_BIAS` (-2, so the output is about -0.96). No weight links a heard alarm to any output     |
| Kin               | `isKin` in `js/sim/kin.js`                                                                                                  | Parent, child or sibling by a shared parent id. The alarm credit in the observer uses whole lineages (`matchAlarms` in `js/evo/observer-intent-alarms.js`)                                                     |
| Detectors         | `noteCall` in `js/evo/observer-intent-events.js`, `intentMetrics` in `js/evo/metrics-intent.js`, `js/evo/observer-alarm.js` | Precision is the lift of (threat sighting within `INTENT_WINDOW`) over the caller's own base rate; response is the hearers' speed change against matched controls; both are `null` with no call                |

### Diagnosis - why calling never evolves

Evidence: E-E-1, 4 seeds x 30,000 ticks, default config, policy `live`, 2 workers (report at
`/tmp/claude-1000/eval-out/E/alarm-diag-default.json`, not committed): `eval.alarm_rate` 0 on all four seeds,
`eval.idle_signals_per_1k` 0, `eval.alarm_precision`, `eval.alarm_response` and `eval.kin_within_call_radius` all `null` ("no
alarm call"), `eval.population_mean` 169, `eval.input_active_share.threat` 0.025. Not one `ALARM_CALLED` event in 120,000
agent-ticks of world time per seed. The old alarm rate of 8.1 per 1000 (E42) was pre-instinct random drift with precision
0.0003.

| #   | Cause                                               | Evidence                                                                                                                                                                                                                                                       | Nature gap                                                                                                           |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C1  | **No first mover.** Founders never call             | `SILENT_BIAS` -2 puts the alarm output near -0.96 against a threshold of 0.65; E-E-1 shows zero calls. A call that never fires is never selected, so the gene never gets a gradient. The thresholds and costs screens (T15h, T15d) only ever moved drift calls | Alarm production is largely innate in vertebrates (Seyfarth et al. 1980): founders call at a threat from birth       |
| C2  | **No receiver.** Hearing does nothing               | No reflex reads `heard`; the response must also evolve, and it only pays when calls exist. Signal and response are a two-sided coordination problem (Maynard Smith and Harper 2003), and both sides start at zero                                              | Recognition of alarm calls is partly innate and refined by experience (Hollen and Radford 2009)                      |
| C3  | **Hearing reaches almost nobody.**                  | About 170 agents on a 14,400 x 8,100 px map: 1.5e-6 per px2. A 300 px circle is 283,000 px2, so a call is expected to reach 0.4 other agents of any kind, fewer kin. World-balance B8 measured 0.2 to 0.4 living kin near a caller                             | Callers live beside the receivers who gain (Sherman 1977: kin form neighbourhoods)                                   |
| C4  | **No direct benefit.** The caller gains nothing     | A call changes nothing for the caller: no rule lowers the chance a hunter bites it, no hunter reads it. All of the benefit is the unmeasured chance that a neighbour (one in 0.4) both hears, responds and is kin                                              | Pursuit deterrence and perception advertisement pay the caller (Zahavi 1987; Caro 2005; Bergstrom and Lachmann 2001) |
| C5  | **The cost is real, the price of silence is zero.** | `alarmCost` 5 is about 20% of an intake step (0.5 was 2%, `sim-notes.md` 2026-10-17 "Alarm-call spam"); with no benefit, selection removes any call that mutation finds                                                                                        | Real calls cost time and risk, and pay back through kin or the caller's own safety                                   |
| C6  | **No cost of attracting the predator.**             | Hunters hear calls (`hearOne`) but no hunter prior points them at one. The honest tension (a call may bring the predator) is absent, so a call is cheap and meaningless in one way and useless in another                                                      | Predators eavesdrop (Klump and Shalter 1984; Magrath et al. 2015)                                                    |
| C7  | **The instrument is blind with no calls.**          | Precision, response and kin radius are `null` with no call; there is no number for the opportunity (how many prey and kin sit within `callRadius` of a threatened prey) that does not need a call                                                              | -                                                                                                                    |

Two older results are consistent with this and are not repeated: raising the cost or the threshold only removes drift calls
(`sim-notes.md` T15h and T15d screens), and the fitness term that paid for an alarm (`ALARM` 40 in `fitnessV6`) is deleted
([natural-selection.md](natural-selection.md) K15), which is right: paying a call makes a remote control.

The cheapest cause to fix is C1 and C4 together (a founder prior that calls when a threat is seen, and a direct benefit to the
caller), then C2 (a receiver prior), then C6 (the cost that keeps calls honest). C3 is a habitat and kin question the keepers
work (`juvenileDependency`, E134) already moves; the doc measures it first, and sweeps `callRadius` as a screen arm, not a
switch.

## Baseline

| Metric                              | Value (floor on)                                        |
| ----------------------------------- | ------------------------------------------------------- |
| `eval.alarm_rate`                   | 0 per 1000 agent-ticks, 4 seeds (E-E-1)                 |
| `eval.alarm_precision`              | `null` on 4 of 4 seeds (E-E-1)                          |
| `eval.alarm_response`               | `null` on 4 of 4 seeds (E-E-1)                          |
| `eval.kin_within_call_radius`       | `null` on 4 of 4 seeds (E-E-1)                          |
| `eval.input_active_share.threat`    | 0.025 mean over 4 seeds (E-E-1)                         |
| `eval.population_mean`              | 169 mean over 4 seeds, 30,000 ticks (E-E-1)             |
| Expected agents inside `callRadius` | 0.4 by density (computed, not measured; T2 measures it) |

## Config keys and options

All default off or to the neutral value, so Phase 2 leaves the four golden cases unchanged. Keys live in
`js/sim/config-defaults.js` and `js/sim/config-rules.js`, whose owner edits them; the keys are a request, not a change by
this doc.

| Key                    | Default | Meaning                                                                                                                                                                                           |
| ---------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alarmReflex`          | false   | Founders (non-hunters) start with innate links: a threat ray raises the alarm output towards `alarmThreshold`, and a heard alarm adds thrust and turn away from its bearing (`alarmReflexWeight`) |
| `alarmReflexWeight`    | 0.5     | The weight of both links, as a share of `instinctWeight`; in [0, 2]. Used only with `alarmReflex`                                                                                                 |
| `alarmDeterrence`      | false   | A bite on a prey whose `alarmTimer` is above 0 lands at `alarmGuard` of the normal rate: the predator has been seen (perception advertisement)                                                    |
| `alarmGuard`           | 0.6     | The bite factor against a calling prey, in (0, 1]; used only with `alarmDeterrence`                                                                                                               |
| `alarmAttractsHunters` | false   | Hunter founders start with a link from a heard alarm to thrust and turn towards its bearing (`alarmEavesdropWeight`): the call costs by drawing the predator                                      |
| `alarmEavesdropWeight` | 0.5     | The weight of the hunter link, as a share of `instinctWeight`; in [0, 2]. Used only with `alarmAttractsHunters`                                                                                   |

`callRadius` (300) is an existing key; the screen sweeps it (300, 450, 600) as an arm, and it is never a switch. The three
booleans are in the flag ledger from the commit that adds them, each with its deletion task.

## Detectors

The scene's detectors are `eval.alarm_precision`, `eval.alarm_response`, `eval.idle_signals_per_1k`,
`eval.kin_within_call_radius` and `eval.social_return` ([principles.md](../principles.md), Call, or don't). Phase 1 adds the
instruments that read the opportunity and the reach, all `watch`, observer-only (`js/evo/`, no sim state):

| Metric                                | Direction | Reads                                                                                                                                                                         |
| ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.call_opportunity_neighbours`    | watch     | Every 10 ticks after burn-in, for each threatened non-hunter (a "can bite me" ray at `THREAT_PROXIMITY` or more): the mean count of other non-hunters within `callRadius`     |
| `eval.call_opportunity_kin`           | watch     | The same count restricted to `isKin` or the same lineage; the ceiling on the kin term of the benefit. Needs no call, so it reads with the switches off                        |
| `eval.alarm_hearers_per_call`         | watch     | Over `ALARM_CALLED` events, the mean number of non-hunters with `heard` alarm loudness above 0; `null` with no call                                                           |
| `eval.alarm_hunter_hearers_per_call`  | watch     | Over `ALARM_CALLED` events, the mean number of `canHunt` agents that hear it; `null` with no call                                                                             |
| `eval.alarm_calls_with_threat_per_1k` | watch     | `ALARM_CALLED` events with a threat sighting within `INTENT_WINDOW` ticks, per 1000 non-hunter agent-ticks; the honest calls, so that spam does not hide in `eval.alarm_rate` |

Pass bands for the scene on the default world after Phase 4, read before any adoption: calls with a threat are at least 50%
of calls, `eval.alarm_precision` above 0.05 on at least 8 of 16 seeds, `eval.alarm_response` above 0 with an interval that
excludes 0, and `eval.idle_signals_per_1k` not above the E-E-1-era default. A switch that fails these still stays when it
does no harm (the keep rule); the bands say whether the scene appeared.

## Phases

### Phase 1 - Instruments and a forced-call diagnosis

**Targets:** none - the new metrics are instruments (`watch`) and no existing metric moves; the phase ends with a written diagnosis that ranks C1 to C7 by measured effect.

Adds the five detectors above and a scripted `alarmOnSight` controller (a non-hunter that raises the alarm output whenever a
threat ray fires and otherwise stays silent, in `js/evo/scripted-combat.js` beside `alarmSpammer`). A seeded run with the
controller on a fixed share of prey (10%, 30%, 100%) separates the causes: reach (hearers and kin per call), receiver
(`eval.alarm_response` with calls guaranteed) and benefit (kills of hearers against matched controls).

Chunks:

| Chunk                  | Tasks      | Boundary                                                                                                 |
| ---------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| A - Instruments (Code) | T1, T2, T3 | The five metrics and the `alarmOnSight` controller with tests; no sim change, goldens identical          |
| B - Diagnose (Runs)    | T4, T5, T6 | The reference re-check, the forced-call runs (E-E-2), the sim-notes diagnosis and the conformance review |

### Phase 2 - Mechanisms behind switches

**Targets:** eval.alarm_precision, eval.alarm_response, eval.kin_within_call_radius, eval.idle_signals_per_1k, eval.social_return, eval.hunt_abort_rate

Three switches, each its own commit and test, all default off:

- **`alarmReflex`** (C1, C2). `applyInstinct` seeds two links on a non-hunter founder: threat ray strength to the alarm output
  (so the first call happens at the first sighting), and a heard alarm (a `heard` channel in the layout's skip block) to thrust
  away and turn away. Weights only: the brain layout name and archive format do not change. The cost (`alarmCost`) and the
  threshold stay, so a lineage that gains nothing from calling can mutate the link away.
- **`alarmDeterrence`** (C4). The bite rule multiplies the landing rate of a bite on a prey with `alarmTimer` above 0 by
  `alarmGuard`, the way cover lowers a bite inside a ring. The caller gains only while a hunter is near, so a call at nothing
  pays 5 and returns nothing: honesty follows from the cost.
- **`alarmAttractsHunters`** (C6). `applyInstinct` seeds the hunter link from a heard alarm to thrust and turn towards it. The
  call now draws the predator as well as warning the prey, and the two effects have to net positive for calling to stay.

Chunks:

| Chunk                 | Tasks                     | Boundary                                                                                                                     |
| --------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| C - Mechanisms (Code) | T7, T8, T9, T10, T11, T12 | The keys, the three switches with tests, the allocation and bench checks, goldens identical with all off, conformance review |

### Phase 3 - Screen and confirm

**Targets:** eval.alarm_precision, eval.alarm_response, eval.kin_within_call_radius, eval.idle_signals_per_1k, eval.social_return, eval.hunt_abort_rate

Runs only, no code. The screen (8 seeds, 200,000 ticks, floor on; orders the work, never judges) has the arms `reflex`,
`deterrence`, `eavesdrop`, `reflex+deterrence`, `reflex+deterrence+eavesdrop` and `callRadius` 450 and 600 on the best of
them, against the defaults. Each arm that shows any call is confirmed on 16 floor-on seeds, and any arm that is to be kept
is checked for harm by paired intervals on 32 matched floor-on seeds (the keep rule in [realistic-keepers.md](realistic-keepers.md):
hunters alive at the last tick on 12 of 16 seeds or more, no more seeds under 80 agents than the defaults, no guard `worse`:
`eval.population_mean`, `eval.predators_at_end`, `eval.prey_types_at_end`, `eval.spec_effective`,
`eval.hunter_kill_conversion_by_age.1k-2k`, `eval.prey_extinctions`). A floor-off run of the kept package is watched, not a
target.

Chunks:

| Chunk                 | Tasks    | Boundary                                                                           |
| --------------------- | -------- | ---------------------------------------------------------------------------------- |
| D - Screen (Runs)     | T13, T14 | The 8-seed screen and the 16-seed confirmation (E-E-3, E-E-4); no code             |
| E - Harm check (Runs) | T15      | The 32-seed paired harm check of the kept arms and the floor-off watch run (E-E-5) |

### Phase 4 - Adopt and delete

**Targets:** eval.alarm_precision, eval.alarm_response, eval.idle_signals_per_1k

One verdict per switch from the Phase 3 results. A switch that does no harm is adopted (default on) even when its scene
metric does not move ([realistic-keepers.md](realistic-keepers.md) keep rule); a switch that harms is deleted with its
key and its code. A switch kept on loses its flag and its old path in the same chunk, and the golden hashes and the bench
baseline are re-pinned in commits of their own.

Chunks:

| Chunk            | Tasks              | Boundary                                                                                                     |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| F - Adopt (Code) | T16, T17, T18, T19 | One verdict per switch, the flag-ledger deletions, the golden re-pin, the doc status, the conformance review |

## Decisions

Every row is Delegated: the user was away and the doc's author answered the create-plan interview.

| Decision                                                                                                 | Why                                                                                                                                                                           | Source    |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Phase 1 is instruments and a forced-call diagnosis before any mechanism                                  | With no calls every scene metric is `null`; the opportunity and a forced call give the numbers that rank C1 to C7 and tell which mechanism to build first                     | Delegated |
| Three switches, one per cause group (founder prior and receiver, direct benefit, eavesdropping cost)     | Nature gives calling a direct benefit, a kin benefit and a cost (table above); each switch is a keep or delete verdict on its own                                             | Delegated |
| The benefit is a bite factor on the calling prey (`alarmDeterrence`), not a reward and not a free escape | Perception advertisement is the route that pays at low density with no kin; a bite factor pays only while a hunter is near, so a call at nothing still costs 5 and returns 0  | Delegated |
| No fitness term pays for a call or a response                                                            | [natural-selection.md](natural-selection.md) K15 deleted `ALARM` and `HUNT_CALL`; paying an act makes a remote control (principles.md)                                        | Delegated |
| `alarmCost` 5 and `alarmThreshold` 0.65 stay                                                             | Raising them only removed drift calls (T15h and T15d screens); the cost is what keeps a call honest once calls exist                                                          | Delegated |
| `alarmReflex` changes weights only, not the brain layout                                                 | The layout name and archive version stay, so no champion or archive file is refused; a lineage can mutate the prior away                                                      | Delegated |
| `callRadius` is swept as a screen arm, not a switch                                                      | It is an existing numeric key; hearing range in nature follows where kin live (Marler 1955; Sherman 1977), and the keepers' `juvenileDependency` already moves where kin live | Delegated |
| Kin reach is measured (`eval.call_opportunity_kin`), not built                                           | `isKin` (parent, child, sibling) and the lineage rule differ (world-balance B16); the number says whether the kin term can pay before anything is changed                     | Delegated |
| Priority 21                                                                                              | The scene is a single watch row with no guard role; it queues behind the refuge, keepers and balance work whose adoptions change the kin and cover it depends on              | Delegated |
| Mate attraction and reciprocity are not candidates                                                       | Mate-advertising calls are a different signal (the sim has no call for it), and reciprocity has thin evidence in the wild (Hollen and Radford 2009)                           | Delegated |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/`: new `observer-alarm-reach.js` (hearers per call, hunters among them, calls with a threat) and `scene-call-opportunity.js` (the 10-tick neighbour and kin sample), registered in `metrics-intent.js`; `alarmOnSight` in `scripted-combat.js`. `js/sim/`: the heard-alarm skip channel in `brain-layout.js` and its seeding in `js/evo/instinct.js` (`applyInstinct`), the bite factor in `bite-rule.js`. No DOM, no new dependency |
| Unit tests              | `test/evo/observer-alarm-reach.test.js` (hearers inside and outside the radius, hunters counted apart, a call with no threat), `test/evo/scene-call-opportunity.test.js` (neighbours and kin on hand-built worlds, hunters excluded), `test/evo/instinct.test.js` (the links appear only with the switch, the layout name is unchanged), `test/sim/bite-rule.test.js` (the factor applies only while `alarmTimer` is above 0)                |
| Headless e2e            | Phases 1 and 2 leave the four golden cases unchanged (all switches off); `eval-smoke` runs with the new metrics. Phase 4 re-pins in Node and Chromium (`npm run browser:hash`) in one commit if a switch goes on by default                                                                                                                                                                                                                  |
| Performance budget      | Off path: `bench.step_ms@500` and `bench.phase_ms.*@500` inside the `bench-check` threshold; the bite factor is one read behind the switch. Observer-only metrics add no sim cost. On path: under +1% on `bench.phase_ms.signal@500` and `bench.step_ms@500` (`npm run bench:parts -- --area signal`)                                                                                                                                        |
| Evolution metrics       | Phase 1: the five metrics on a 16-seed floor-on run and `eval:power`. Phase 3: the Targets by `eval:compare` on 16 seeds per arm (screen on 8 orders only), and the 32-seed paired harm check. A metric with no power at 16 seeds is not cited in a verdict                                                                                                                                                                                  |
| Determinism             | No new RNG stream: the observer is arithmetic, the bite factor a multiplication, the instinct links use the existing `brain-init` stream through `randomGenome` with no extra draw when the switch is off. All replayable from seed and config                                                                                                                                                                                               |
| Config and persistence  | The six keys above, all default off or neutral; flag-ledger rows for `alarmReflex`, `alarmDeterrence` and `alarmAttractsHunters` with deletion tasks T16 and T17; no IndexedDB, archive or genome format change (weights only)                                                                                                                                                                                                               |
| Logging and diagnostics | `AlarmConfig` (info, once: the switches and weights). Existing `ALARM_CALLED` events carry the caller; a `replay --level debug` log for a seed shows each call, and `--follow <genomeId>` follows a caller. No per-agent per-tick logging                                                                                                                                                                                                    |
| Browser compatibility   | N/A - the keys run in the sim core and the metrics in the eval observer; no new browser API; the renderer shows calls as it does today                                                                                                                                                                                                                                                                                                       |
| Docs                    | This doc (as-built once `Implemented`; `Validated` and `Priority` dropped); [principles.md](../principles.md) Call, or don't row; [evolution-evals.md](evolution-evals.md) Metrics table; [sim-notes.md](sim-notes.md) Phase 1 diagnosis                                                                                                                                                                                                     |
| Verification            | `scripts/check.sh` green per chunk PR; the manual browser walk below                                                                                                                                                                                                                                                                                                                                                                         |

## Task breakdown

### Phase 1 - Instruments and a forced-call diagnosis

| #   | Task                                                                                                                                                     | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `eval.alarm_hearers_per_call`, `eval.alarm_hunter_hearers_per_call` and `eval.alarm_calls_with_threat_per_1k` (`observer-alarm-reach.js`) with tests | [mechanical] | -          |
| T2  | Add `eval.call_opportunity_neighbours` and `eval.call_opportunity_kin` (`scene-call-opportunity.js`), threatened prey sampled every 10 ticks, with tests | [judgement]  | -          |
| T3  | Add the `alarmOnSight` scripted controller and a test that it calls only with a threat ray                                                               | [mechanical] | -          |
| T4  | Re-run the default 16 seeds at 200,000 ticks for the opportunity metrics and `eval:power` (E-E-2)                                                        | [mechanical] | T1, T2     |
| T5  | Forced-call runs: `alarmOnSight` on 10%, 30% and 100% of prey, 16 seeds each, read hearers, response and kills of hearers against controls (E-E-3)       | [judgement]  | T3, T4     |
| T6  | Write the diagnosis in `sim-notes.md`, ranking C1 to C7 by measured effect, and run the Phase 1 conformance review                                       | [judgement]  | T5         |

### Phase 2 - Mechanisms behind switches

| #   | Task                                                                                                                                                  | Nature       | Depends on  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| T7  | Add the six keys, their validation and the three flag-ledger rows (needs the owner of `config-defaults.js`, `config-rules.js` and `flag-ledger.json`) | [mechanical] | T6          |
| T8  | `alarmReflex`: the heard-alarm skip channel and the founder links in `applyInstinct`, with tests that the layout name is unchanged                    | [judgement]  | T7          |
| T9  | `alarmDeterrence`: the bite factor in `bite-rule.js` while `alarmTimer` is above 0, with tests                                                        | [judgement]  | T7          |
| T10 | `alarmAttractsHunters`: the hunter link from a heard alarm in `applyInstinct`, with tests                                                             | [judgement]  | T7          |
| T11 | Allocation, bench and golden checks with every switch off and on                                                                                      | [mechanical] | T8, T9, T10 |
| T12 | Phase 2 conformance review                                                                                                                            | [judgement]  | T11         |

### Phase 3 - Screen and confirm

| #   | Task                                                                                                                                           | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T13 | The 8-seed screen grid (`evals/screens/alarm.grid.json`): the five switch arms and `callRadius` 450 and 600, with the prediction written first | [judgement]  | T12        |
| T14 | The 16-seed confirmation of each arm with any call, floor on, `eval:compare` against the defaults (E-E-4)                                      | [mechanical] | T13        |
| T15 | The 32-seed paired harm check of each arm to keep, and the floor-off watch run (E-E-5)                                                         | [mechanical] | T14        |

### Phase 4 - Adopt and delete

| #   | Task                                                                                                                                          | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T16 | One verdict per switch from T14 and T15; delete each loser's key and code and its flag-ledger row                                             | [judgement]  | T15        |
| T17 | Delete the flag and old path of each switch adopted on, and its ledger row                                                                    | [mechanical] | T16        |
| T18 | Re-pin the golden hashes in Node and Chromium and re-record the bench baseline, each in its own commit, on a quiet machine under the CPU lock | [mechanical] | T17        |
| T19 | Move the status line, the principles Call, or don't row and the evolution-evals Metrics table; Phase 4 conformance review                     | [judgement]  | T18        |

## Verification

1. `scripts/check.sh` is green per chunk PR, including the golden test, `bench-check`, `eval-smoke` and the detector tests.
2. `node scripts/replay.mjs --seed 1 --ticks 40000 --level debug --policy map-elites-v6 --config <file with the switches on> --check-invariants`
   logs `AlarmConfig` once, shows `ALARM_CALLED` events with a threat ray and no error.
3. `npm run eval:power -- <report>` rates each new metric; a metric with no power is not cited in a verdict.
4. Manual browser walk after Phase 2 (`npm run dev`, http://localhost:5173), with the three switches on:
    1. Follow a prey (click it) until a hunter closes on it; it should call once and run.
    2. A prey of the same family within a few hundred px turns away from the bearing of the call.
    3. A hunter within hearing range turns towards the call.
    4. A prey with no hunter near stays silent.
