# Hunter practice

**Status:** Proposed - hunters improve with age: a probe that measures practice without survivorship, a learnable pursuit skill credited by the meal, and a sensitive period; nothing built.
**Validated:** f5c7880 (2026-11-07)
**Priority:** 23 - the within-lifetime gain is negative in every E124 arm and the cause is a weak channel plus a biased detector, not a missing feature
**Depends on:** [hunter-learning.md](hunter-learning.md), [realistic-keepers.md](realistic-keepers.md)

Real predators are poor hunters when young and good hunters when old, and the gap closes through practice, not through
growth alone. Hunters here do not close it: `eval.hunter_conversion_gain` is negative in all nine arms of E124, rewarded
or not, and kill conversion falls with age (`eval.hunter_kill_conversion_by_age`: 0.126 under 1,000 ticks, 0.097 at 1,000
to 2,000, 0.052 beyond 2,000 on the defaults arm). This doc diagnoses why, adds a measurement that is not fooled by who
survives, and adds a switch that lets a hunter's pursuit skill grow inside a life the way an animal's does.

The scenes served: **A real chase** and **Abort** (a hunter that has practised closes on the prey it can catch and peels
off the rest), and the trait "the same genome is a different animal at each age" ([principles.md](../principles.md)).
The selection rules are untouched: nothing here pays fitness for a kill, and nothing enters the world that a hunter did
not eat ([principles.md](../principles.md), "Measure scenes, reward them almost never").

## Principle - skill is measured without survival, learned without a fitness term

- **Survival is not competence, and competence measured on survivors is not skill.** The same hunter at two ages is the
  right comparison, but a hunter that reaches the second age was kept alive by its first-age kills. A detector that
  conditions on reaching the second age is biased towards a fall.
- **The reward is the meal, and it arrives after the act.** A rule that strengthens whatever the brain is doing while it
  is fed credits the eating, not the chase.
- **Learning does not change the genome.** A child inherits the genome, never what its parent learned; evolution may
  shape how well a lineage learns (the `learnGene` trait), which is the Baldwin effect and needs no new rule.
- **No-harm first.** Each switch is judged by the keep rule of [realistic-keepers.md](realistic-keepers.md) (paired
  intervals on 32 matched floor-on seeds); a competence gain is required of the probe, not of a world run.
- **Independent of `rewardedHebb`, `provisionEnabled` and `predatorRestTicks`.** This doc adds its own reward hook and
  its own state; whichever of those the keeper round deletes, nothing here changes.

## Context

### Nature model

Sources are cited from memory and are to be checked before a number from them is relied on.

| Behaviour in nature                                                                                                                                                                                                                                                             | Maps to                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Young predators hunt worse than adults and improve over months to years: spotted hyena cubs and lion subadults have lower hunting success than adults (Holekamp et al. 1997, J Zool; Funston et al. 2001, J Zool)                                                               | The age-binned conversion is the right shape of detector, but it must be read on hunters of one cohort, not on whoever survives      |
| Juvenile birds forage less efficiently than adults; the lag is skill and experience, not size alone (Marchetti and Price 1989, Biol Rev; Wunderle 1991, Current Ornithology)                                                                                                    | Competence rises with experience at fixed body; the probe holds the body fixed and varies only practice                              |
| Cheetah mothers and domestic cat mothers bring live, weakened prey to the young; kittens raised without the mother pounce but kill less often (Caro 1980; Caro 1994)                                                                                                            | Practice needs prey the learner can catch; a chance meeting with a healthy adult prey teaches little                                 |
| Meerkat helpers give pups disabled, then live, scorpions as the pups age (Thornton and McAuliffe 2006, Science); teaching in animals is rare and defined by a cost to the teacher (Caro and Hauser 1992)                                                                        | Graded difficulty is a nature mechanism; the doc keeps it as a conditional Phase 3 and does not add teaching                         |
| Killer whale calves practise intentional stranding under the mother's watch and succeed more with age (Guinet and Bouvier 1995, Can J Zool)                                                                                                                                     | A long learning period is normal for a hunter whose method is hard; the sensitive period below lasts `juvenileTicks`                 |
| Play is motor training: the young repeat the stalk, chase and pounce parts out of context (Byers and Walker 1995, Am Nat; Bekoff and Byers 1998)                                                                                                                                | No energy-neutral play exists without a toy, so play is excluded; the reward-credited chase is the practice                          |
| Motor skill and prey choice are learned separately: the sequence is largely innate and refined, while what to attack is learned from outcomes and, in some species, from watching the mother                                                                                    | The pursuit gain (how hard to close, when to bite) is the learnable part; prey choice lives in the hidden path the brain already has |
| Dopamine marks a reward that is better than expected and acts on synapses tagged by recent activity: a three-factor rule with an eligibility trace (Schultz, Dayan and Montague 1997, Science; Izhikevich 2007, Cereb Cortex; Fremaux and Gerstner 2016, Front Neural Circuits) | The credit rule is an eligibility trace times the meal, not a product of the instantaneous activity and a reward scale               |
| Plasticity is highest in a sensitive period and falls with maturity (Hensch 2005, Nat Rev Neurosci)                                                                                                                                                                             | `practiceWindowTicks` scales the learning rate down with age                                                                         |

### What exists

| Piece                   | Where                                                                                                                                            | State                                                                                                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plastic block           | `fastOut`, `hebbianStep`, `resetFastOut` in [hebbian.js](../../js/sim/hebbian.js); `outputStep` in [brain.js](../../js/sim/brain.js)             | Hidden-to-output only, 10 gene outputs. The update is `eta x (h x out - HEBB_DECAY x (f - w))` on this tick's hidden and output rows; `eta` is `hebbianRate` 0.0001 x sigmoid(`learnGene`)                                |
| The hunt reflex         | `applyHunterReflex` in [instinct.js](../../js/evo/instinct.js); `addSkip` in [brain.js](../../js/sim/brain.js)                                   | Prey strength to thrust, prey sine to turn, prey strength to bite (bite at twice the weight), all in the skip block; the skip block is genome only and "not plastic" by its own doc comment                               |
| Reward trace            | `noteReward`, `rewardScale` in [reward.js](../../js/sim/reward.js)                                                                               | Behind `rewardedHebb`: the trace only scales `eta` by `rewardBase` + `rewardGain` x trace; no eligibility, no per-weight credit. Counts per 1,000 hunter agent-ticks on E124 defaults: kill 0.31, bite 9.6, scavenge 0.95 |
| Chase tracker           | `trackApproaches` in [scene-approach.js](../../js/evo/scene-approach.js); `noteChase` in [scene-competence.js](../../js/evo/scene-competence.js) | A chase opens at the first closing sighting of prey and resolves caught, escaped or given up; each is binned by the hunter's age at opening and by whether it could eat (`canEatNow`)                                     |
| Within-lifetime gain    | `gainMetrics`, `noteGainChase` in [scene-competence.js](../../js/evo/scene-competence.js)                                                        | Per hunter, conversion at ages 3,000 to 3,999 minus conversion at 1,000 to 1,999, over hunters with at least `MIN_GAIN_CHASES` (2) resolved chases in each band                                                           |
| Probe infrastructure    | `scripts/memory-probe.mjs`, `js/evo/memory-probe*.js`                                                                                            | Staged scenarios, controls (intact, blindfold, amnesia) and reference controllers run on champion files; no scenario scores a hunter's catch rate                                                                         |
| Age and juvenile window | `ageTicks`; `juvenileTicks` 3000; `maturityTicks` 600                                                                                            | The detectors' age bands; no mechanic reads them for learning                                                                                                                                                             |

### Diagnosis - why E124 showed no gain

The E124 reports (`evals/screens/results/hunter-practice/`, 8 seeds, floor off) and the code give five causes. The first
two decide whether a gain can be seen; the last three decide whether one can exist.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                       | Evidence                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The detector has a built-in fall. `gainMetrics` keeps only hunters that lived from the early band to the late band. Hunters die mostly of starvation (death share starved about 0.73, E110), so a hunter that reaches 3,000 ticks was fed by its early catches: its early conversion is biased up and its late conversion regresses to its true rate. Conversion is about 0.1, so two or three chases per band is mostly luck | The no-plasticity arm (`hebbianRate` 0) has gain -0.048, the most negative of nine arms, with no learning at all. The arms differ by 0.04 and the gain spans -0.20 to +0.06 per seed. The null for this detector is negative, not 0                                               |
| D2  | Conversion falls with age in the pooled data of every arm, including no plasticity, so age is confounded with other things: an older hunter is better fed (it chases without need, and a chase that does not become a bite is a give-up), holds a territory the prey have learned to leave, and sees prey that survived earlier chases                                                                                        | Defaults 0.126, 0.097, 0.052 across the three age bands; no-plasticity 0.112, 0.082, 0.057. The fall appears with learning off. `eval.hunter_kill_conversion_hungry.1k-2k` exists for one band only; there is no matched-energy or matched-experience read                        |
| D3  | The skill that matters is not in the plastic path. The hunt reflex (approach, turn, bite on the prey channel) sits in the skip block, which is not plastic. `hebbianStep` moves only hidden-to-output weights, which a hunter uses mostly for what the hidden state (memory, other channels) adds                                                                                                                             | `applyHunterReflex` writes the skip cells; the skip block is read in `addSkip` and never written in a life; `fastOut` is `hidden x geneOutputs`                                                                                                                                   |
| D4  | The rule has no credit assignment. `hebbianStep` multiplies this tick's hidden and output activity. The meal arrives after the chase, and the chase and the meal are different ticks, so a reward scale reinforces whatever the brain does in the 35-tick half-life after a meal, which is eating, not hunting. `rewardScale` changes `eta`, never which weights move                                                         | `reward.js`: the trace decays by `rewardDecay` 0.02 per tick (half-life about 35 ticks) and only multiplies the rate. In E124 the shuffled-reward arm (the same rewards at unrelated times) had the best gain, -0.005, which is what a rule that ignores the timing would produce |
| D5  | The step is small and the signal is sparse. `eta` is at most 0.0001 (at most 4.25 times that with `rewardedHebb` on), so a weight moves at most 0.1 to 0.3 in 1,000 to 3,000 ticks even if every product has one sign, against a clamp of 4 and reflex weights of about 1. A kill reaches a hunter 0.31 times per 1,000 hunter agent-ticks and the median hunter life has 0 kills                                             | E124 notes (reward counts); `HEBB_CLAMP` 4; `hebbianRate` 0.0001; `eval.hunter_zero_kill_share` about 0.85 on the pre-flip defaults                                                                                                                                               |

D1 and D2 are hypotheses: the no-plasticity row is consistent with both and cannot separate survivorship from age or hunger. E124 also has defaults (-0.026) above no-plasticity (-0.048) and shuffled reward (-0.005) above both, a spread inside the noise of 8 seeds (per-seed gains span -0.20 to +0.06 on 1 to 442 hunters). The first tasks of Phase 1 are the probe and the matched detectors, which separate the five.

> Note: `eval.hunter_conversion_gain` stays registered. Its value is read only as a difference to the no-plasticity arm on the
> same seeds, never against 0.

## Baseline

| Metric                                         | Value                              | Source                   |
| ---------------------------------------------- | ---------------------------------- | ------------------------ |
| `eval.hunter_conversion_gain`, defaults        | -0.026 (162 hunters mean)          | E124, 8 seeds, floor off |
| `eval.hunter_conversion_gain`, no plasticity   | -0.048 (104 hunters mean)          | E124                     |
| `eval.hunter_conversion_gain`, shuffled reward | -0.005                             | E124                     |
| `eval.hunter_kill_conversion_by_age.1k-2k`     | 0.097                              | E124 defaults            |
| `eval.hunter_kill_conversion_by_age.over2k`    | 0.052                              | E124 defaults            |
| Reward events per 1,000 hunter agent-ticks     | kill 0.31, bite 9.6, scavenge 0.95 | E124                     |

The floor-on defaults after the flip reflex and the territory (E123) are re-read in Phase 1 before any prediction.

## Config keys and options

All default off or neutral. The first is a switch with a flag-ledger deletion task; the rest are numbers.

| Key                   | Type    | Default | Meaning                                                                                                                                                                                                                  |
| --------------------- | ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `practiceTrace`       | boolean | false   | Phase 2. A `canHunt` agent keeps an eligibility trace on its prey-channel skip cells and a plastic copy of them; a meal from live prey moves the plastic cells along the trace. Off: no state, no cost, hashes unchanged |
| `practiceRate`        | number  | 0.01    | Phase 2. Step of the plastic cells per unit of reward and trace. Screened at 0.003, 0.01 and 0.03                                                                                                                        |
| `practiceTraceDecay`  | number  | 0.97    | Phase 2. Per-tick decay of the eligibility trace (half-life about 23 ticks, a chase)                                                                                                                                     |
| `practiceWindowTicks` | integer | 0       | Phase 2. Sensitive period: the step is scaled by `max(0, 1 - ageTicks / practiceWindowTicks)` plus a floor of 0.25; 0 is a flat rate. Screened at 0 and `juvenileTicks` (3,000)                                          |

`practiceTrace` has an entry in `scripts/flag-ledger.json` pointing at T14, added by T9. The numeric keys need none.

## Detectors

All computed by the eval observer or by the probe; none is a reward.

| Metric                                       | Direction | Reads                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe.practice_gain` (script, not `eval.*`) | higher    | Paired per-hunter difference in catch rate on a fixed test set of live prey, after `K` practice trials minus before, with the practice prey drawn from the same seeded set. No hunter dies in a trial, so no survival selects the sample                                  |
| `probe.practice_gain_control.<arm>`          | watch     | The same difference for the controls: `hebbianRate` 0 and `practiceTrace` off (the null), practice on prey of another specialisation (transfer), and practice with the meal delivered at an unrelated trial (shuffled credit)                                             |
| `eval.hunter_conversion_matched.<band>`      | higher    | Kill conversion of the chases that open in the age band, stratified by energy tercile at opening and by prior-chase count of that life (0, 1 to 4, 5 and over), averaged over strata with equal weight. Reads age and experience separately. Null when a stratum is empty |
| `eval.hunter_conversion_by_dose`             | higher    | Within the age band 1,000 to 3,999, the slope of conversion on the number of prior resolved chases in the life, over energy-matched chases. Positive means a hunter does better after more attempts at the same age and hunger                                            |
| `eval.practice_reward_events`                | watch     | Rewards the practice hook delivered per 1,000 hunter agent-ticks, so a learning rule rests on a count                                                                                                                                                                     |
| `eval.practice_drift`                        | watch     | Mean absolute change of the plastic prey cells from the genome values among living hunters, and the share clamped; shows the rule moved something                                                                                                                         |

The ecological guards of [hunter-learning.md](hunter-learning.md) (`eval.prey_extinctions`, `eval.boom_bust_count`,
`eval.predator_share_cv`) read beside every world run, with the keep rule of [realistic-keepers.md](realistic-keepers.md).

## Phases

### Phase 1 - Measure practice without survivorship

**Targets:** none - measurement only; the probe and the matched detectors change no sim behaviour, `worldHash` and the golden cases stay as they are.

The probe is a staged arena in the pattern of `memory-probe.mjs`: one hunter from a champion file, a seeded set of live
prey of one specialisation placed at fixed distances and headings, nothing else alive, a trial ending at a kill, an
escape or a tick budget. A hunter is tested on the set (`before`), practises on `K` trials of a second seeded set, and is
tested again on the first set (`after`). The difference is paired per hunter. The controls are the null (`hebbianRate` 0
and `practiceTrace` off), transfer (practice prey of another specialisation) and shuffled credit. On today's main the
expected result is no gain in any arm, which fixes the probe's noise floor; after Phase 2 it must show a gain over the
null with the interval excluding 0.

The matched detectors split age from experience and hunger in the world run. They are watch metrics until their power is
read with `npm run eval:power`.

#### Chunks

| Chunk | Tasks    | Holds                                                                                              |
| ----- | -------- | -------------------------------------------------------------------------------------------------- |
| A     | T1 to T4 | The matched detectors, the practice-probe scenario, its CLI and its tests; no sim behaviour change |
| B     | T5 to T6 | The measurement runs on main (null floor, power) and the conformance review                        |

### Phase 2 - A learnable pursuit skill

**Targets:** eval.hunter_kill_conversion_by_age.1k-2k, eval.hunter_conversion_gain, eval.chase_catch_share, eval.predators_at_end, eval.prey_types_at_end, eval.prey_extinctions, eval.population_mean

`practiceTrace` adds the credit rule nature uses. For each `canHunt` agent, a plastic copy of the prey-channel skip
cells (both pooled hits, 3 values each, into thrust, turn and bite: 18 cells; sprint is left out because the reflex does not seed it) starts equal to the genome and a per-agent
eligibility trace of the same size decays by `practiceTraceDecay` each tick and adds the product of the prey input and the
output it fed. A meal of live prey (a kill, or a bite that stores energy from a live victim; never a carcass, so the rule
teaches hunting and not scavenging) delivers a reward `min(1, stored / foodEnergy)` and moves each plastic cell by
`practiceRate` x reward x trace x the sensitive-period factor, clamped to the weight clamp, with a slow pull to the genome
value. The brain reads the plastic cells instead of the genome cells for a hunter. The hook is its own call in `feeding.js`
beside the meal; it does not read `rewardTrace`, so it stands when `reward.js` is deleted.

Cost: hunters are a few per cent of the population, 18 cells each; off, no allocation and no work.

Judged in two steps. The probe first: `probe.practice_gain` above the null control with the interval excluding 0, above
the transfer and shuffled-credit controls, at one of the three `practiceRate` values. Then the world: the keep rule of
[realistic-keepers.md](realistic-keepers.md) on paired intervals over 32 matched floor-on seeds (the rule as updated in principles.md: hunters alive at the last tick on 12 of 16 seeds in each 16-seed half, and no more seeds under 80 agents than the defaults), with the competence rows
(`eval.hunter_kill_conversion_by_age.1k-2k` and `eval.hunter_conversion_by_dose`) not worse. A gain in a world run is not
required; the probe is the competence verdict.

#### Chunks

| Chunk | Tasks      | Holds                                                                                                     |
| ----- | ---------- | --------------------------------------------------------------------------------------------------------- |
| C     | T7 to T10  | The trace state, the plastic cells in the brain read, the reward hook, the switch and its off-path checks |
| D     | T11 to T13 | The probe on the switch, the `practiceRate` and window screen, the 32-seed no-harm runs                   |

### Phase 3 - Adopt

**Targets:** eval.hunter_kill_conversion_by_age.1k-2k, eval.predators_at_end, eval.prey_extinctions, eval.population_mean

If Phase 2 passes, `practiceTrace` is set true, its flag and off path are deleted and the golden cases re-pinned. If the
probe shows learning but the world run shows hunters still failing on healthy prey, the next step is graded difficulty as
nature gives it: a prey a hunter has bitten and not finished keeps its wound (the existing `bittenTimer` state slows it),
so a young hunter near a parent meets catchable prey. That step is written as its own doc if the probe asks for it, and is not built here.

#### Chunks

| Chunk | Tasks      | Holds                                                                                       |
| ----- | ---------- | ------------------------------------------------------------------------------------------- |
| E     | T14 to T16 | The verdict, the adoption commit with the re-pin, the perf check and the conformance review |

## Decisions

| Decision                                                                                                                                                                                                          | By                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| The competence verdict is the probe, not the in-world gain: the in-world detector has a negative null (E124 no-plasticity -0.048) and is read only as a difference to that null                                   | Delegated (balance autonomy)   |
| The learnable cells are the 18 prey-channel skip cells (two hits into thrust, turn and bite) of a `canHunt` agent, not the hidden-to-output block: the reflex is there and 18 cells keep the cost to hunters only | Delegated (balance autonomy)   |
| The rule is a three-factor eligibility trace, replacing the instantaneous correlation for those cells; the old `hebbianStep` is untouched                                                                         | Delegated (balance autonomy)   |
| The reward is the energy stored from live prey (kill or live bite), not carcass or scavenge energy                                                                                                                | Delegated (balance autonomy)   |
| No reward baseline (prediction error) in the first build: kills and live bites are rare enough that drift from frequent reward is not the limit                                                                   | Delegated (balance autonomy)   |
| The switch owns its reward hook and state and never reads `rewardTrace`; the doc survives the deletion of `rewardedHebb`, `provisionEnabled` or `predatorRestTicks`                                               | Delegated (balance autonomy)   |
| Play, teaching and observational learning are excluded: no energy-neutral play, no cost-to-teacher mechanic, and a kin-behaviour input would change the layout `pooled-v5`                                        | Delegated (balance autonomy)   |
| Graded difficulty (wounded prey for the young) is a conditional follow-up doc, built only if the probe shows learning that the world does not use                                                                 | Delegated (balance autonomy)   |
| Matched conversion averages the strata that hold at least 5 chases and is `null` under 3 such strata, instead of `null` when any stratum is empty; energy terciles are those of the run's logged chase energies   | Delegated (instruments stream) |

## Experiments

| Id    | Task | Question                                                                                                    | Prediction (written before the run)                                                                                                      |
| ----- | ---- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| E-G-1 | T5   | What is the probe's noise floor on main, on main?                                                           | No arm shows a gain whose interval excludes 0; the spread sets the number of hunters and trials Phase 2 needs                            |
| E-G-2 | T6   | Do the matched detectors remove the age-driven fall seen in E124?                                           | `eval.hunter_conversion_matched` falls less with age than the pooled conversion does; `eval.hunter_conversion_by_dose` is near 0 on main |
| E-G-3 | T11  | Does `practiceTrace` give a probe gain over the null, the transfer control and the shuffled-credit control? | A gain at `practiceRate` 0.01 or 0.03 that the shuffled control does not reach; 0.003 too small; the window helps at the late test       |
| E-G-4 | T12  | Which `practiceRate` and window setting is best on the probe and safe in a short world run?                 | The window of `juvenileTicks` beats the flat rate on a late test because late drift is noise; no setting changes the world guards        |
| E-G-5 | T13  | Does the best setting pass the keep rule on 32 matched floor-on seeds, paired intervals?                    | Passes: hunters are few, the rule moves only 18 weights each, and no energy enters the world; conversion 1k-2k no worse                  |
| E-G-6 | T14  | Does `eval.hunter_conversion_by_dose` turn positive in the world with the switch on?                        | Slightly positive, below the 5% minimum effect on 32 seeds; the world is not required to show it                                         |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | `js/sim/` only for the rule: `practice.js` (trace, plastic cells, reward hook, step), `practice-state.js` (per-agent rows allocated with the switch), a read of the plastic cells in `addSkip` of `brain.js`. `js/evo/` for `scene-matched.js` and `practice-probe*.js`. `scripts/practice-probe.mjs` for the CLI. No worker, renderer or UI change                                                        |
| Unit tests              | `test/sim/practice.test.js` (trace decay, reward step against a naive reference, clamp, pull to genome, window factor, off path bit-identical), `test/sim/brain-practice.test.js` (a hunter reads its plastic cells, a non-hunter does not), `test/evo/scene-matched.test.js`, `test/evo/practice-probe.test.js` (a hunter whose weights are set to a known improvement shows a gain; the null shows none) |
| Headless e2e            | With the switch off the golden hashes in `test/sim/golden.json` are unchanged; `eval-smoke` and a 6,000-tick replay with the switch on run clean with `--check-invariants`; the probe runs on a stored champion fixture                                                                                                                                                                                    |
| Performance budget      | `bench.step_ms@500` unchanged with the switch off and within the margin with it on (hunters only); `npm run alloc-check` shows zero per-tick allocation on and off; added cost stated per phase with `npm run bench:parts -- --area brain --compare <base>` under `flock /tmp/claude-1000/cpu.lock`                                                                                                        |
| Evolution metrics       | Phase 2 Targets above: the probe gain over the null with the interval excluding 0, and the keep rule on 32 matched floor-on seeds with paired intervals; recorded in `evals/experiments.json` under the real ids of `E-G-1` to `E-G-6`                                                                                                                                                                     |
| Determinism             | No new RNG stream: the trace, the step and the reward draw nothing. The probe's trial sets come from `fork(rng, 'practice-probe')` in the script, outside the sim core. The new rows join `worldHash` only with the switch on, and are zeroed in `freeAgent`                                                                                                                                               |
| Config and persistence  | `practiceTrace` (false), `practiceRate` (0.01), `practiceTraceDecay` (0.97), `practiceWindowTicks` (0) in `config-defaults.js` and `config-rules.js`; a ledger entry for the boolean. No layout change: `pooled-v5` and the archive version stay, and no champion file changes; plastic state is never saved in an archive                                                                                 |
| Logging and diagnostics | `PracticeConfig` (info, tick 0: the four values), `PracticeTotals` (debug, every 1,000 ticks, emitted only with the switch on: rewards delivered, mean eligibility, mean drift, clamped share). Replay: `npm run replay -- --seed <n> --ticks 20000 --config <file.json> --level debug --check-invariants`; the probe logs each trial to `.sim/logs/practice-<seed>x<trials>.jsonl`                        |
| Browser compatibility   | N/A - no renderer, worker protocol or UI change; the sim core is the same code in the worker and Node                                                                                                                                                                                                                                                                                                      |
| Docs                    | This doc; `hunter-learning.md` gains a pointer and keeps `eval.hunter_conversion_gain`; `sim-notes.md` gets a `### YYYY-MM-DD - practice probe noise floor` entry from E-G-1; this doc becomes a short record of the adopted rule once `Implemented`                                                                                                                                                       |
| Verification            | `scripts/check.sh` green per chunk PR; the probe verdict and the 32-seed keep-rule reports cited in the Phase 3 PR                                                                                                                                                                                                                                                                                         |

## Task breakdown

### Phase 1 - Measure practice without survivorship

| #   | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Nature       | Depends on |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `scene-matched.js`: `eval.hunter_conversion_matched.<band>` and `eval.hunter_conversion_by_dose` from the chase hook, stratified by energy tercile and prior-chase count; register directions in the metrics tables; `test/evo/scene-matched.test.js` (built: strata under 5 chases are left out and fewer than 3 strata give `null`, because every stratum being filled is rare on a run's chase count; `scene-approach.js` now hands the hook the hunter's energy at the opening) | [judgement]  | -          |
| T2  | Add the practice-probe scenario and runner in `js/evo/practice-probe.js` and `practice-probe-run.js` (arena, test and practice sets, the null, transfer and shuffled-credit controls, paired gain); `test/evo/practice-probe.test.js`                                                                                                                                                                                                                                                   | [judgement]  | -          |
| T3  | Add `scripts/practice-probe.mjs` and `npm run probe:practice` (`--champions`, `--trials`, `--practice-trials`, `--seed`, `--config`), report through `scripts/lib/probe-report.mjs`; the AGENTS.md command row                                                                                                                                                                                                                                                                          | [mechanical] | T2         |
| T4  | Chunk A check: run the pre-commit hook and the new tests; confirm the golden hashes and `eval-smoke` are unchanged                                                                                                                                                                                                                                                                                                                                                                      | [mechanical] | T1, T3     |
| T5  | Run `E-G-1`: save 8 champions with `--save-champions`, run the probe on main with the defaults, record the noise floor and the hunters and trials needed; one `sim-notes.md` entry                                                                                                                                                                                                                                                                                                      | [judgement]  | T4         |
| T6  | Run `E-G-2`: 16 floor-on seeds with the new detectors; `npm run eval:power` on them; record the matched and dose readings beside the pooled conversion; conformance review of Phase 1 by a fresh agent in parallel with the final `scripts/check.sh`; mark `(built)`                                                                                                                                                                                                                    | [judgement]  | T5         |

### Phase 2 - A learnable pursuit skill

| #   | Task                                                                                                                                                                                                                                                                                              | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T7  | Add `practice-state.js` and `practice.js`: per-agent plastic cells and eligibility rows allocated with `practiceTrace`, the trace update, the reward step with the window factor, reset in `freeAgent`; the four keys and rules; `test/sim/practice.test.js` against a naive reference            | [judgement]  | T6         |
| T8  | Read the plastic cells for a `canHunt` agent in `addSkip` of `brain.js`; the trace update after `outputStep`; `test/sim/brain-practice.test.js`; with the switch off the brain is bit-identical                                                                                                   | [judgement]  | T7         |
| T9  | Call the reward hook beside the meal in `feeding.js` for kills and live bites only; add `eval.practice_reward_events` and `eval.practice_drift`, `PracticeConfig` and `PracticeTotals`, the `worldHash` rows with the switch on, the invariant and the ledger entry pointing at T14               | [judgement]  | T8         |
| T10 | Off-path checks: golden hashes unchanged, `npm run alloc-check` on and off, `npm run bench:parts -- --area brain --compare <base>` under the CPU lock, `eval-smoke` with the switch on; conformance review of chunk C                                                                             | [mechanical] | T9         |
| T11 | Run `E-G-3`: the probe on `practiceTrace` against the null, transfer and shuffled-credit controls at the three `practiceRate` values; prediction first                                                                                                                                            | [judgement]  | T10        |
| T12 | Run `E-G-4`: a short 16-seed screen of `practiceRate` x `practiceWindowTicks` on the probe and the world guards, writing to `evals/screens/hunter-practice-skill.grid.json`; the best setting by the probe, no setting that fails a guard                                                         | [judgement]  | T11        |
| T13 | Run `E-G-5`: the best setting against the defaults on 32 matched floor-on seeds (seeds 1 to 32 in two reports), keep rule by paired intervals, competence rows not worse; one entry; conformance review of Phase 2 by a fresh agent in parallel with the final `scripts/check.sh`; mark `(built)` | [judgement]  | T12        |

### Phase 3 - Adopt

| #   | Task                                                                                                                                                                                                                                                                                                                                   | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T14 | Verdict (`E-G-6` read here): on a pass set `practiceTrace` true, delete the flag, its key, its ledger entry and its off path, keep the tuning keys, re-pin the golden cases in the same commit; on a fail delete `practice.js`, `practice-state.js`, the keys and the ledger entry; either way a `sim-notes.md` entry with the numbers | [judgement]  | T13        |
| T15 | Confirm the re-pinned goldens in Chromium with `npm run browser:hash`; re-record `bench/baseline.json` once on a quiet machine under the CPU lock only if the step moved outside the margin                                                                                                                                            | [mechanical] | T14        |
| T16 | Conformance review of Phases 2 and 3 by a fresh agent in parallel with the final `scripts/check.sh`; move the Status line, mark the phases `(built)`, add the pointer in `hunter-learning.md`, regenerate the index                                                                                                                    | [judgement]  | T15        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run probe:practice -- --champions <dir>` prints the paired gain per control and its interval; on main every control reads no gain.
3. Phase 2: with the switch off the golden hashes are unchanged; `npm run replay -- --seed 1 --ticks 20000 --config <on.json> --level debug --check-invariants` runs clean and logs `PracticeTotals`; the probe shows a gain over the null.
4. Phase 3: `npm run browser:hash` matches the re-pinned goldens; the keep rule holds on both 32-seed reports; the browser walk on `npm run dev` shows blobs moving with no console error.
