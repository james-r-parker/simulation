# Realistic keepers

**Status:** Proposed - Phase 1 first: restore the realistic mechanisms deleted for lack of a scene gain as default-off switches (chunks A and B), then Phase 2 judges each on 16 seeds for no harm.
**Validated:** 12d9ba4 (2026-11-06)
**Priority:** 2 - the user's keep rule (2026-11-06) turns eight deleted or never-confirmed mechanisms into candidates the balance round can adopt now; it queues behind natural-selection.md (Priority 1), whose Phase 4 balancing owns the defaults, and ahead of refuge.md Phase 3 conclusion, whose T27 `refugeSense` reports T19 reads
**Depends on:** [natural-selection.md](natural-selection.md), [refuge.md](refuge.md)

The goal ([principles.md](../principles.md)) is a world that is interesting to watch. The user's rule (2026-11-06): **a realistic
mechanism that does no harm is kept, even when it does not yet move its scene metric**. This doc restores the mechanisms that earlier docs deleted for
lack of a gain, re-checks them on today's defaults, adopts each that does no harm and deletes each that does.

The scenes served: **Parent spends** and **Kin is not a stranger** (provisioning, juvenile dependency), **A real chase** and
**Condition changes the walk** (sated bite, post-kill rest, reward-gated learning), **Scavenge** (herbivore meat value) and
**Refuge** (cover, the refuge sense). Each switch names its own scene metric; none is required to move.

## Principle - no harm first, scene second

- **Harm is the verdict, a scene gain is not required.** Eight-seed results never judge harm: they show a direction and
  only order the work.
- **Nothing pays fitness for the behaviour.** A mechanism changes a cost, a permission or an input; selection finds the
  use ([principles.md](../principles.md), "Measure scenes, reward them almost never").
- **A mechanism is realistic or it is not a candidate.** The Decisions table lists what is excluded and why.

### The keep rule (user, 2026-11-06)

A switch is kept when, over 16 floor-on seeds against the defaults on matched seeds, all of these hold:

1. Hunters are alive at the last tick on 12 of 16 seeds or more (or on as many as the defaults arm, when that is fewer).
2. No more seeds end with a mean population under 80 than the defaults.
3. `eval:compare` shows no guard `worse`: `eval.population_mean`, `eval.predators_at_end`, `eval.prey_types_at_end`,
   `eval.spec_effective`, `eval.hunter_kill_conversion_by_age.1k-2k`, `eval.prey_extinctions`.
4. The mechanism's own scene metric is read and recorded; it is not required to improve.

## Context

### Candidates

| Mechanism                                   | Realism                                                                    | Evidence                                                                                                                                                                      | Measured on          | Plan                         |
| ------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------- |
| `satedBite` (a full hunter does not bite)   | Satiation caps a predator's kill rate (type II functional response)        | 16 seeds, E120 floor off: hunters alive 10/16 (defaults 9/16), every target no-difference; deleted in #277                                                                    | Defaults before #277 | Restore T1, check T11        |
| `provisionEnabled` (parents feed young)     | Wolf, lion and meerkat young eat at the parent's kill while they learn     | 16 seeds, E116 floor off: 9/16 (9/16), every target no-difference; deleted in #277                                                                                            | Defaults before #277 | Restore T3, check T13        |
| `juvenileDependency` (cheaper youth, pull)  | Predator young stay near the mother for months while skill grows           | 16 seeds, E116 floor off, with provisioning: 10/16 (9/16), conversion 1k-2k +30% (interval spans 0), independent kill share 0.979 to 0.906 (by construction); deleted in #277 | Defaults before #277 | Restore T4, check T14        |
| Herbivore `meatFoodValue` 0.1               | Herbivores scavenge carcasses poorly, leaving them to hunters              | 16 seeds, E113: hunters alive 10/16 on every arm, `eval.carcass_hunter_share` 0.126 to 0.245, births +8.4%, families better; one more seed under 80, body plan coverage worse | Defaults after E112  | Config value only, check T15 |
| `rewardedHebb` (reward-gated learning)      | Dopamine-gated plasticity credits the act that paid                        | 8 seeds only, E124 floor off: no `eval:compare` at 8 seeds; no arm beat the shuffled control, gain negative in every arm; deleted in #279                                     | Defaults before #279 | Restore T5, check T16        |
| `predatorRestTicks` (rest after a kill)     | A fed predator lies up after a kill                                        | 8 seeds only, E113: hunters alive 6/8 (defaults 6/8), no gain; deleted in #268                                                                                                | Defaults before #268 | Restore T2, check T12        |
| `coverConceals` (a ring hides its interior) | Cover breaks a predator's line of sight (Lima and Dill 1990)               | 8 seeds only, E131 floor on: inert (1 to 2 of 100 to 145 agents in a ring), use unchanged; deleted in #290                                                                    | Defaults before #290 | Restore T6, check T17        |
| `coverFoodFree` (no plants inside a ring)   | Refuge costs foraging: animals leave cover to feed (the landscape of fear) | 8 seeds only, E131 as above                                                                                                                                                   | Defaults before #290 | Restore T7, check T18        |
| `refugeSense` (long-range refuge input)     | Prey know where cover is (home range, escape routes)                       | On main, default false (#292); the refuge.md T27 16-seed reports                                                                                                              | Today                | Verdict T19, adopt T22       |

The first four rows have 16-seed evidence but were measured before the flip reflex and the hunter territory became defaults
(#277). The next four have 8-seed evidence only, which is inert or neutral and never judged harm.

### What exists today

| Fact                                                                                                                                            | Where                                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The flip reflex and the hunter territory are always on; a child whose specialisation `canHunt` while its mother's does not gets the prey reflex | `applyBirthReflex` in `../../js/evo/instinct.js`, called from `../../js/evo/policies/natural-birth.js`; `territoryAllows` in `../../js/sim/territory.js` |
| Satiation and digestion already block eating, but a full hunter still bites                                                                     | `canEatNow`, `lunge` in `../../js/sim/feeding.js`; `satiationShare`, `digestTicks` in `../../js/sim/config-defaults.js`                                  |
| The independent kill share keeps its dependent bit from the living-parent-within-`PARENT_RANGE` rule                                            | `isDependentKiller` in `../../js/sim/dependent-killer.js`; `../../js/sim/hunter-ledger.js`                                                               |
| `juvenileTicks` (3000) stays as a plain key for the detectors' age bands                                                                        | `../../js/sim/config-defaults.js`; `../../js/evo/scene-hunter-age.js`                                                                                    |
| The Hebbian step updates `fastOut` at `hebbianRate` 0.0001 with no reward gate                                                                  | `hebbianStep` in `../../js/sim/hebbian.js`, called from `../../js/sim/brain.js`                                                                          |
| The conversion-gain detector stays                                                                                                              | `eval.hunter_conversion_gain` in `../../js/evo/scene-competence.js`                                                                                      |
| Rays keep the nearest hit of any kind, so an agent inside a ring is visible through a gap; plants spawn on any clear point                      | `nearestHit` in `../../js/sim/ray-march.js`; `spawnFoodItem`, `placeClear` in `../../js/sim/spawn.js`                                                    |
| `refugeSense` zeroes three refuge inputs when false; the layout is `pooled-v5` (92 inputs) and `ARCHIVE_VERSION` is 7                           | `../../js/sim/refuge-sense.js`; `../../js/sim/brain-layout.js`; `../../js/evo/archive-codec.js`                                                          |
| The herbivore specialisations carry `meatFoodValue` 0.3 (the hunter 1)                                                                          | `meatFoodValue` in `../../js/sim/config-defaults.js`; `meatFoodBySpec` in `../../js/sim/world.js`; `feed` in `../../js/sim/feeding.js`                   |

Each deleted mechanism is restored with `git show <commit>^:<path>` and adapted to the code above. The sources are #272 and
#273 (provisioning, juvenile dependency), #275 (`satedBite`), #278 (reward-gated learning), #265 (`predatorRestTicks`) and
#289 (cover); the deleting commits are #277, #279, #268 and #290.

## Design

### Phase 1 - Restore

**Targets:** none - every switch is default off, so the goldens, the archive format and `bench.step_ms@500` do not move.

Each mechanism returns as its own default-off switch (`predatorRestTicks` as a number key at 0) with, for each boolean, a `scripts/flag-ledger.json` entry (`key`, `plan`, `task`,
`reason`) naming its adopt task T22, a rule in `../../js/sim/config-rules.js`, a default in
`../../js/sim/config-defaults.js`, a test file that pins it on and off, and its log events. Per-agent state allocates only
when the switch is on, so the off path costs nothing per tick.

| Switch               | Behaviour when on                                                                                                                                                                                                                | Scene metric read (not required)                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `satedBite`          | In `lunge`, a `canHunt` biter for which `canEatNow` is false (at or above `satiationShare` of `maxEnergy`, or inside `digestTicks`) does not bite                                                                                | `eval.hunter_kill_rate_by_source.spec-flip`, `eval.predators_at_end`                               |
| `predatorRestTicks`  | A fatal bite by a `canHunt` agent sets a per-slot `restTimer`; while it counts down `actAll` forces thrust to 0. A number key (0 off); the arm sets 60                                                                           | `eval.hunter_ticks_last_quarter`                                                                   |
| `provisionEnabled`   | A hunter that stores energy from a kill, a bite or a carcass hands `provisionShare` (0.3) of it to its own living `canHunt` young under `juvenileTicks` within `provisionRange` (120); the energy is moved, not created          | `eval.hunter_juvenile_death_share`, `eval.provisioned_energy_share`, `eval.hunter_first_kill_rmst` |
| `juvenileDependency` | A juvenile `canHunt` body pays `juvenileBurn` (0.6) of its standing, movement and turn cost (`juvenileBurnOf` in `tickCost`), and every `canHunt` child gets the kin-thrust and kin-turn floor `kinPullWeight` x instinct weight | `eval.hunter_juvenile_death_share`; `eval.hunter_independent_kill_share` falls by construction     |
| `rewardedHebb`       | A per-agent `rewardTrace` rises by the energy of each meal (kills, bites and carcasses: the `meat` source), decays by `rewardDecay` (0.02), and `hebbianStep` scales its rate by `rewardBase` (0.25) + `rewardGain` (4) x trace  | `eval.hunter_conversion_gain`, `eval.reward_events.*`                                              |
| `coverConceals`      | A ray starting outside a ring skips an agent inside it (`cover.js`, `nearestHit`); the agent inside still sees out                                                                                                               | `eval.refuge_bite_deficit`, `eval.refuge_use_under_threat`                                         |
| `coverFoodFree`      | Plant placement rejects a point inside a ring (`placeClear` / `spawnFoodItem`)                                                                                                                                                   | `eval.refuge_exit_fed`, `eval.refuge_dwell_ticks`                                                  |

`refugeSense` is restored already ([refuge.md](refuge.md) T24 to T26) and is listed so the combined check includes it. The
herbivore meat value needs no switch: it is `meatFoodValue` 0.1 on the `forager`, `reproducer`, `scout` and `defender`
specialisations, an existing config value judged as an arm.

#### Chunks

| Chunk | Tasks    | Holds                                                                                       |
| ----- | -------- | ------------------------------------------------------------------------------------------- |
| A     | T1 to T4 | Hunter energy switches: `satedBite`, `predatorRestTicks`, provisioning, juvenile dependency |
| B     | T5 to T9 | `rewardedHebb`, the two cover switches, the off-path checks and the conformance review      |

### Phase 2 - No-harm checks

**Targets:** eval.population_mean, eval.predators_at_end, eval.prey_types_at_end, eval.spec_effective, eval.hunter_kill_conversion_by_age.1k-2k, eval.prey_extinctions

Every arm runs on the defaults as they stand after Phase 1: `npm run eval -- --seeds 16 --ticks 200000 --policy live --config
<arm.json> --out evals/results/<id>-<arm>.json`, floor on, seeds 1 to 16 of `../../evals/seeds.json`, against a defaults report
of the same seeds and ticks. Each run states its prediction in `evals/experiments.json` first. The verdict is the keep rule
read with `npm run eval:compare -- <defaults> <arm>`; a mechanism that fails any clause is deleted and one that passes is
adopted.

Seeds 17 to 32 (`--seed-offset 16`) are harsher (E130). They join the combined check only, so no per-mechanism verdict
rests on a seed range the keep rule was not calibrated on.

The combined run puts every kept mechanism on together, floor on, as two 16-seed reports (`--seed-offset 0` and `16`),
against the defaults on the same 32 seeds. The keep rule applies to each report. When the combination harms, the mechanism
added last in the Phase 1 order (satedBite, predatorRestTicks, provisioning, juvenile dependency, herbivore meat value,
rewardedHebb, coverConceals, coverFoodFree, refugeSense) is backed out and the run repeated until the rule holds.

#### Chunks

| Chunk | Tasks      | Holds                                                         |
| ----- | ---------- | ------------------------------------------------------------- |
| C     | T10 to T19 | The baseline and the nine verdict runs (a run chunk, no code) |
| D     | T20 to T24 | Deletions, the combined run, the adoption and the close       |

### Phase 3 - Close

**Targets:** bench.step_ms@500

The adoption commit (T22) moves the defaults and re-pins the golden cases in `test/sim/golden.json` in Node (the pre-commit hook runs them); T23 confirms the hashes in Chromium and re-records `bench/baseline.json` once on a quiet machine under the CPU lock, so `bench-check` holds in the Phase 2 PR. Phase 3 states the step against the 3.32 ms budget (the step is about 4.0 ms). It records the cost each adoption added and does
not claim to recover it.

## Delivery requirements

| Concern                 | Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Architecture            | All in `js/sim/` (switches, per-agent state, log emitters) and `js/evo/` (the reflex floor in `instinct.js`, detectors in `scene-hunters.js`, `scene-competence.js` and `metrics-reward.js`). New modules by chunk: `provision.js`, `provision-state.js`, `juvenile.js`, `log-hunter.js` (A); `reward.js`, `reward-hash.js`, `metrics-reward.js`, `cover.js`, `log-cover.js` (B); touched: `events.js`, `invariants.js`, `world-hash.js`, `traits.js`, `population.js`. No worker, renderer or UI change; the inspector keeps its Refuge group                                                                                                                                                   |
| Unit tests              | One test file per module in `test/sim/` and `test/evo/`. Switch off is byte-identical to today (world hash over 200 ticks). Switch on pins the behaviour: a sated hunter skips the bite and a hungry one bites; rest zeroes thrust for exactly `predatorRestTicks` after a fatal bite; provisioning moves exactly `provisionShare` of the meal to a young in range and conserves energy; juvenile burn scales the three costs; the trace rises on a meal, decays and scales the rate; a concealed agent is skipped by an outside ray and seen by an inside one; no plant is placed inside a ring. Config rules reject out-of-range values. Multi-thousand-tick behaviours go in `*.slow.test.js` |
| Headless e2e            | The golden cases in `test/sim/golden.json` stay unchanged through Phase 1 (every switch off) and are re-pinned once in T22 with the new `worldHash` values; `eval-smoke` runs with every switch on in T8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Performance budget      | Phase 1: `bench.step_ms@500` within the printed margin of the committed baseline with every switch off (`npm run bench`), and `npm run alloc-check` shows zero per-tick allocation with the switches on and off. Phase 3: the baseline is re-recorded once; the added step cost of each adopted mechanism is stated against the 3.32 ms budget (current step about 4.0 ms)                                                                                                                                                                                                                                                                                                                       |
| Evolution metrics       | The Phase 2 targets under the keep rule; per mechanism the scene metric of the Phase 1 table is read and recorded. Seeds 1 to 16 per mechanism, seeds 1 to 32 for the combination, 200,000 ticks, floor on. A mechanism that fails the rule is deleted                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Determinism             | No new RNG stream: the shuffled-reward control and its `reward-shuffle` stream are not restored, and provisioning, rest, sated bite, juvenile burn and cover draw none. Every switch replays bit-for-bit from seed and config. Per-agent state is zeroed in `freeAgent`; the reward trace joins `worldHash` only when its switch is on                                                                                                                                                                                                                                                                                                                                                           |
| Config and persistence  | New keys: `satedBite` (boolean, false), `predatorRestTicks` (integer 0 to 65535, 0; a number key, so no ledger entry), `provisionEnabled` (false), `provisionShare` (0.3), `provisionRange` (120), `juvenileDependency` (false), `juvenileBurn` (0.6), `kinPullWeight` (0.5), `rewardedHebb` (false), `rewardGain` (4), `rewardBase` (0.25), `rewardDecay` (0.02), `coverConceals` (false), `coverFoodFree` (false). No layout change: `pooled-v5` and `ARCHIVE_VERSION` 7 stay and no champion file changes                                                                                                                                                                                     |
| Logging and diagnostics | `Provisioned` (debug: tick, genomeId, energy, young), `HunterKill` (exists; its dependent bit is read by the restored switches), a debug `KeeperTotals` every 1000 ticks (sated bites skipped, rests started, mean reward trace, juvenile-burn agent-ticks; emitted only for the switches that are on), `CoverConfig` (info, tick 0: both switches, ring count, aperture, interior radius), `CoverTotals` (debug, every 1000 ticks: agents in rings, agent-ticks, concealed ray hits, rejected plant placements). A rejected config names the key and its range. Reproduce with `npm run replay -- --seed <n> --ticks <n> --config <file.json> --level debug --check-invariants`                 |
| Browser compatibility   | N/A - no new browser API; the sim runs in the existing worker. `npm run browser:hash` confirms the re-pinned golden hashes in Chromium (T23)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Docs                    | This doc becomes a short `Implemented` record of the adopted set (T26). `hunter-learning.md` and `refuge.md` get a pointer where they name a deletion. `sim-notes.md` gets one `## Learned while building` entry per mechanism that fails the keep rule, with its numbers. `scripts/flag-ledger.json` loses each entry as its flag goes. AGENTS.md is unchanged                                                                                                                                                                                                                                                                                                                                  |
| Verification            | `scripts/check.sh` green per chunk PR and the manual browser walk in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Decisions

| Decision                                                                                                                                                                                                                                             | By                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| A realistic mechanism that does no harm is kept even when it does not move its scene metric yet (the keep rule above)                                                                                                                                | User, 2026-11-06             |
| Harm is judged on 16 floor-on seeds only; 8-seed results order the work and never judge                                                                                                                                                              | Delegated (balance autonomy) |
| Each mechanism is restored as its own switch and judged alone; the combination is judged after and backs out the latest-added until it holds                                                                                                         | Delegated (balance autonomy) |
| The herbivore `meatFoodValue` 0.1 is a config arm, not a switch: no code was removed for it                                                                                                                                                          | Delegated (balance autonomy) |
| Reward-gated learning restores the `meat` source only, with gain 4, base 0.25 and decay 0.02; the `kill` and `kill-bite` sources and the shuffled-reward control are not restored                                                                    | Delegated (balance autonomy) |
| `predatorRestTicks` is judged at 60, the value E113 screened                                                                                                                                                                                         | Delegated (balance autonomy) |
| Provisioning and the juvenile dependency are judged as separate arms; `eval.hunter_independent_kill_share` falls by construction under both and is not a guard                                                                                       | Delegated (balance autonomy) |
| `refugeSense` keeps its refuge.md ownership (T27, T28); this doc applies the keep rule to the refuge.md T27 16-seed reports and adds it to the combined run                                                                                          | Delegated (balance autonomy) |
| Excluded, harm: carcass scent (E114, worse on every reading), `huntSprintInstinct` (E113, population -10.8%, hunter-ticks down), `mealHeatCap` (population overshoot), `splitClonalMax` lifted (E127, collapse), boom-damping tuning (E128 and E129) | Delegated (balance autonomy) |
| Excluded, unrealistic: a long `mateRange` (mating at a distance nature does not show)                                                                                                                                                                | Delegated (balance autonomy) |
| Excluded, control or redundant: the reward shuffle control, `coverBiteGuard` and `refugeSlack`; denser rings stay with refuge.md Phase 3                                                                                                             | Delegated (balance autonomy) |

## Task breakdown

### Phase 1 - Restore

| #   | Task                                                                                                                                                                                                                                                                                                                                    | Nature       | Depends on                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------- |
| T1  | Chunk A: restore `satedBite` in `lunge` from #275 (key, rule, flag-ledger entry pointing at T22, `test/sim/feeding-sated-bite.test.js`, rows in `test/sim/config-hunter-learning.test.js`)                                                                                                                                              | [judgement]  | -                          |
| T2  | Restore `predatorRestTicks` and `restTimer` from #265 (`actAll` in `../../js/sim/physics.js`, the fatal-bite hook in `feeding.js`, rule `int(0, 65535)`, no ledger entry (a number key), `test/sim/predator-rest.test.js`); the old instinct and temperature changes stay deleted                                                       | [judgement]  | -                          |
| T3  | Restore provisioning from #273: `provision.js`, `provision-state.js`, the `Provisioned` event and `emitProvisioned` in `log-hunter.js`, the energy-conservation invariant, `eval.provisioned_energy_share`, the three keys and the ledger entry, with their tests; `isDependentKiller` is unchanged                                     | [judgement]  | -                          |
| T4  | Restore the juvenile dependency from #273: `juvenile.js`, `juvenileBurnOf` in `tickCost`, the kin-floor half of the hunter reflex for every hunting child (`applyBirthReflex` is the caller today), the three keys and the ledger entry, with their tests                                                                               | [judgement]  | T3                         |
| T5  | Chunk B: restore `rewardedHebb` from #278, `meat` source only: `reward.js` (trace, decay, `rewardScale`), `reward-hash.js`, the `hebbianStep` scale, `noteReward` calls in `feeding.js`, `eval.reward_events.*` (`metrics-reward.js`), the four keys and the ledger entry, with their tests; no shuffle queue and no `rewardSource` key | [judgement]  | -                          |
| T6  | Restore `coverConceals` from #289: `cover.js`, the ray skip in `nearestHit`, `CoverConfig` and `CoverTotals` with `log-cover.js`, the invariant, the key and ledger entry, with `cover.test.js`, `ray-march-cover.test.js` and `log-cover.test.js`                                                                                      | [judgement]  | -                          |
| T7  | Restore `coverFoodFree` from #289: the plant-placement rejection in `spawnFoodItem` and `flora-placement.js`, the key and ledger entry, with rows in `spawn.test.js` and `flora-spawn.test.js`                                                                                                                                          | [judgement]  | -                          |
| T8  | With every switch off, check the golden hashes are unchanged, `npm run bench` is within the margin and `npm run alloc-check` shows zero per-tick allocation on and off; run `eval-smoke` with every switch on; record the numbers in the commit body                                                                                    | [mechanical] | T1, T2, T3, T4, T5, T6, T7 |
| T9  | Conformance review of Phase 1 by a fresh agent in parallel with the final `scripts/check.sh`; move the Status line, mark the phase `(built)`, regenerate the index                                                                                                                                                                      | [judgement]  | T8                         |

### Phase 2 - No-harm checks

| #   | Task                                                                                                                                                                                                                                                                                               | Nature       | Depends on                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------- |
| T10 | Write `evals/screens/keepers.grid.json` (one arm per mechanism) and run the defaults baseline: 16 floor-on seeds, then seeds 17 to 32; the prediction first in `evals/experiments.json`                                                                                                            | [judgement]  | T9                                          |
| T11 | `satedBite`: one 16-seed run, the keep rule, `eval:compare`, one `evals/experiments.json` entry                                                                                                                                                                                                    | [judgement]  | T10                                         |
| T12 | `predatorRestTicks` 60: one 16-seed run, keep rule, entry                                                                                                                                                                                                                                          | [judgement]  | T10                                         |
| T13 | `provisionEnabled`: one 16-seed run, keep rule, entry                                                                                                                                                                                                                                              | [judgement]  | T10                                         |
| T14 | `juvenileDependency`: one 16-seed run, keep rule, entry                                                                                                                                                                                                                                            | [judgement]  | T10                                         |
| T15 | Herbivore `meatFoodValue` 0.1 on the four specialisations: one 16-seed run, keep rule, entry                                                                                                                                                                                                       | [judgement]  | T10                                         |
| T16 | `rewardedHebb` (meat source, plan defaults): one 16-seed run, keep rule, entry                                                                                                                                                                                                                     | [judgement]  | T10                                         |
| T17 | `coverConceals`: one 16-seed run, keep rule, entry                                                                                                                                                                                                                                                 | [judgement]  | T10                                         |
| T18 | `coverFoodFree`: one 16-seed run, keep rule, entry                                                                                                                                                                                                                                                 | [judgement]  | T10                                         |
| T19 | `refugeSense`: read the refuge.md T27 16-seed reports under the keep rule and record the verdict; the flag itself follows refuge.md T28                                                                                                                                                            | [judgement]  | T10                                         |
| T20 | Delete each mechanism that failed the keep rule: code, tests, keys, ledger entry, and a `sim-notes.md` entry with its numbers (one commit per mechanism)                                                                                                                                           | [judgement]  | T11, T12, T13, T14, T15, T16, T17, T18, T19 |
| T21 | Combined run: every kept mechanism on together, seeds 1 to 16 and 17 to 32 against the defaults on the same seeds; the keep rule on each report; when it fails, back out the latest-added mechanism and repeat, one entry per run                                                                  | [judgement]  | T20                                         |
| T22 | Adopt the survivors in one commit: set each flag true (and `meatFoodValue` 0.1 if kept), delete the flag and its key where it is a plain switch (`predatorRestTicks` stays a plain tuning key), its ledger entry and its off path; re-pin the golden cases in the same commit (the hook runs them) | [judgement]  | T21                                         |
| T23 | Confirm the re-pinned goldens in Chromium with `npm run browser:hash`, then re-record `bench/baseline.json` once: the median of three `node scripts/bench.mjs --json` runs on a quiet machine under `flock /tmp/claude-1000/cpu.lock` (two commits)                                                | [mechanical] | T22                                         |
| T24 | Conformance review of Phase 2 by a fresh agent in parallel with the final `scripts/check.sh`; move the Status line, mark the phase `(built)`, regenerate the index                                                                                                                                 | [judgement]  | T23                                         |

### Phase 3 - Close

| #   | Task                                                                                                                                                                                                                                                             | Nature      | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------- |
| T25 | Perf budget check: state `bench.step_ms@500` against the 3.32 ms budget and the added cost per adopted mechanism (`npm run bench:parts -- --area <phase> --compare <base>`); run `npm run alloc-check`; add the pointers in `hunter-learning.md` and `refuge.md` | [judgement] | T24        |
| T26 | Conformance review of Phase 3 by a fresh agent in parallel with the final `scripts/check.sh`; move the Status line to `Implemented` (the doc becomes a short record of the adopted set), mark the phase `(built)`, regenerate the index                          | [judgement] | T25        |

## Verification

1. `scripts/check.sh` green on each chunk PR; `scripts/check.sh --fix --docs` for this doc.
2. Phase 1: with every switch off the golden hashes are unchanged and `npm run alloc-check` and `npm run bench` pass; `npm run replay -- --seed 1 --ticks 6000 --config <all-on.json> --level debug --check-invariants` runs clean and logs `Provisioned`, `HunterKill` and `CoverTotals`.
3. Phase 2: every arm has an `evals/experiments.json` entry with a prediction written before the run and the four clauses of the keep rule read from `eval:compare`; the combined run meets the rule in both 16-seed reports.
4. Phase 3: `npm run browser:hash` matches the re-pinned goldens in Chromium; `bench/baseline.json` is recorded once; the browser walk on `npm run dev` shows blobs moving, hunters resting after a kill if `predatorRestTicks` was kept, and the Refuge group in the inspector, with no console error.
