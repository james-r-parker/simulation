# Alarm calls

**Status:** Proposed - Phase 1 instruments built (T1 to T3, #343) and the T4 baseline run (`E-E-2`, 16 floor-on seeds, in Baseline): no call on any seed, and the audience a call would reach is about 3 prey. The forced-call diagnosis (T5 to T7) is open; Phase 2 adds three default-off switches, Phase 3 judges them, Phase 4 adopts or deletes; none is built beyond the `alarmOnSight` controller.
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

> Note: T6 re-checks each source before it is quoted in `sim-notes.md`; no number in this doc depends on them.

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

Evidence: diagnostic D1 (a 4-seed look, not an experiment; command and config under Baseline): `eval.alarm_rate` 0 on all four seeds,
`eval.idle_signals_per_1k` 0, `eval.alarm_precision`, `eval.alarm_response` and `eval.kin_within_call_radius` all `null` ("no
alarm call"), `eval.population_mean` 169, `eval.input_active_share.threat` 0.025. Not one `ALARM_CALLED` event in 120,000
agent-ticks of world time per seed. The old alarm rate of 8.1 per 1000 (E42) was pre-instinct random drift with precision
0.0003.

| #   | Cause                                               | Evidence                                                                                                                                                                                                                                                    | Nature gap                                                                                                           |
| --- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| C1  | **No first mover.** Founders never call             | `SILENT_BIAS` -2 puts the alarm output near -0.96 against a threshold of 0.65; D1 shows zero calls. A call that never fires is never selected, so the gene never gets a gradient. The thresholds and costs screens (T15h, T15d) only ever moved drift calls | Alarm production is largely innate in vertebrates (Seyfarth et al. 1980): founders call at a threat from birth       |
| C2  | **No receiver.** Hearing does nothing               | No reflex reads `heard`; the response must also evolve, and it only pays when calls exist. Signal and response are a two-sided coordination problem (Maynard Smith and Harper 2003), and both sides start at zero                                           | Recognition of alarm calls is partly innate and refined by experience (Hollen and Radford 2009)                      |
| C3  | **Hearing reaches almost nobody.**                  | About 170 agents on a 14,400 x 8,100 px map: 1.5e-6 per px2. A 300 px circle is 283,000 px2, so a call is expected to reach 0.4 other agents of any kind, fewer kin. World-balance B8 measured 0.2 to 0.4 living kin near a caller                          | Callers live beside the receivers who gain (Sherman 1977: kin form neighbourhoods)                                   |
| C4  | **No direct benefit.** The caller gains nothing     | A call changes nothing for the caller: no rule lowers the chance a hunter bites it, no hunter reads it. All of the benefit is the unmeasured chance that a neighbour (one in 0.4) both hears, responds and is kin                                           | Pursuit deterrence and perception advertisement pay the caller (Zahavi 1987; Caro 2005; Bergstrom and Lachmann 2001) |
| C5  | **The cost is real, the price of silence is zero.** | `alarmCost` 5 is about 20% of an intake step (0.5 was 2%, `sim-notes.md` 2026-10-17 "Alarm-call spam"); with no benefit, selection removes any call that mutation finds                                                                                     | Real calls cost time and risk, and pay back through kin or the caller's own safety                                   |
| C6  | **No cost of attracting the predator.**             | Hunters hear calls (`hearOne`) but no hunter prior points them at one. The honest tension (a call may bring the predator) is absent, so a call is cheap and meaningless in one way and useless in another                                                   | Predators eavesdrop (Klump and Shalter 1984; Magrath et al. 2015)                                                    |
| C7  | **The instrument is blind with no calls.**          | Precision, response and kin radius are `null` with no call; there is no number for the opportunity (how many prey and kin sit within `callRadius` of a threatened prey) that does not need a call                                                           | -                                                                                                                    |

Two older results are consistent with this and are not repeated: raising the cost or the threshold only removes drift calls
(`sim-notes.md` T15h and T15d screens), and the fitness term that paid for an alarm (`ALARM` 40 in `fitnessV6`) is deleted
([natural-selection.md](natural-selection.md) K15), which is right: paying a call makes a remote control.

The cheapest cause to fix is C1 and C4 together (a founder prior that calls when a threat is seen, and a direct benefit to the
caller), then C2 (a receiver prior), then C6 (the cost that keeps calls honest). C3 is a habitat and kin question the keepers
work (`juvenileDependency`, E134) already moves; the doc measures it first, and sweeps `callRadius` as a screen arm, not a
switch.

## Baseline

**Reach baseline (`E-E-2`, Phase 1 T4).** 16 seeds from `evals/seeds.json`, floor on, defaults (`alarmOnSight` off), policy
`live`, 200,000 ticks, config hash `ff8d890a5a70c14d`, on `c346a20e`. Population mean 236 (the D1 table below is at 169).

| Metric                                                                                      | Mean | Range across seeds  | Seeds with a value |
| ------------------------------------------------------------------------------------------- | ---- | ------------------- | ------------------ |
| `eval.call_opportunity_neighbours` (other non-hunters in 300 px of a threatened prey)       | 3.17 | 1.53 to 5.57        | 16 of 16           |
| `eval.call_opportunity_kin` (same-lineage share of those)                                   | 2.44 | 1.10 to 5.33        | 16 of 16           |
| `eval.alarm_rate`                                                                           | 0    | 0 on every seed     | 16 of 16 (zero)    |
| `eval.alarm_calls_with_threat_per_1k`                                                       | 0    | 0 on every seed     | 16 of 16 (zero)    |
| `eval.alarm_hearers_per_call`, `eval.alarm_hunter_hearers_per_call`, `eval.alarm_precision` | -    | no call on any seed | 0 of 16            |
| `eval.predators_at_end`                                                                     | 24.7 | 0 to 97             | 16 of 16           |
| `eval.prey_types_at_end`                                                                    | 3.44 | 1 to 4              | 16 of 16           |

Reading. No blob calls on any seed, as the D1 diagnosis found, so every hearer metric is null by construction and cannot
rank the forced-call arms until T5 supplies calls. The audience is real: a threatened prey has about 3 other prey within
300 px, about 2 of them kin. The D1 row "expected agents inside `callRadius` 0.4 by density" is superseded. It was a
uniform-density estimate (about 0.4 at 169 agents, 0.6 at 236, in a 14,400 by 8,100 px world with a 300 px disc); the
measured count is about five times that because threat clusters prey. The count excludes the agent itself
(`countOpportunity` in `observer-intent-group.js`), so the gap is not a self-count. `eval:power` cannot read this report:
it needs 2 times the arm size in seeds, and the smallest arm it accepts is 16, so 16 seeds give no power read. A 32-seed
run is needed for the power column.

Diagnostic D1 (4 seeds, 30,000 ticks; a quick look that orders the work, not a result any verdict cites). Reproduce at
`f5c7880` with the defaults (no `--config`, so `juvenileDependency` is false, `satedBite` false, floor on, flip reflex and
hunter territory on) and policy `live` (`LIVE_POLICY`, `map-elites-v6`, registered in `js/evo/policies/index.js`):

```
node scripts/eval.mjs --seeds 4 --ticks 30000 --policy live --workers 2 --out /tmp/claude-1000/eval-out/E/alarm-diag-default.json
```

| Metric                              | Value (D1, 4 seeds x 30,000 ticks, floor on)            |
| ----------------------------------- | ------------------------------------------------------- |
| `eval.alarm_rate`                   | 0 per 1000 agent-ticks on 4 of 4 seeds                  |
| `eval.alarm_precision`              | `null` on 4 of 4 seeds                                  |
| `eval.alarm_response`               | `null` on 4 of 4 seeds                                  |
| `eval.kin_within_call_radius`       | `null` on 4 of 4 seeds                                  |
| `eval.input_active_share.threat`    | 0.025 mean over 4 seeds                                 |
| `eval.population_mean`              | 169 mean over 4 seeds                                   |
| Expected agents inside `callRadius` | 0.4 by density (computed, not measured; T2 measures it) |

The 16-seed, 200,000-tick baseline on the defaults current when T4 runs (E-E-2) replaces this table; T4 records the config
hash, because stream L may adopt `juvenileDependency` and other keepers first. The kin count in Phase 1 reads the same D5
sample as `eval.group_cohesion_under_threat`, so the baseline value of that metric is the kin reference.

## Config keys and options

All default off or to the neutral value, so Phase 2 leaves the four golden cases unchanged. Keys live in
`js/sim/config-defaults.js` and `js/sim/config-rules.js`, whose owner edits them; the keys are a request, not a change by
this doc. Every numeric key is read only under its switch, and is deleted with the switch (T19, T20).

| Key                    | Default | Meaning                                                                                                                                                                                 |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alarmReflex`          | false   | Non-hunter founders start with innate links: a threat ray drives the alarm output over `alarmThreshold`, and a heard alarm drives thrust and turn away through two hidden units         |
| `alarmReflexWeight`    | 3       | The skip weight from the `threat` strength cell to the `ALARM` output; the alarm bias under the switch is `REFLEX_BIAS` (-0.5, a constant in `instinct.js`). In [0, 4] (`WEIGHT_CLAMP`) |
| `alarmFleeWeight`      | 2       | The weight of the two hidden-unit paths from a heard alarm to thrust and turn away; in [0, 4]. Used only with `alarmReflex`                                                             |
| `alarmDeterrence`      | false   | A bite on a prey whose `alarmTimer` is above 0 takes `alarmGuard` times the energy it otherwise takes (the strike is spoiled by a prey that has seen the predator)                      |
| `alarmGuard`           | 0.6     | The factor on the energy a bite takes from a calling prey, in (0, 1]; used only with `alarmDeterrence`; the screen sweeps 0.8, 0.6 and 0.4                                              |
| `alarmAttractsHunters` | false   | Hunter founders start with a path from a heard alarm to thrust and turn towards its bearing, through two hidden units (`alarmEavesdropWeight`): the call costs by drawing the predator  |
| `alarmEavesdropWeight` | 2       | The weight of the hunter path, in [0, 4]; used only with `alarmAttractsHunters`                                                                                                         |

Arithmetic of the sender link: the output is `tanh` of the sum of the bias and the weighted inputs, and it must exceed
`alarmThreshold` 0.65, so the sum must exceed atanh(0.65) = 0.78. A threat ray at strength 1 gives -0.5 + 3 x 1 = 2.5 (output
0.99); at strength 0.5 it gives 1.0 (0.76); a blank ray gives -0.5 (-0.46). Below strength about 0.43 the output stays under
the threshold, so a distant sighting stays silent.

Receiver paths: the heard alarm is a body input (`BODY_INPUT.HEARD_ALARM`: loudness, ahead, side), so it has no `wSkip` row
(`wSkip` holds the pooled ray values only). `applyInstinct` therefore writes the existing `wIn` cells from the heard inputs
into two reserved hidden units and the existing `wOut` cells from those units to `THRUST` and `TURN`. No block changes size,
so `BRAIN_LAYOUT_NAME` stays and no archive or champion file is refused. The sign of the turn path is pinned by a test, as
`SINE` is in `instinct.js`.

`callRadius` (300) is an existing key; the screen sweeps it (300, 450, 600) as an arm, and it is never a switch. The three
booleans are in the flag ledger from the commit that adds the keys, each with its deletion task.

## Detectors

The scene's detectors are `eval.alarm_precision`, `eval.alarm_response`, `eval.idle_signals_per_1k`,
`eval.kin_within_call_radius` and `eval.social_return` ([principles.md](../principles.md), Call, or don't). Phase 1 adds the
instruments that read the opportunity and the reach, all `watch`, observer-only (`js/evo/`, no sim state):

| Metric                                | Direction | Reads                                                                                                                                                                                           |
| ------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eval.call_opportunity_neighbours`    | watch     | In the D5 sample (`sampleGroups` in `observer-intent-group.js`), for each threatened non-hunter, the mean count of other non-hunters of any lineage within `callRadius`; one added counter pass |
| `eval.call_opportunity_kin`           | watch     | The mean same-lineage count around a threatened non-hunter, which is `groupThreatSum` over `groupThreatN` the D5 sample already keeps; the ceiling on the kin term. No call needed              |
| `eval.alarm_hearers_per_call`         | watch     | Over `ALARM_CALLED` events, the mean number of non-hunters with `heard` alarm loudness above 0; `null` with no call                                                                             |
| `eval.alarm_hunter_hearers_per_call`  | watch     | Over `ALARM_CALLED` events, the mean number of `canHunt` agents that hear it; `null` with no call                                                                                               |
| `eval.alarm_calls_with_threat_per_1k` | watch     | `ALARM_CALLED` events with a threat sighting within `INTENT_WINDOW` ticks, per 1000 non-hunter agent-ticks; the honest calls, so that spam does not hide in `eval.alarm_rate`                   |

Honesty check (read `eval.alarm_calls_with_threat_per_1k` against the all-calls rate, `eval.alarm_rate`): the share of calls
made with no threat sighting must stay under half. A call with no hunter near pays 5 and, under `alarmDeterrence`, returns
nothing, because the guard acts only on a bite and no bite lands without a hunter.

Pass bands for the scene on the default world after Phase 4, read before any adoption: calls with a threat are at least 50%
of calls, `eval.alarm_precision` above 0.05 on at least 8 of 16 seeds, `eval.alarm_response` above 0 with an interval that
excludes 0, and `eval.idle_signals_per_1k` not above the defaults. A switch that fails these still stays when it does no
harm (the keep rule); the bands say whether the scene appeared.

## Phases

### Phase 1 - Instruments and a forced-call diagnosis

**Targets:** none - the new metrics are instruments (`watch`) and no existing metric moves; the phase ends with a written diagnosis that ranks C1 to C7 by measured effect.

Adds the five detectors above (the kin and neighbour counts reuse the D5 sample, so there is one sampling pass) and a
scripted `alarmOnSight` controller (a non-hunter that raises the alarm output whenever a threat ray fires and otherwise stays
silent, in `js/evo/scripted-combat.js` beside `alarmSpammer`). A seeded run with the controller on a fixed share of prey
(10%, 30%, 100%) separates the causes: reach (hearers and kin per call), receiver (`eval.alarm_response` with calls
guaranteed) and benefit (kills of hearers against matched controls).

Chunks:

| Chunk                            | Tasks      | Boundary                                                                                                            |
| -------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| A - Instruments (Code, built)    | T1, T2, T3 | The five metrics and the `alarmOnSight` controller with tests; no sim change, goldens identical                     |
| B - Diagnose (Runs and write-up) | T4 to T7   | The 16-seed reference run (E-E-2), the forced-call runs (E-E-3), the sim-notes diagnosis and the conformance review |

### Phase 2 - Mechanisms behind switches

**Targets:** eval.alarm_precision, eval.alarm_response, eval.kin_within_call_radius, eval.idle_signals_per_1k, eval.social_return, eval.hunt_abort_rate

Three switches, each its own commit and test, all default off:

- **`alarmReflex`** (C1, C2). `applyInstinct` seeds, on a non-hunter founder, the threat strength to `ALARM` skip weight
  (`alarmReflexWeight`) and sets the `ALARM` output bias to `REFLEX_BIAS`, so the first call happens at the first close
  sighting (arithmetic under Config keys). It seeds the receiver through two reserved hidden units: `wIn` cells from the heard
  loudness and side inputs, and `wOut` cells to `THRUST` and `TURN` (`alarmFleeWeight`). `alarmCost` and `alarmThreshold`
  stay, so a lineage that gains nothing from calling can mutate the link away. A hunter founder is unchanged.
- **`alarmDeterrence`** (C4). In `applyBite` in `js/sim/feeding.js`, the energy a bite takes (`bite * taken`, where `taken` is
  the victim's `biteTakenMultiplier`) is multiplied by `alarmGuard` while `world.alarmTimer[victim]` is above 0. It is
  arithmetic on state the signal phase already wrote, so it draws no RNG. A prey that called has seen the predator and
  spoils the strike (perception advertisement, Caro 2005).
- **`alarmAttractsHunters`** (C6). `applyInstinct` seeds a hunter path from a heard alarm to thrust and turn towards its
  bearing, through two reserved hidden units (`alarmEavesdropWeight`). The call now draws the predator as well as warning the
  prey, and the two effects have to net positive for calling to stay.

Why deterrence is a physical consequence and not a paid act (selection rules 5 to 7, and `natural-selection.md` K15): no
energy, fitness or reward reaches the caller. The factor lowers what a hunter takes from a prey that has been seen to see it,
the same kind of rule as a defender's `biteTakenMultiplier`. The caller still pays `alarmCost` on every call, so a call at
nothing is a loss and a call at a hunter is a gamble on a 0.6 factor against 5 energy. The hunter, not the caller, carries the
change, and `eval.hunt_abort_rate` and the kill-conversion guards read it.

Chunks:

| Chunk                 | Tasks     | Boundary                                                                                                                                            |
| --------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| C - Mechanisms (Code) | T8 to T14 | The keys with their ledger rows, the three switches with tests, the allocation and bench checks, goldens identical with all off, conformance review |

### Phase 3 - Screen and confirm

**Targets:** eval.alarm_precision, eval.alarm_response, eval.kin_within_call_radius, eval.idle_signals_per_1k, eval.social_return, eval.hunt_abort_rate

Runs only, no code. The screen (8 seeds, 200,000 ticks, floor on; orders the work, never judges) has the arms `reflex`,
`deterrence`, `eavesdrop`, `reflex+deterrence`, `reflex+deterrence+eavesdrop`, `guard-0.8`, `guard-0.6` and `guard-0.4` (each
`deterrence` with `reflex` on and that `alarmGuard`), and `callRadius` 450 and 600 on `reflex+deterrence`, against the
defaults. `alarmGuard` 0.6 has no nature number behind it; the sweep finds where the factor matters. Each arm that shows any
call is confirmed on 16 floor-on seeds, and any arm that is to be kept is checked for harm by paired intervals on 32 matched
floor-on seeds (the keep rule in [realistic-keepers.md](realistic-keepers.md): hunters alive at the last tick on 12 of 16
seeds or more, no more seeds under 80 agents than the defaults, no guard `worse`: `eval.population_mean`,
`eval.predators_at_end`, `eval.prey_types_at_end`, `eval.spec_effective`, `eval.hunter_kill_conversion_by_age.1k-2k`,
`eval.prey_extinctions`). A floor-off run of the kept package is watched, not a target.

Chunks:

| Chunk                 | Tasks    | Boundary                                                                                      |
| --------------------- | -------- | --------------------------------------------------------------------------------------------- |
| D - Screen (Runs)     | T15, T16 | The 8-seed screen and the 16-seed confirmation (E-E-4); no code                               |
| E - Harm check (Runs) | T17, T18 | The 32-seed paired harm check and the floor-off watch run (E-E-5), and the conformance review |

### Phase 4 - Adopt and delete

**Targets:** eval.alarm_precision, eval.alarm_response, eval.idle_signals_per_1k

One verdict per switch from the Phase 3 results. A switch that does no harm is adopted (default on) even when its scene
metric does not move ([realistic-keepers.md](realistic-keepers.md) keep rule); a switch that harms is deleted with its
key, its numeric keys and its code. A switch kept on loses its flag, its old path and its numeric keys that nothing sweeps in
the same chunk, and the golden hashes and the bench baseline are re-pinned in commits of their own.

Chunks:

| Chunk            | Tasks      | Boundary                                                                                                     |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| F - Adopt (Code) | T19 to T22 | One verdict per switch, the flag-ledger deletions, the golden re-pin, the doc status, the conformance review |

## Decisions

Every row is Delegated: the user was away and the doc's author answered the create-plan interview.

| Decision                                                                                                   | Why                                                                                                                                                                                                                          | Source    |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Phase 1 is instruments and a forced-call diagnosis before any mechanism                                    | With no calls every scene metric is `null`; the opportunity and a forced call give the numbers that rank C1 to C7 and tell which mechanism to build first                                                                    | Delegated |
| Three switches, one per cause group (founder prior and receiver, direct benefit, eavesdropping cost)       | Nature gives calling a direct benefit, a kin benefit and a cost (table above); each switch is a keep or delete verdict on its own                                                                                            | Delegated |
| The benefit is a factor on the energy a bite takes from a calling prey, not a reward and not a free escape | Perception advertisement pays at low density with no kin. The factor is a physical consequence on the hunter's side (like `biteTakenMultiplier`), pays the caller nothing, and a call at nothing still costs 5 and returns 0 | Delegated |
| No fitness term pays for a call or a response                                                              | [natural-selection.md](natural-selection.md) K15 deleted `ALARM` and `HUNT_CALL`; paying an act makes a remote control (principles.md)                                                                                       | Delegated |
| `alarmCost` 5 and `alarmThreshold` 0.65 stay                                                               | Raising them only removed drift calls (T15h and T15d screens); the cost is what keeps a call honest once calls exist                                                                                                         | Delegated |
| `alarmReflex` writes existing cells only: `wSkip`, `bOut`, `wIn` and `wOut`; no block changes size         | The heard alarm is a body input with no `wSkip` row, so the receiver goes through two reserved hidden units; the layout name and archive version stay, so no champion or archive file is refused                             | Delegated |
| The sender needs `REFLEX_BIAS` -0.5 and weight 3, not the silent bias                                      | At bias -2 and weight at most 2 the sum is at most 0, under the 0.78 the threshold needs; -0.5 + 3 x strength clears it above strength 0.43 and stays silent on a blank ray                                                  | Delegated |
| `callRadius` is swept as a screen arm, not a switch                                                        | It is an existing numeric key; hearing range in nature follows where kin live (Marler 1955; Sherman 1977), and the keepers' `juvenileDependency` already moves where kin live                                                | Delegated |
| Kin reach reads the D5 sample, not a new one                                                               | `sampleGroups` already counts same-lineage agents within `callRadius` of threatened and calm prey; a second sample would duplicate the pass and could disagree with `eval.group_cohesion_under_threat`                       | Delegated |
| `alarmGuard` is swept (0.8, 0.6, 0.4), not fixed                                                           | No nature number gives the factor; the screen finds where it changes the picture                                                                                                                                             | Delegated |
| Priority 21                                                                                                | The scene is a single watch row with no guard role; it queues behind the refuge, keepers and balance work whose adoptions change the kin and cover it depends on                                                             | Delegated |
| Mate attraction and reciprocity are not candidates                                                         | Mate-advertising calls are a different signal (the sim has no call for it), and reciprocity has thin evidence in the wild (Hollen and Radford 2009)                                                                          | Delegated |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/evo/`: new `observer-alarm-reach.js` (hearers per call, hunters among them, calls with a threat) registered in `metrics-intent.js`; the neighbour counter added to `sampleGroups` in `observer-intent-group.js`; `alarmOnSight` in `scripted-combat.js`; the founder links in `applyInstinct` (`instinct.js`). `js/sim/`: the bite factor in `applyBite` (`feeding.js`). No layout change, no DOM, no new dependency                                                                                                                                                                                                                          |
| Unit tests              | `test/evo/observer-alarm-reach.test.js` (hearers inside and outside the radius, hunters counted apart, a call with no threat); `test/evo/observer-intent-group.test.js` (neighbours of any lineage and kin on hand-built worlds); `test/evo/instinct.test.js` (the cells appear only with the switch; the layout name is unchanged; a threat ray at strength 1 drives `ALARM` above `alarmThreshold` and a blank ray leaves it below; a heard alarm drives thrust, the turn sign pinned); `test/sim/feeding.test.js` (a bite takes `alarmGuard` times the energy only while `alarmTimer` is above 0, and the standard amount with the switch off) |
| Headless e2e            | Phases 1 and 2 leave the four golden cases unchanged (all switches off); `eval-smoke` runs with the new metrics. Phase 4 re-pins in Node and Chromium (`npm run browser:hash`) in one commit if a switch goes on by default                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Performance budget      | Off path: `bench.step_ms@500` and `bench.phase_ms.*@500` inside the `bench-check` threshold; the bite factor is one read behind the switch. Observer-only metrics add no sim cost. On path: under +1% on `bench.phase_ms.signal@500` and `bench.step_ms@500` (`npm run bench:parts -- --area signal`)                                                                                                                                                                                                                                                                                                                                             |
| Evolution metrics       | Phase 1: the five metrics on a 16-seed floor-on run and `eval:power`. Phase 3: the Targets by `eval:compare` on 16 seeds per arm (screen on 8 orders only), and the 32-seed paired harm check. A metric with no power at 16 seeds is not cited in a verdict                                                                                                                                                                                                                                                                                                                                                                                       |
| Determinism             | No new RNG stream and no draw: the observer is arithmetic, the bite factor a multiplication of a value the signal phase wrote, the instinct cells written after the random fill (no extra draw, as `applyInstinct` says). All replayable from seed and config                                                                                                                                                                                                                                                                                                                                                                                     |
| Config and persistence  | The seven keys above, all default off or neutral, with the three flag-ledger rows added in the same commit as the keys (deletion tasks T19 and T20); no IndexedDB, archive or genome format change (existing cells only)                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Logging and diagnostics | `AlarmConfig` (info, once: the switches and weights). Existing `ALARM_CALLED` events carry the caller; a `replay --level debug` log for a seed shows each call, and `--follow <genomeId>` follows a caller. No per-agent per-tick logging                                                                                                                                                                                                                                                                                                                                                                                                         |
| Browser compatibility   | N/A - the keys run in the sim core and the metrics in the eval observer; no new browser API; the renderer shows calls as it does today                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Docs                    | This doc (as-built once `Implemented`; `Validated` and `Priority` dropped); [principles.md](../principles.md) Call, or don't row; [evolution-evals.md](evolution-evals.md) Metrics table; [sim-notes.md](sim-notes.md) Phase 1 diagnosis                                                                                                                                                                                                                                                                                                                                                                                                          |
| Verification            | `scripts/check.sh` green per chunk PR; the manual browser walk below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Task breakdown

### Phase 1 - Instruments and a forced-call diagnosis

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | (built, #343) Add `eval.alarm_hearers_per_call`, `eval.alarm_hunter_hearers_per_call` and `eval.alarm_calls_with_threat_per_1k` (`observer-alarm-reach.js`) with tests (built)                                                                                                                                                                                                                                                                                                                                                                                                                                                        | [mechanical] | -          |
| T2  | (built, #343) Add `eval.call_opportunity_neighbours` (one counter in `sampleGroups`) and `eval.call_opportunity_kin` (from the existing D5 sums), with tests (built)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | [mechanical] | -          |
| T3  | (built, #343) Add the `alarmOnSight` scripted controller and a test that it calls only with a threat ray (built)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [mechanical] | -          |
| T4  | Re-run the defaults on 16 seeds at 200,000 ticks for the opportunity metrics and `eval:power`, recording the config hash (E-E-2) - built (Baseline section; `eval:power` could not read 16 seeds); the command was: run `npm run eval -- --seeds 16 --ticks 200000 --policy live --workers 8 --out /tmp/claude-1000/eval-out/E/alarm-reach-baseline.json`, then `npm run eval:power -- /tmp/claude-1000/eval-out/E/alarm-reach-baseline.json --include-watch --metrics eval.alarm_hearers_per_call,eval.alarm_hunter_hearers_per_call,eval.alarm_calls_with_threat_per_1k,eval.call_opportunity_neighbours,eval.call_opportunity_kin` | [mechanical] | T1, T2     |
| T5  | Forced-call runs: `alarmOnSight` on 10%, 30% and 100% of prey, 16 seeds each, read hearers, response and kills of hearers against controls (E-E-3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | [judgement]  | T3, T4     |
| T6  | Write the diagnosis in `sim-notes.md`, ranking C1 to C7 by measured effect, and re-check each nature source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | [judgement]  | T5         |
| T7  | Phase 1 conformance review                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | [judgement]  | T6         |

### Phase 2 - Mechanisms behind switches

| #   | Task                                                                                                                                                                                      | Nature       | Depends on    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| T8  | Add the seven keys, their validation and the three flag-ledger rows in one commit                                                                                                         | [mechanical] | T7            |
| T9  | `alarmReflex` sender: the threat-to-`ALARM` skip weight and `REFLEX_BIAS` in `applyInstinct`; unit test: threat ray at strength 1 gives `ALARM` above `alarmThreshold`, a blank ray below | [judgement]  | T8            |
| T10 | `alarmReflex` receiver: the two reserved hidden units, `wIn` and `wOut` cells in `applyInstinct`; unit tests for the cells, the pinned turn sign and the unchanged layout name            | [judgement]  | T9            |
| T11 | `alarmDeterrence`: the `alarmGuard` factor in `applyBite` while `alarmTimer` is above 0, with tests                                                                                       | [judgement]  | T8            |
| T12 | `alarmAttractsHunters`: the hunter path from a heard alarm in `applyInstinct`, with tests                                                                                                 | [judgement]  | T10           |
| T13 | Allocation, bench and golden checks with every switch off and on                                                                                                                          | [mechanical] | T10, T11, T12 |
| T14 | Phase 2 conformance review                                                                                                                                                                | [judgement]  | T13           |

### Phase 3 - Screen and confirm

| #   | Task                                                                                                                   | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T15 | The 8-seed screen grid (`evals/screens/alarm.grid.json`): the arms named in Phase 3, with the prediction written first | [judgement]  | T14        |
| T16 | The 16-seed confirmation of each arm with any call, floor on, `eval:compare` against the defaults (E-E-4)              | [mechanical] | T15        |
| T17 | The 32-seed paired harm check of each arm to keep, and the floor-off watch run (E-E-5)                                 | [mechanical] | T16        |
| T18 | Phase 3 conformance review                                                                                             | [judgement]  | T17        |

### Phase 4 - Adopt and delete

| #   | Task                                                                                                                                          | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T19 | One verdict per switch from T16 and T17; delete each loser's switch, numeric keys and code and its flag-ledger row                            | [judgement]  | T18        |
| T20 | Delete the flag, old path, numeric keys and ledger row of each switch adopted on                                                              | [mechanical] | T19        |
| T21 | Re-pin the golden hashes in Node and Chromium and re-record the bench baseline, each in its own commit, on a quiet machine under the CPU lock | [mechanical] | T20        |
| T22 | Move the status line, the principles Call, or don't row and the evolution-evals Metrics table; Phase 4 conformance review                     | [judgement]  | T21        |

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
