# Body genes

**Status:** Proposed - replace the five discrete `specialisations` templates with continuous, heritable body genes (jaw-vs-gut diet, bulk-vs-agility, sprint-vs-endurance, sight) so body and brain co-evolve together; Phase 1 (continuous-trait detectors and baseline) is first.
**Validated:** 04e3b340 (2026-11-17)
**Scheduled by:** [world-balance.md](world-balance.md) step 10 - builds on prey-guilds.md, which shows which trade-offs hold niches
**Depends on:** [honest-budgets.md](honest-budgets.md), [prey-guilds.md](prey-guilds.md)

Today an agent's body is locked into one of five static templates (`forager`, `predator`, `reproducer`, `scout`, `defender` in `js/sim/config-defaults.js`). A child inherits its mother's template unless `specMutationRate` (0.02) randomly teleports it into another template while keeping its mother's brain—producing predators with forager hidden weights and preventing smooth evolutionary transitions from omnivore to scavenger, ambush hunter or armoured grazer.

This doc replaces those five discrete buckets with continuous, heritable genes in the genome's `TRAIT_GENES` block (`js/sim/brain-layout.js`), so a lineage's body and brain co-evolve smoothly.

Scenes served: **Same spec, different custom** (coursers, ambushers, grazers and tanks diverge continuously from one genome format), **Parent spends**, **Other blobs are the climate**, and the trait **A body is a budget** ([principles.md](../principles.md)).

## Principle and refusals

- **Every gain is paid on a trade-off axis:** No free super-blob. Higher jaw power reduces plant digestion; thicker bulk/armour raises movement cost and slows turn rate; wider vision raises standing loss.
- **Body and brain co-evolve:** No random `specMutationRate` jumps that drop a grazer brain into an obligate carnivore body.
- **New layout name on the genome change:** Adding continuous trait genes extends `TRAIT_GENES` (`brain-layout.js`) and takes a new `BRAIN_LAYOUT_NAME` (`pooled-v6` or `traits-v1`), gating old champions cleanly.

## Continuous trait axes

| Gene (sigmoid to [0, 1]) | Low end (0)                                                                                                | High end (1)                                                                                                                       | Budget / trade-off                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `carnivoryGene`          | Herbivore (`plantFoodValue` 1.0, `meatFoodValue` 0.2, `biteMultiplier` 1)                                  | Carnivore (`plantFoodValue` 0.0, `meatFoodValue` 1.0, `biteMultiplier` 20, `canHunt` above `carnivoryThreshold`)                   | Linear/smooth gut-vs-jaw curve; no free omnivore that excels at both                     |
| `bulkGene`               | Nimble (`turnMultiplier` 1.15, `moveCostMultiplier` 0.85, `biteTakenMultiplier` 1.3, `kickMultiplier` 0.7) | Armoured tank (`turnMultiplier` 0.7, `moveCostMultiplier` 1.3, `biteTakenMultiplier` 0.4, `kickMultiplier` 2.2, higher `baseSize`) | Bulk protects against solo bites and delivers heavy kicks, at real speed and upkeep cost |
| `burstGene`              | Endurance (`sprintBoost` 0.8, `passiveLossMultiplier` 0.8, `maxEnergyMultiplier` 1.0)                      | Sprinter / gorge (`sprintBoost` 1.7, `passiveLossMultiplier` 0.35, `maxEnergyMultiplier` 3.5)                                      | High burst/gorge trades off against steady-state foraging efficiency                     |
| `paceGene`               | Fast r-strategist (`splitMinEnergyMultiplier` 0.65, `maturityTicks` x 0.65, `maxEnergyMultiplier` x 0.7)   | Slow K-strategist (`splitMinEnergyMultiplier` 1.15, `maturityTicks` x 1.2, `maxEnergyMultiplier` x 1.3)                            | Fast breeding vs. winter/starvation resilience                                           |

`SIZE`, `VISION`, `CHILD_SHARE` and `LEARN` remain in `TRAIT_GENES`.

## Detectors

All computed by the eval observer; none is a reward.

| Metric                            | Direction      | Reads                                                                                                               |
| --------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `eval.trait_spread.carnivory`     | watch (higher) | Standard deviation of `carnivoryGene` across living agents after burn-in                                            |
| `eval.trait_spread.bulk`          | watch (higher) | Standard deviation of `bulkGene` across living agents after burn-in                                                 |
| `eval.trait_bimodality.carnivory` | higher         | Sarle's bimodality coefficient of `carnivoryGene` (measures whether hunters and grazers split into distinct guilds) |
| `eval.trait_brain_alignment`      | higher         | Correlation between `carnivoryGene` and prey-channel `BITE` weight minus food-channel `THRUST` weight               |

## Phases

### Phase 1 - Trait detectors and seeding bridge

**Targets:** none - detectors only; `worldHash` and golden cases are unchanged

The baseline is the shared run of [detector-baseline.md](detector-baseline.md), read once for every plan that has its prediction written.

Add `js/evo/scene-traits.js` with the four trait-distribution detectors and map the existing five specialisations to initial trait-gene priors so seeded populations start with familiar guilds before continuous evolution takes over.

#### Chunks

| Chunk | Tasks         | Contents                                                                                     |
| ----- | ------------- | -------------------------------------------------------------------------------------------- |
| A     | T1 to T3, T1a | `scene-traits.js`, registry entries, tests, 16-seed baseline `E-BG-1` and conformance review |

### Phase 2 - Continuous `carnivoryGene` and `bulkGene`

**Targets:** eval.hunter_catches_per_1k, eval.hunter_juvenile_death_share, eval.bite_on_prey_view

Replace the discrete `canHunt`, `plantFoodValue`, `meatFoodValue`, `biteMultiplier`, `biteTakenMultiplier`, `kickMultiplier` and `turnMultiplier` lookups with continuous curves over `carnivoryGene` and `bulkGene` behind a `continuousTraits` switch. Screen the trade-off exponents (`E-BG-2`, 16 seeds) and run the 64-seed keep rule (`E-BG-3`), checking functional diet and descendant replacement without `specMutationRate` flips; report bimodality without requiring two peaks.

#### Chunks

| Chunk | Tasks                   | Contents                                                                                                        |
| ----- | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| B     | T3a, T3b, T3c, T4 to T8 | `js/sim/body-genes.js`, layout stamp update, `E-BG-2` screen, `E-BG-3` keep rule, switch and conformance review |

### Phase 3 - Continuous `burstGene` and `paceGene`

**Targets:** eval.chase_catch_share, eval.chase_escape_share, eval.predator_presence, eval.predators_at_end

Move `sprintBoost`, `passiveLossMultiplier`, `maxEnergyMultiplier`, `splitMinEnergyMultiplier` and maturity/pregnancy scaling onto `burstGene` and `paceGene` behind `continuousPace` (`E-BG-4`, `E-BG-5`). Retiring the five discrete `specialisations` templates from `config-defaults.js` once both phases pass.

#### Chunks

| Chunk | Tasks           | Contents                                                                                                                |
| ----- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| C     | T9 to T13, T11a | `burstGene` / `paceGene` wiring, `E-BG-4` screen, `E-BG-5` keep rule, template retirement switch and conformance review |

### Phase 4 - Co-evolutionary archive and season graduation

**Targets:** eval.spec_effective, eval.hunter_catches_per_1k, eval.predators_at_end

Update MAP-Elites archive descriptors (`descriptorV7` / `descriptorV8`) so archive cells index continuous body-type bands alongside behavioural style, run 64-seed validation (`E-BG-6`), and verify by arena clip that distinct body lineages (coursers, ambushers, tanks, fast breeders) persist together.

#### Chunks

| Chunk | Tasks            | Contents                                                                          |
| ----- | ---------------- | --------------------------------------------------------------------------------- |
| D     | T14 to T17, T14a | Archive descriptor update, `E-BG-6` validation, arena clip and conformance review |

## Trade-off and ecological continuity checks

T3a audits the complete phenotype budget before any trait screen. Tabulate endpoint and intermediate bodies at equal age and stored energy: speed, acceleration, turn, standing loss, movement and sprint expenditure, maximum store, edible diet, bite cost and reproductive investment. Compare compound trait corners as well as each axis alone. The provisional high-`burstGene` endpoint currently combines higher sprint and capacity with lower passive loss; it is not accepted as an endurance trade-off without a measured counter-cost. T3a specifies and tests that cost, or rewrites the axis before Phase 3. No exact replacement constants are adopted by this planning task.

T11a preserves the ecological meaning of the guild experiments when labels disappear. Audit every specialisation-indexed lookup in sensing, prey/threat classification, feeding, reproduction, territory, archive, worker snapshots, renderer and eval. Classify from expressed body capabilities where needed; keep stable ancestry separate from changing body traits. Test small mutations on both sides of `carnivoryThreshold`, mixed-parent offspring and juvenile-to-adult transitions: a smooth gene change must not silently grant a free diet, remove a sensed threat or strand a body with no viable meal. Discontinuous permissions are documented and screened explicitly.

Translate [prey-guilds.md](prey-guilds.md)'s interaction matrix and rare-role tests into phenotype bands fixed before the run. Report intermediate omnivores and scavengers as outcomes, not failures merely because the distribution is unimodal. `trait_bimodality` and a brain-weight correlation are descriptive evidence, not sufficient proof of functional roles or mandatory adoption bars. Demonstrate diet, affordable pursuit, family replacement and local habitat use with the same checks used for guilds. Re-run the exact mixed-population release test of [training-stages.md](training-stages.md) after a layout/rules change; old champions cannot prove the new bodies work.

## Test design

### What the code does today

| Fact                                                                                                                                           | Consequence                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 157 reads of `world.spec[...]` or a `...BySpec[...]` table sit in 81 files under `js/` (sim, evo, worker and app; counted on 2026-11-15)       | Phase 2 replaces `canHunt` and six multipliers, so the inventory of every reader comes before T4, not at T11a                             |
| The archive is five grids, one a specialisation (`placeOf(spec, cell)` in `js/evo/archive.js`); the seeder picks a role first (`createSeeder`) | The archive and the seeder need a body band before a world can be seeded with no templates                                                |
| Drills, reflex cases, champion files, the league, the mate rank and `exportBestPerStyle` are keyed by specialisation                           | [training.md](training.md) and [training-stages.md](training-stages.md) tools read a band through one function, or they stop working      |
| `eval.trait_spread` is a registered metric (the spread of the existing trait genes)                                                            | The new keyed names must not shadow it; T1 checks the registry accepts `eval.trait_spread.<gene>` beside it or picks another prefix       |
| The four new genes do not exist until Phase 2                                                                                                  | The Phase 1 baseline cannot read them. It reads each living agent's template mapped onto the four axes, so before and after are one scale |
| `specFlipNoHunt` ([honest-budgets.md](honest-budgets.md) Phase 6) already stops a flip from crossing `canHunt`                                 | The gain claimed for removing flips is separated from the gain of continuous traits by its own arm                                        |

### The claim, and the test that can refute it

The claim is that body and brain co-evolve when the body is continuous. `eval.trait_brain_alignment` is a correlation across the population and rises when two founder types simply persist. The direct test is a transplant: `npm run probe:transplant` (T14a) drills a lineage's brain in its own body and in the body of each other band, on the same seeded trials. Co-adaptation is the own-body win share minus the mean foreign-body win share, with Wilson bounds. It is read on the template world (the baseline), after Phase 2 and after Phase 4. The claim holds when the gap grows; a gap that does not grow says the bodies changed and the brains did not follow.

### One question per arm

| Screen   | Arms                                                                                                                                                                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E-BG-2` | `control` (templates); `no-flip` (templates, `specMutationRate` 0); `diet-linear` (`carnivoryGene` only, linear gut-against-jaw); `diet-convex` (a mid-gene body is worse at both than either end); `diet-concave` (a mid-gene body is nearly as good at both); `diet-bulk` (both genes, the better diet curve) |
| `E-BG-4` | `control` (the Phase 2 defaults); `burst` (`burstGene` only); `pace` (`paceGene` only); `both`                                                                                                                                                                                                                  |

- The shape of a trade-off decides what evolves: a concave curve favours one generalist and a convex one favours two specialists (Levins 1968, cited from memory). The screen reports which, and a single omnivore that takes the whole map is the refusal "One niche allowed to win the whole map", not a pass.
- `canHunt` above `carnivoryThreshold` is a cliff in a continuous gene: one mutation step turns prey into a hunter. `diet-linear` is run twice, with the threshold and with bite strength and the size test scaling smoothly from 0, and the smoother one is kept unless it harms.
- A trait gene's mutation step is its own lever: at the brain's sigma a body drifts across an axis in a few births. T4 fixes the step from the baseline spread and says so in the grid.
- `eval.chase_catch_share` and `eval.chase_escape_share` are `watch`; `eval.predator_presence` and `eval.predators_at_end` are unverified. Verdict metrics are `eval.hunter_catches_per_1k` and `eval.hunter_juvenile_death_share` (64 seeds), `eval.bite_on_prey_view` and `eval.spec_effective`, read over body bands once templates go.
- Runs are 200000 ticks, the length the registry's power was measured at; adoption is the keep rule on 64 matched seeds.

## Decisions

| Decision                                                                      | Why                                                                                                                   | Who                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| The reader inventory and the band function come before the first gene         | Phase 2 already changes what `canHunt` means for every reader; an audit at T11a finds the breakage after two switches | Delegated (plan review, 2026-11-15) |
| One function, `bandOf` in `js/sim/body-genes.js`, maps a body to a band       | 157 reads and every training tool need the same answer; a band per caller drifts                                      | Delegated (plan review, 2026-11-15) |
| Co-evolution is tested by transplant, not by a correlation                    | A correlation of gene and weight across a population holds for two static founder types                               | Delegated (plan review, 2026-11-15) |
| Removing flips has its own arm                                                | `specFlipNoHunt` exists; without the arm a gain from no flips is credited to continuous traits                        | Delegated (plan review, 2026-11-15) |
| The curve's shape is screened, not assumed                                    | The shape decides whether specialists or one generalist evolve                                                        | Delegated (plan review, 2026-11-15) |
| This doc waits for [prey-guilds.md](prey-guilds.md) Phase 5's trade-off table | Each axis endpoint is a guild lever that passed its own screen; an axis with an untested end is a guess               | Delegated (plan review, 2026-11-15) |
| E-BG-1 makes no baseline prediction for the trait metric families             | They describe the template priors and a population correlation; the transplant probe is the direct co-adaptation test | Coordinator, 2026-11-17             |

## Experiments

| Id     | Task | Question                                                                          | Prediction (written before the run)                                                                                                                                       |
| ------ | ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-BG-1 | T2   | Where do today's templates sit on the four axes, and are brains fitted to bodies? | Five points on each axis; the transplant gap is above 0 for predators against foragers and inside its interval among the four prey templates                              |
| E-BG-2 | T5   | Which diet curve keeps hunters and grazers apart?                                 | `diet-convex` keeps two modes; `diet-concave` collapses to one omnivore; `no-flip` alone lowers `eval.hunter_juvenile_death_share`, so part of the gain is not the genes' |
| E-BG-4 | T10  | Do burst and pace hold more than one body each?                                   | `pace` splits into fast and slow lines by basin; `burst` moves to one end unless [sprint-burst.md](sprint-burst.md)'s store prices it                                     |
| E-BG-6 | T15  | Did brains follow bodies?                                                         | The transplant gap is larger than at `E-BG-1` among prey bands                                                                                                            |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | New `js/sim/body-genes.js` (continuous trait curves), updates to `js/sim/brain-layout.js` (`TRAIT_GENES`, `BRAIN_LAYOUT_NAME`), `js/sim/traits.js`, `js/sim/feeding.js`, `js/sim/energy.js`, `js/sim/physics.js`, `js/sim/reproduction.js`, `js/evo/scene-traits.js` and `js/evo/descriptors.js`. Renderer reads continuous body genes (jaw size, armour ring, hue) via snapshot |
| Unit tests              | `test/sim/body-genes.test.js` (monotonicity and trade-off bounds on every gene curve, `carnivoryThreshold` boundary); `test/evo/scene-traits.test.js` (bimodality and brain-alignment math on planted worlds)                                                                                                                                                                    |
| Headless e2e            | `test/sim/golden.json` and `BUSY_EFFECT_HASH` unchanged in Phase 1 and re-pinned at each phase switch with `npm run browser:hash`; `eval-smoke` passes on every branch                                                                                                                                                                                                           |
| Performance budget      | Trait curves are computed once per birth (stored on per-slot typed arrays in `world.js`) with zero per-tick transcendental overhead; `bench.step_ms@500` stays within `bench-check` margin                                                                                                                                                                                       |
| Evolution metrics       | Phase 1: `E-BG-1` (16 seeds). Phases 2–3: 16-seed screens (`E-BG-2`, `E-BG-4`) and 64-seed `eval:compare --keep-rule` (`E-BG-3`, `E-BG-5`). Phase 4: 64-seed verdict (`E-BG-6`)                                                                                                                                                                                                  |
| Determinism             | Trait mutations use the existing `mutation` RNG stream; replayable from seed and config                                                                                                                                                                                                                                                                                          |
| Config and persistence  | New `BRAIN_LAYOUT_NAME` (`pooled-v6`) stamped on genomes/champions at Phase 2 switch; `continuousTraits` and `continuousPace` switches with `scripts/flag-ledger.json` entries, deleted at each switch                                                                                                                                                                           |
| Logging and diagnostics | No per-tick log event; `BodyGenesSummary` (info, once per 10,000 ticks: trait means and bimodality) for debug runs; `npm run replay` reproduces deterministically                                                                                                                                                                                                                |
| Browser compatibility   | Verified via `npm run browser:hash` after each switch; renderer maps continuous `bulkGene` and `carnivoryGene` to existing body visual parameters                                                                                                                                                                                                                                |
| Docs                    | [metrics.md](metrics.md) regenerated; [sim-notes.md](sim-notes.md) entry per phase verdict; [README.md](../../README.md) updated when `specialisations` templates are retired                                                                                                                                                                                                    |
| Verification            | `scripts/check.sh` green per chunk PR; `eval:compare --keep-rule` reports under `evals/decisions/E-BG-*/`; arena clip of continuous guilds                                                                                                                                                                                                                                       |

## Task breakdown

### Phase 1 - Trait detectors and seeding bridge

| #   | Task                                                                                                                                                                                                                 | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/scene-traits.js` (`eval.trait_spread.*`, `eval.trait_bimodality.carnivory`, `eval.trait_brain_alignment`), registry + `liveness.js` entries and `test/evo/scene-traits.test.js`                          | [judgement]  | -          |
| T1a | Map each template onto the four axes for the baseline detectors (no sim change), and add `js/evo/transplant-probe.js`, `scripts/transplant-probe.mjs` and `npm run probe:transplant` with tests on hand-built brains | [judgement]  | T1         |
| T2  | Run `E-BG-1` (16 seeds x 200,000 ticks) baseline and the transplant probe on its saved champions; record in [sim-notes.md](sim-notes.md)                                                                             | [mechanical] | T1, T1a    |
| T3  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                  | [judgement]  | T1, T2     |

### Phase 2 - Continuous `carnivoryGene` and `bulkGene`

| #   | Task                                                                                                                                                                                                                                     | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T3a | Audit endpoint/intermediate and compound body budgets with deterministic fixtures; specify a priced burst/endurance trade-off before screening                                                                                           | [judgement]  | T3         |
| T3b | Inventory every read of `world.spec` and of a `...BySpec` table in `js/` and `scripts/` (157 in 81 files on 2026-11-15) and class each: body capability, ancestry label, or training tool key; commit the table under `evals/decisions/` | [mechanical] | T3         |
| T3c | Add `bandOf` and move the archive grid, the seeder, drills, reflex cases, champion files, the league, the mate rank and the style export onto it behind the templates (bands equal templates, every hash unchanged)                      | [judgement]  | T3b        |
| T4  | Add `js/sim/body-genes.js`, extend `TRAIT_GENES` in `brain-layout.js` (`BRAIN_LAYOUT_NAME` bump), wire `carnivoryGene` and `bulkGene` behind `continuousTraits`, with the trait mutation step fixed from the baseline spread; tests      | [judgement]  | T3a, T3c   |
| T5  | Write `evals/screens/body-genes-diet.grid.json` (the six arms of Test design, `diet-linear` with and without the threshold) and prediction; run 16-seed screen `E-BG-2`                                                                  | [judgement]  | T4         |
| T6  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-BG-3`)                                                                                                                                                               | [mechanical] | T5         |
| T7  | Switch: adopt winning curves, delete `continuousTraits` flag, open new season, re-pin goldens and `browser:hash`                                                                                                                         | [mechanical] | T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                      | [judgement]  | T7         |

### Phase 3 - Continuous `burstGene` and `paceGene`

| #    | Task                                                                                                                                                                      | Nature       | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T9   | Wire `burstGene` and `paceGene` behind `continuousPace` in `body-genes.js`, `energy.js`, `physics.js` and `reproduction.js`; tests                                        | [judgement]  | T8         |
| T10  | Write `evals/screens/body-genes-pace.grid.json` (the four arms of Test design) and prediction; run 16-seed screen `E-BG-4`                                                | [judgement]  | T9         |
| T11  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-BG-5`)                                                                                                | [mechanical] | T10        |
| T11a | Audit specialisation consumers and threshold transitions; specify phenotype-band interaction reports and test mixed-parent/juvenile continuity before template retirement | [judgement]  | T11        |
| T12  | Switch: adopt continuous traits, retire discrete `specialisations` templates (if `E-BG-5` holds), open new season, re-pin goldens and `browser:hash`                      | [judgement]  | T11, T11a  |
| T13  | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`                                                                                       | [judgement]  | T12        |

### Phase 4 - Co-evolutionary archive and season graduation

| #    | Task                                                                                                                   | Nature       | Depends on |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T14  | Update `js/evo/descriptors.js` to index continuous body-gene axes alongside style                                      | [judgement]  | T13, T11a  |
| T14a | Run the transplant probe on the Phase 2 and Phase 4 worlds' saved champions and compare the gap with `E-BG-1`'s        | [mechanical] | T14        |
| T15  | Run 64-seed validation `E-BG-6` and record verdict in [sim-notes.md](sim-notes.md)                                     | [mechanical] | T14, T14a  |
| T16  | Watch arena clip verifying emergent body/brain divergence                                                              | [judgement]  | T15        |
| T17  | Conformance review of Phase 4 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented` | [judgement]  | T16        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run eval` reports `eval.trait_spread.*` and `eval.trait_bimodality.carnivory`.
3. Phases 2–3: 16-seed screens and 64-seed `eval:compare --keep-rule` verdicts committed under `evals/decisions/E-BG-*/`, and `npm run browser:hash` matches re-pinned goldens.
4. Phase 4: functional phenotype groups persist and replace themselves, trait-distribution and alignment diagnostics are reported, and the arena clip shows distinct behaviour. Unimodality alone does not fail the phase.
