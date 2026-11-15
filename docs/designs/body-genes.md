# Body genes

**Status:** Proposed - replace the five discrete `specialisations` templates with continuous, heritable body genes (jaw-vs-gut diet, bulk-vs-agility, sprint-vs-endurance, sight) so body and brain co-evolve together; Phase 1 (continuous-trait detectors and baseline) is first.
**Validated:** 5abe7bfb (2026-11-15)
**Priority:** 30 - builds on [prey-guilds.md](prey-guilds.md) (which proves which trade-offs hold niches) and [honest-budgets.md](honest-budgets.md) (which fixes energy conservation and juvenile survival)
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

Add `js/evo/scene-traits.js` with the four trait-distribution detectors and map the existing five specialisations to initial trait-gene priors so seeded populations start with familiar guilds before continuous evolution takes over.

#### Chunks

| Chunk | Tasks    | Contents                                                                                     |
| ----- | -------- | -------------------------------------------------------------------------------------------- |
| A     | T1 to T3 | `scene-traits.js`, registry entries, tests, 16-seed baseline `E-BG-1` and conformance review |

### Phase 2 - Continuous `carnivoryGene` and `bulkGene`

**Targets:** eval.hunter_catches_per_1k, eval.hunter_juvenile_death_share, eval.bite_on_prey_view

Replace the discrete `canHunt`, `plantFoodValue`, `meatFoodValue`, `biteMultiplier`, `biteTakenMultiplier`, `kickMultiplier` and `turnMultiplier` lookups with continuous curves over `carnivoryGene` and `bulkGene` behind a `continuousTraits` switch. Screen the trade-off exponents (`E-BG-2`, 16 seeds) and run the 64-seed keep rule (`E-BG-3`), checking that carnivores and herbivores diverge (`eval.trait_bimodality.carnivory > 0.55`) without `specMutationRate` flips.

#### Chunks

| Chunk | Tasks    | Contents                                                                                                        |
| ----- | -------- | --------------------------------------------------------------------------------------------------------------- |
| B     | T4 to T8 | `js/sim/body-genes.js`, layout stamp update, `E-BG-2` screen, `E-BG-3` keep rule, switch and conformance review |

### Phase 3 - Continuous `burstGene` and `paceGene`

**Targets:** eval.chase_catch_share, eval.chase_escape_share, eval.predator_presence, eval.predators_at_end

Move `sprintBoost`, `passiveLossMultiplier`, `maxEnergyMultiplier`, `splitMinEnergyMultiplier` and maturity/pregnancy scaling onto `burstGene` and `paceGene` behind `continuousPace` (`E-BG-4`, `E-BG-5`). Retiring the five discrete `specialisations` templates from `config-defaults.js` once both phases pass.

#### Chunks

| Chunk | Tasks     | Contents                                                                                                                |
| ----- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| C     | T9 to T13 | `burstGene` / `paceGene` wiring, `E-BG-4` screen, `E-BG-5` keep rule, template retirement switch and conformance review |

### Phase 4 - Co-evolutionary archive and season graduation

**Targets:** eval.spec_effective, eval.hunter_catches_per_1k, eval.predators_at_end

Update MAP-Elites archive descriptors (`descriptorV7` / `descriptorV8`) so archive cells index continuous body-type bands alongside behavioural style, run 64-seed validation (`E-BG-6`), and verify by arena clip that distinct body lineages (coursers, ambushers, tanks, fast breeders) persist together.

#### Chunks

| Chunk | Tasks      | Contents                                                                          |
| ----- | ---------- | --------------------------------------------------------------------------------- |
| D     | T14 to T17 | Archive descriptor update, `E-BG-6` validation, arena clip and conformance review |

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

| #   | Task                                                                                                                                                                                        | Nature       | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T1  | Add `js/evo/scene-traits.js` (`eval.trait_spread.*`, `eval.trait_bimodality.carnivory`, `eval.trait_brain_alignment`), registry + `liveness.js` entries and `test/evo/scene-traits.test.js` | [judgement]  | -          |
| T2  | Run `E-BG-1` (16 seeds x 400,000 ticks) baseline and record in [sim-notes.md](sim-notes.md)                                                                                                 | [mechanical] | T1         |
| T3  | Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                         | [judgement]  | T1, T2     |

### Phase 2 - Continuous `carnivoryGene` and `bulkGene`

| #   | Task                                                                                                                                                                   | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T4  | Add `js/sim/body-genes.js`, extend `TRAIT_GENES` in `brain-layout.js` (`BRAIN_LAYOUT_NAME` bump), wire `carnivoryGene` and `bulkGene` behind `continuousTraits`; tests | [judgement]  | T3         |
| T5  | Write `evals/screens/body-genes-diet.grid.json` and prediction; run 16-seed screen `E-BG-2`                                                                            | [judgement]  | T4         |
| T6  | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-BG-3`)                                                                                             | [mechanical] | T5         |
| T7  | Switch: adopt winning curves, delete `continuousTraits` flag, open new season, re-pin goldens and `browser:hash`                                                       | [mechanical] | T6         |
| T8  | Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                                    | [judgement]  | T7         |

### Phase 3 - Continuous `burstGene` and `paceGene`

| #   | Task                                                                                                                                                 | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T9  | Wire `burstGene` and `paceGene` behind `continuousPace` in `body-genes.js`, `energy.js`, `physics.js` and `reproduction.js`; tests                   | [judgement]  | T8         |
| T10 | Write `evals/screens/body-genes-pace.grid.json` and prediction; run 16-seed screen `E-BG-4`                                                          | [judgement]  | T9         |
| T11 | Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-BG-5`)                                                                           | [mechanical] | T10        |
| T12 | Switch: adopt continuous traits, retire discrete `specialisations` templates (if `E-BG-5` holds), open new season, re-pin goldens and `browser:hash` | [judgement]  | T11        |
| T13 | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`                                                                  | [judgement]  | T12        |

### Phase 4 - Co-evolutionary archive and season graduation

| #   | Task                                                                                                                   | Nature       | Depends on |
| --- | ---------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T14 | Update `js/evo/descriptors.js` to index continuous body-gene axes alongside style                                      | [judgement]  | T13        |
| T15 | Run 64-seed validation `E-BG-6` and record verdict in [sim-notes.md](sim-notes.md)                                     | [mechanical] | T14        |
| T16 | Watch arena clip verifying emergent body/brain divergence                                                              | [judgement]  | T15        |
| T17 | Conformance review of Phase 4 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented` | [judgement]  | T16        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on each chunk PR.
2. Phase 1: `npm run eval` reports `eval.trait_spread.*` and `eval.trait_bimodality.carnivory`.
3. Phases 2–3: 16-seed screens and 64-seed `eval:compare --keep-rule` verdicts committed under `evals/decisions/E-BG-*/`, and `npm run browser:hash` matches re-pinned goldens.
4. Phase 4: `eval.trait_bimodality.carnivory > 0.55`, `eval.trait_brain_alignment > 0`, predators persist, and the arena clip shows distinct emergent body types.
