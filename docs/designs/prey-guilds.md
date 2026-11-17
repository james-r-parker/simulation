# Prey guilds

**Status:** In progress - differentiate the four non-hunter specialisations (`forager`, `reproducer`, `scout`, `defender`) into complementary anti-predator and life-history guilds so "everything else" keeps hunters in check without scripted modes or extra brain inputs; built so far, out of plan order: T1/T1b (guild detectors, #445 and this chunk), T4 (defender repel levers, #448), T5 (the `prey-guilds-defender` grid and prediction only), T9 (scout call levers, #450) and T10 (the `prey-guilds-scout` grid and prediction only). Every lever sits behind a neutral default, so `worldHash` is unchanged; no phase is `(built)` (see Built out of order).
**Validated:** 04e3b340 (2026-11-17)
**Priority:** 30 - depends on a standing prey population and working alarm/kill budgets ([honest-budgets.md](honest-budgets.md)), and on verified interface/chase physics ([senses-and-motor.md](senses-and-motor.md))
**Depends on:** [honest-budgets.md](honest-budgets.md), [senses-and-motor.md](senses-and-motor.md)

Today's five specialisations (`forager`, `predator`, `reproducer`, `scout`, `defender` in `js/sim/config-defaults.js`) behave like **one hunter guild and four mildly reskinned foragers**:

- All four non-hunters share `plantFoodValue: 1`, `meatFoodValue: 0.3`, `sprintBoost: 1` and `turnMultiplier: 1`. In E175 (`body-k25r`), their mean fitness is nearly identical (`1545` to `1647`), with `eval.spec_effective` 3.13 and `eval.spec_dominance` 0.55.
- `defender` (`biteTakenMultiplier: 0.5`, `kickMultiplier: 2`, `moveCostMultiplier: 1.2`) only softens bites on _itself_; it cannot repel a hunter, guard kin or make a solo ambush unprofitable.
- `scout` (`visionRange: 400`, `passiveLossMultiplier: 1.3`, `biteTakenMultiplier: 1.5`) pays a steep metabolic and fragility tax while `eval.alarm_rate` sits near 0, so its extra sight warns nobody.
- `reproducer` (`cooldownMultiplier: 0.5`, `visionRange: 250`) only trims 75 ticks off `reproductionCooldown` (150), which is swamped by `pregnancyTicks` (480) and `maturityTicks` (600); its life-history budget is otherwise identical to `forager`.

This doc turns the four non-hunter specialisations into real ecological guilds—**hunters vs. everything else**, where each prey guild counters a different part of the hunt or life cycle while paying an honest metabolic or vulnerability cost.

Scenes served: **Call, or don't** (scouts warn early), **Pack, or loner** (defenders force solo hunters to abort or pack up), **Abort** (a hunter peels off a defended target), **Boom and bust** (reproducers recolonize after crashes; foragers hold lean patches), **Same spec, different custom**, and the traits **A body is a budget**, **Kin is not a stranger** and **Other blobs are the climate** ([principles.md](../principles.md)).

## Principle and refusals

- **A body is a budget:** Every guild gain (armour, active repel, wider sight, sprint escape, fast maturity) is paired with a real energy, size or vulnerability cost.
- **No scripted modes:** A `defender` still chooses when to turn and `BITE` via its brain; a `scout` still chooses when to `ALARM` and `SPRINT`. Nothing plays the life for it.
- **Zero new brain inputs:** All five specialisations already see threat, prey, kin, heard alarm, energy and size; no input or layout change is added.
- **Kin payoff is real:** Guarding kin or warning neighbours wins only if the guarded/warned kin survive to breed (selection rule 7).

## Nature model

| Guild        | Natural analogue                                 | Role against hunters & climate                                                                                             | Honest cost                                                                                          |
| ------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `defender`   | Muskox, cape buffalo, baboon guard               | Absorbs bites, actively shoves/kicks `canHunt` attackers in jaws, and grows large enough to deter solo hunters             | Heavier move cost (`1.2`), slower turn (`0.85`), higher `splitMinEnergyMultiplier` (`1.2`)           |
| `scout`      | Meerkat sentry, vervet monkey, Thomson's gazelle | Sees farthest (`400`), broadcasts wider/cheaper alarms when a threat is seen, and sprints faster (`1.25`) to break ambush  | Fragile (`biteTakenMultiplier: 1.5`), higher standing cost (`1.3`)                                   |
| `reproducer` | Mouse, rabbit, r-strategist                      | Matures and gestates faster, splits at lower energy (`0.7`), and booms into empty patches after a winter or predator sweep | Smaller `maxEnergyMultiplier` (`0.7`), dies faster in winter/starvation, easy prey for young hunters |
| `forager`    | Steady grazer / browser                          | Lowest standing cost (`0.85`), best grazing/handling efficiency in depleted patches and winter                             | Baseline speed (`1.0`), baseline sight (`300`), no active defence                                    |

## Detectors

All computed by the eval observer; none is a reward.

| Metric                          | Direction      | Reads                                                                                                                              |
| ------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `eval.guild_share.<spec>`       | watch          | Mean share of alive agents in each non-hunter guild (`forager`, `reproducer`, `scout`, `defender`) after burn-in                   |
| `eval.guild_survival.<spec>`    | watch          | Mean lifespan / `maxAgeTicks` for each of the four non-hunter specialisations                                                      |
| `eval.defender_repel_per_1k`    | higher         | Active defensive repels landed by `defender` agents on `canHunt` agents per 1,000 defender-ticks                                   |
| `eval.scout_alarm_lead_share`   | higher         | Of `alarm` calls by `scout` agents with a threat on their rays, the share fired before the hunter closes within `callRadius * 0.5` |
| `eval.reproducer_recovery_rate` | watch (higher) | `reproducer` share of births during post-bust recovery ticks (population rising from `< 120`)                                      |
| `eval.spec_effective`           | higher         | Existing effective number of specialisations (`1 / sum(p_i^2)`)                                                                    |
| `eval.spec_dominance`           | watch (lower)  | Existing largest specialisation share                                                                                              |

## Phases

### Phase 1 - Guild detectors and baseline

**Targets:** none - detectors only; `worldHash` and golden cases are unchanged

The baseline is the shared run of [detector-baseline.md](detector-baseline.md), read once for every plan that has its prediction written.

Add the four new guild detectors in `js/evo/scene-guilds.js` and run a 16-seed baseline (`E-PG-1`, 400,000 ticks, floor on) on the post-`honest-budgets` defaults. Prediction, written before the run: `eval.defender_repel_per_1k` is `0` (not yet implemented), `eval.scout_alarm_lead_share` is null or under `0.1`, and `eval.guild_survival.*` differs by less than `0.05` across `forager`, `reproducer`, `scout` and `defender`.

#### Chunks

| Chunk | Tasks              | Contents                                                                                     |
| ----- | ------------------ | -------------------------------------------------------------------------------------------- |
| A     | T1 to T3, T2a, T2b | `scene-guilds.js`, registry entries, tests, 16-seed baseline `E-PG-1` and conformance review |

### Phase 2 - `defender` as active guard

**Targets:** eval.hunt_abort_rate, eval.pack_kills_per_eaten_death, eval.spec_effective

Today `defender` only hurts a hunter that bites it. Add an active defensive push/counter-kick when a `defender` chooses `BITE > 0` with a `canHunt` agent in its jaws (`inJaws`), governed by `defenderRepelEnergy` (energy cost to the hunter, plus knockback impulse along the defender-to-hunter vector) and `defenderRepelCost` (energy cost to the defender). Screen `defender` size/mass parity (`defender.turnMultiplier: 0.85`, `defender.splitMinEnergyMultiplier: 1.2`, `defender.maxEnergyMultiplier: 1.4`) so adult defenders are hard for a _solo_ hunter to take down, creating real ecological pressure for **Pack, or loner** and **Abort**.

| Arm          | `defenderRepelEnergy` | `defenderRepelImpulse` | `defender.maxEnergyMultiplier` |
| ------------ | --------------------- | ---------------------- | ------------------------------ |
| `control`    | 0                     | 0                      | 1.0                            |
| `repel-low`  | 25                    | 2.5                    | 1.2                            |
| `repel-med`  | 40                    | 4.0                    | 1.4                            |
| `repel-high` | 60                    | 5.0                    | 1.4                            |

| Done when                                                                                                                                                                                          | Stop when                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `eval.defender_repel_per_1k > 0`, `eval.hunt_abort_rate` or `eval.pack_lift` rises, and `keepRule` on 64 seeds reads no guard `WORSE` (including `eval.hunter_catches_per_1k` and predators alive) | Every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE` |

#### Chunks

| Chunk | Tasks              | Contents                                                                                                              |
| ----- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| B     | T4 to T8, T4a, T6a | Active repel in `feeding.js`/`physics.js`, screen `E-PG-2`, 64-seed keep rule `E-PG-3`, switch and conformance review |

### Phase 3 - `scout` as vigilance and escape network

**Targets:** eval.alarm_rate, eval.alarm_lift, eval.spec_effective

Pair with `honest-budgets.md` Phase 5 (`alarmBiteShare`) so alarms actually protect neighbours. Give `scout` a wider alarm reach (`scoutCallRadiusMultiplier`, e.g. `1.5`), lower call cost (`scoutAlarmCostMultiplier`, e.g. `0.5`), and a burst escape speed (`scout.sprintBoost` `1.2` to `1.35`) so scouts spot stalking hunters at `400` px, warn nearby kin/foragers before contact, and escape the initial lunge.

| Done when                                                                                                                             | Stop when                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `eval.scout_alarm_lead_share` rises over control, `eval.alarm_lift` holds positive, and `keepRule` on 64 seeds reads no guard `WORSE` | Calls spam without threats or `eval.guild_survival.scout` collapses |

#### Chunks

| Chunk | Tasks                | Contents                                                                                                                                   |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| C     | T9 to T12, T9a, T10a | Scout call/sprint modifiers in `calls.js`/`config-defaults.js`, screen `E-PG-4`, 64-seed keep rule `E-PG-5`, switch and conformance review |

### Phase 4 - `reproducer` r-strategy vs. `forager` efficiency

**Targets:** eval.spec_effective, eval.spec_dominance, eval.boom_bust_count

Give `reproducer` a true fast-life budget: `reproducer.splitMinEnergyMultiplier` (`0.65`–`0.75`), `reproducer.maxEnergyMultiplier` (`0.7`), and `reproducerMaturityMultiplier` / `reproducerPregnancyMultiplier` (`0.65`) so reproducers mature and multiply rapidly into empty/post-bust patches while staying small, fragile prey for young/solo hunters. Pair with `forager.passiveLossMultiplier` (`0.85`–`0.9`) so `forager` out-persists `reproducer` in lean patches and winter.

| Done when                                                                                                                             | Stop when                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `eval.spec_effective` rises over control, `eval.spec_dominance` falls below `0.45`, and `keepRule` on 64 seeds reads no guard `WORSE` | One of the two specs drives the other to extinction on > 50% of seeds |

#### Chunks

| Chunk | Tasks            | Contents                                                                                                                               |
| ----- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| D     | T13 to T16, T14a | `reproducer` life-history scaling and `forager` efficiency, screen `E-PG-6`, 64-seed keep rule `E-PG-7`, switch and conformance review |

### Phase 5 - Combined guild balance and verification

**Targets:** eval.spec_effective, eval.spec_dominance, eval.hunter_catches_per_1k, eval.pack_kills_per_eaten_death

Verify all four prey guilds together against the pre-guild baseline on 64 matched seeds (`E-PG-8`), checking that predators remain alive, pack hunting and alarm deterrence are active, and a viewer can narrate all five roles in the arena clip.

#### Chunks

| Chunk | Tasks                  | Contents                                                                                                      |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| E     | T17 to T20, T17a, T17b | 64-seed combined validation `E-PG-8`, [sim-notes.md](sim-notes.md) verdict, arena clip and conformance review |

### Coexistence checks

T2a maps prey vulnerability by age, condition and habitat using matched encounters and whole-world baselines. T17a tests the combined guild world through seasonal troughs with rescue disabled, after [honest-budgets.md](honest-budgets.md) Phase 6 recruitment diagnostics exist. Report hunter descendant replacement alongside guild survival; standing founder hunters are not proof of coexistence. Compare each defence alone and together, including an undefended control. A refuge must require a feeding excursion; a defender pays for repelling; a scout's call remains a choice. Identify prey accessible to a young hunter without making every guild uniformly vulnerable. No role quota, hunter restocking or rewarded vulnerability is introduced. Clips cover refuge exit, an aborted attack on defended prey and local recolonisation from living neighbours; an absent scene stays an open result.

### Competition, cooperation and local niches

T2b records a five-role interaction matrix, split by age, season and habitat: resource intake and depletion, injury, displacement, calls heard, births and descendants reaching maturity. Separate kin from unrelated neighbours and founders from their descendants. Reuse the recruitment ledger of [honest-budgets.md](honest-budgets.md) Phase 6; do not infer benefit from proximity or a role label. These diagnostics are observer-only, with explicit denominators and null for an absent opportunity, and add no rewards. Phase 1 instrumentation can precede that ledger; descendant claims wait for it.

T6a tests defence as a costly action. Fixtures cover facing away, insufficient energy, repeated contact, multiple attackers, and a hunter displaced into a wall or another prey. Bound the repel rate and book its energy cost once per action; specify the interval before the screen rather than allowing contact frequency to set it accidentally. Compare self-defence, defence near kin and defence near strangers with matched threat and food opportunities. A shove is not evidence of guarding; a guarding claim needs improved kin survival or reproduction with the defender's cost included. No automatic interception, target selection or ally bonus is introduced.

T10a separates the scout's own escape benefit from a benefit to listeners. Matched signal-muted and listener-insensitive controls preserve the caller's action cost and other body traits. Test kin, unrelated listeners, no listeners, false alarms and multiple simultaneous callers. Measure the caller family's descendants and the listeners' descendants separately, alongside missed meals and false-flight costs. Use [alarm-calls.md](alarm-calls.md)'s detectors and [honest-budgets.md](honest-budgets.md) Phase 5's bite rule; first reconcile overlapping protection mechanisms so the same warning cannot accidentally stack two discounts. More calls alone do not justify adoption, and a silent freeloader must remain possible.

T14a tests fast reproduction against efficient foraging in the same finite patch budget, with predators present and absent. Count mature children per parental energy spent, maternal survival and local depletion, not births alone. Separate recovery by living residents from immigration and role mutation. Verify maturity-dependent sensing, mating, territory eligibility and observer age classes use the same per-body threshold. Test fast breeders through a lean season and efficient foragers during recolonisation; a permanently superior role fails the intended trade-off. Any food-handling advantage is a separate measured lever, not an extra unpriced multiplier bundled into a fertility arm.

T17b runs rare-role and leave-one-role-out experiments on fixed initial mixtures before release validation. Change initial frequencies only, keep total bodies and initial energy matched, and disable rescue; no runtime rare-role bonus or forced replacement is allowed. Distinguish failure to find mates from failure to feed, and continued introduction by mutation from reproduction of established families. Report growth from rarity, extinction probability and descendant replacement by habitat and season, not just whole-map diversity. A role need not occupy every patch or recover on every seed. If the planned migration system is active, report an additional migration-off arm; migration approval and implementation remain owned by [migration.md](migration.md).

The combined verdict retains its existing keep rule and adds the interaction matrix, each role's local persistence and the costs and beneficiaries of its proposed service. Predeclare hypotheses and sample sizes before screening, confirm on held-out seeds, and retain failed arms. Clips show a costly defence, a warning ignored, a fast-breeding patch exhausting its food, and recolonisation by surviving neighbours where these occur. Missing scenes are open findings, not successes inferred from labels. Uniform shares and a mandatory five-role equilibrium are not acceptance criteria; dominance thresholds alone cannot establish coexistence.

## Test design

### What the code does today

| Fact                                                                                                  | Where                       | Consequence                                                                                                      |
| ----------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| A bite lands only for a `canHunt` biter (`couldBite`)                                                 | `js/sim/bite-rule.js`       | A defender's `BITE` output has never done anything, so no defender brain has been selected to use it             |
| An alarm costs `alarmCost` 5 and no call is made on most seeds                                        | `js/sim/calls.js`, `E143`   | A scout's wider or cheaper call changes nothing until some brain calls at all ([alarm-calls.md](alarm-calls.md)) |
| A child takes another specialisation with `specMutationRate` 0.02, keeping its mother's brain         | `js/sim/config-defaults.js` | Guild shares are partly set by flips, not by each guild replacing itself                                         |
| Maturity, pregnancy and cooldown are global keys; per-role values live under `specialisations.<name>` | `js/sim/config-defaults.js` | New role levers are fields of `specialisations.<name>`, not global keys named after a role                       |

### One lever per arm

Phase 2's arms change the repel and the defender's `maxEnergyMultiplier` together, so a verdict cannot say which one made a solo hunter abort. Each screen is laid out so every lever has an arm in which it alone differs from the control.

| Screen   | Arms                                                                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E-PG-2` | `control`; `repel` (`defenderRepelEnergy` 40, impulse 4, size as today); `bulk` (`maxEnergyMultiplier` 1.4, no repel); `repel-bulk` (both); `repel-lo` (25, 2.5); `repel-hi` (60, 5)                             |
| `E-PG-4` | `control`; `reach` (`specialisations.scout.callRadiusMultiplier` 1.5); `cheap` (`alarmCostMultiplier` 0.5); `sprint` (`sprintBoost` 1.25); `reach-sprint`; `all`                                                 |
| `E-PG-6` | `control`; `fast` (reproducer maturity and pregnancy x 0.65, `splitMinEnergyMultiplier` 0.7); `small` (reproducer `maxEnergyMultiplier` 0.7); `fast-small`; `lean` (forager `passiveLossMultiplier` 0.85); `all` |

`cheap` is the arm the trait "Signals cost, and they can be false" may refuse: a call at half price is closer to a free action. It is adopted only if calls with no threat on the caller's rays do not rise faster than calls with one (`eval.alarm_calls_with_threat_per_1k` against `eval.alarm_rate`).

### The guard must be learnable

A defender has no reason today to raise `BITE`, and a scout none to call. Before the screens, T4a and T9a read the four bars of [senses-and-motor.md](senses-and-motor.md) (oracle, input-only reference, `npm run probe:learn`, champion) on two staged lessons: `repel-hunter` (a hunter in a defender's jaws; won when the hunter leaves and the defender lives) and `warn-kin` (a hunter closing on a scout with kin in call range; won when the kin survive). A lesson the learn probe cannot reach in 200 generations will not appear in a 200000-tick world either; the screen then reads a lever no brain uses, and the finding goes to the instinct prior ([brain-capacity-and-memory.md](brain-capacity-and-memory.md)), not to a larger number.

### What counts as a result

- `eval.hunt_abort_rate` and `eval.alarm_lift` are `watch` metrics and give no verdict. `eval.spec_dominance`, `eval.alarm_rate` and `eval.boom_bust_count` are unverified. A Done row rests on a verified metric with a direction (`eval.spec_effective`, `eval.pack_kills_per_eaten_death`, `eval.hunter_catches_per_1k`) and reports the others.
- `eval.pack_lift` is built by [training-stages.md](training-stages.md) T2; Phase 2 does not start before it is registered and has a power reading.
- "`eval.spec_dominance` falls below 0.45" is a raw line. The test is `eval:compare` against the control on matched seeds ([principles.md](../principles.md): "Raw counts against a fixed line are not a test").
- Which guild a hunter eats is read directly: `eval.prey_selectivity.<spec>` (T1) is each guild's share of eaten deaths over its share of the prey alive, so 1 is no preference. A defence that works lowers its guild's value and raises another's.
- Runs are 200000 ticks, the length the registry's power was measured at; adoption is the keep rule on 64 matched seeds.
- Each adopted lever is recorded as a trade-off (what it buys, what it costs, in the same units) in the Phase 5 verdict, so [body-genes.md](body-genes.md) can place it on an axis.

## Built out of order

On 2026-11-15, T1, T4, T5, T9 and T10 (the screens' grids and predictions only) were built ahead of T2, T3 and T6 to T8. What that leaves, and the rule for resuming:

- T2 (the baseline) and T3 (conformance review of Phase 1) were skipped. T2 is folded into the shared 128-seed baseline of [detector-baseline.md](detector-baseline.md) T7, which serves this plan's `E-PG-1`; no 16-seed run of its own is made.
- The `E-PG-2` and `E-PG-4` screens have not been run, the `E-PG-3` and `E-PG-5` keep rules are not run, and T6 to T8 (adopt, switch, review) are not done. The repel and scout levers (`defenderRepelEnergy`, `defenderRepelCost`, `defenderRepelImpulse`, `scoutCallRadiusMultiplier`, `scoutAlarmCostMultiplier`) are config keys at neutral defaults, so no behaviour has changed.
- The scout grid does vary `scout.sprintBoost`: its three scout arms use 1.2, 1.25 and 1.35 against 1 in the control, with the matching call multipliers. It varies them together, so the sprint lever's own effect is not isolated; the grid has four arms, not the six of Test design, and no sprint-only arm.
- Resume at T3 (review what was built), then the shared baseline, then the screen runs, in rank order.

## Decisions

| Decision                                                                                                                                                                                  | Why                                                                                                                                                                  | Who                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Every screen has single-lever arms                                                                                                                                                        | An arm that moves two levers gives a verdict that names neither                                                                                                      | Delegated (plan review, 2026-11-15) |
| A staged lesson is shown reachable before its lever is screened                                                                                                                           | No defender brain has used `BITE` and no scout calls; a lever no brain pulls reads as a failed mechanism                                                             | Delegated (plan review, 2026-11-15) |
| Role levers are fields of `specialisations.<name>`                                                                                                                                        | `config-spec-rules.js` validates per-role fields; a global key named after one role is a second way to say the same thing                                            | Delegated (plan review, 2026-11-15) |
| A cheaper scout call is its own arm with its own stop rule                                                                                                                                | The trait "Signals cost" makes a discount the lever most likely to be refused                                                                                        | Planner, from principles.md         |
| Screens run with `specMutationRate` as the defaults have it, and once at 0                                                                                                                | A guild that holds its share only by flips from other guilds is not replacing itself (selection rule 1)                                                              | Delegated (plan review, 2026-11-15) |
| Prey selectivity compares each guild's eaten-death share with its mean living-prey share, excluding hunters                                                                               | Hunter headcount is not an available prey choice; E188 predates the metric, so liveness waits for the detector-baseline top-up rather than using fabricated readings | Coordinator, 2026-11-17             |
| No baseline prediction is claimed for `eval.guild_share.forager`, `eval.guild_share.reproducer`, `eval.guild_share.scout`, `eval.guild_share.defender` or `eval.reproducer_recovery_rate` | These descriptive detectors have no predeclared mechanism; the shared baseline reads their power and liveness only                                                   | Coordinator, 2026-11-17             |

## Experiments

| Id     | Task | Question                                                       | Prediction (written before the run)                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ---- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-PG-1 | T2   | Do the four prey roles differ today?                           | `eval.defender_repel_per_1k` is 0; `eval.scout_alarm_lead_share` is null or under 0.1; `eval.guild_survival.forager`, `eval.guild_survival.reproducer`, `eval.guild_survival.scout` and `eval.guild_survival.defender` differ by less than 0.05; `eval.prey_selectivity.forager`, `eval.prey_selectivity.reproducer`, `eval.prey_selectivity.scout` and `eval.prey_selectivity.defender` are each within 0.2 of 1 |
| E-PG-0 | T4a  | Can a brain learn to repel, and to warn?                       | The reference wins `repel-hunter` on over half of trials; the learn probe reaches it; `warn-kin` is reached on under half of populations                                                                                                                                                                                                                                                                          |
| E-PG-2 | T5   | Does repel, bulk, or both make a solo hunt on a defender fail? | `bulk` alone lowers `eval.prey_selectivity.defender`; `repel` alone moves nothing because no brain bites; `repel-bulk` equals `bulk`                                                                                                                                                                                                                                                                              |
| E-PG-4 | T10  | Does reach, price or sprint make scouts warn?                  | `sprint` raises scout survival; `reach` and `cheap` move no call metric while `eval.alarm_rate` is 0 on most seeds                                                                                                                                                                                                                                                                                                |
| E-PG-6 | T14  | Do fast breeders and lean foragers each hold a season?         | `fast-small` leads births in recovery and loses winter; `lean` holds winter; `fast` without `small` takes the map (`eval.spec_effective` `worse`)                                                                                                                                                                                                                                                                 |
| E-PG-8 | T17  | Do the adopted levers hold together?                           | No keep-rule guard `WORSE`; `eval.spec_effective` not `worse`; selectivity differs by guild                                                                                                                                                                                                                                                                                                                       |

## Delivery requirements

| Concern                 | Names                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Sim changes stay in `js/sim/`: `feeding.js` and `physics.js` (Phase 2 active repel), `calls.js` (Phase 3 scout call radius/cost), `reproduction.js` and `energy.js` (Phase 4 life-history scaling), and `config-defaults.js` / `config-rules.js` / `config-spec-rules.js`. Observer detectors in `js/evo/scene-guilds.js` and `js/evo/metric-registry/`. No worker, renderer, UI or brain-layout change     |
| Unit tests              | `test/evo/scene-guilds.test.js` (all four guild detectors on planted worlds); `test/sim/defender-repel.test.js` (defender `BITE > 0` repels a `canHunt` target in jaws, ignores non-hunters, charges `defenderRepelCost`); `test/sim/scout-calls.test.js` (wider `callRadius` and scaled `alarmCost` for `scout`); `test/sim/reproducer-lifecycle.test.js` (scaled maturity and pregnancy for `reproducer`) |
| Headless e2e            | `test/sim/golden.json` and `BUSY_EFFECT_HASH` in `test/worker/sim-host.slow.test.js` are unchanged in Phase 1 and re-pinned at each phase switch with `npm run browser:hash`; `eval-smoke` passes on every branch                                                                                                                                                                                           |
| Performance budget      | `bench.step_ms@500` within `bench-check` margin of `bench/baseline.json`. Phase 2 adds one `inJaws` + `canHunt` check per `defender` bite; Phase 3 one multiplier read per `alarm`; Phase 4 one multiplier read per birth/maturity check. Zero per-tick allocations                                                                                                                                         |
| Evolution metrics       | Phase 1: 16-seed baseline `E-PG-1`. Phases 2–4: 16-seed screen (`evals/screens/prey-guilds-*.grid.json`, 400,000 ticks, floor on) and 64-seed `eval:compare --keep-rule` against the prior phase. Phase 5: 64-seed combined verdict `E-PG-8`                                                                                                                                                                |
| Determinism             | No new RNG stream; all repel, call and life-history rules are deterministic functions of slot state and config                                                                                                                                                                                                                                                                                              |
| Config and persistence  | New keys in `js/sim/config-rules.js` and `js/sim/config-spec-rules.js`: `defenderRepelEnergy`, `defenderRepelCost`, `defenderRepelImpulse`, `scoutCallRadiusMultiplier`, `scoutAlarmCostMultiplier`, `reproducerMaturityMultiplier`, `reproducerPregnancyMultiplier`. Saved genomes and `BRAIN_LAYOUT_NAME` (`pooled-v5`) are unchanged; each adopted phase opens/updates the season `rulesHash`            |
| Logging and diagnostics | No new per-tick log event. `DefenderRepel` (debug: tick, defender slot, hunter slot, energy, impulse) emitted only on active repel events; failures replay via `npm run replay -- --seed <n> --ticks 400000 --config <arm.json> --level debug`                                                                                                                                                              |
| Browser compatibility   | N/A - no app, worker or renderer change; `npm run browser:hash` verifies Chromium worker parity after each switch                                                                                                                                                                                                                                                                                           |
| Docs                    | [metrics.md](metrics.md) regenerated for new detectors; [sim-notes.md](sim-notes.md) entry per screen/verdict; [principles.md](../principles.md) scene table updated if guild detectors move to `verified`. Once `Implemented`, this doc describes the shipped guild mechanics                                                                                                                              |
| Verification            | `scripts/check.sh` green per chunk PR; `eval:compare --keep-rule` reports commitment under `evals/decisions/E-PG-*/`; arena clip of `/?seed=<n>` showing scouts warning, defenders repelling, and reproducers recovering                                                                                                                                                                                    |

## Task breakdown

### Phase 1 - Guild detectors and baseline

| #   | Task                                                                                                                                                                                                                                                                                                                                                                           | Nature       | Depends on       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------------- |
| T1  | Built (#445), except `eval.prey_selectivity.*` (see T1b). Add `js/evo/scene-guilds.js` (`eval.guild_share.*`, `eval.guild_survival.*`, `eval.defender_repel_per_1k`, `eval.scout_alarm_lead_share`, `eval.reproducer_recovery_rate`, `eval.prey_selectivity.*`), registry + `liveness.js` entries, `metrics.md` and `test/evo/scene-guilds.test.js`                            | [judgement]  | -                |
| T2  | Not done; folded into the shared 128-seed baseline of [detector-baseline.md](detector-baseline.md) T7, which serves this plan (`E-PG-1`), and read at T8/T9 there. Run `E-PG-1` (16 floor-on seeds x 200,000 ticks, and once with `specMutationRate` 0) on post-`honest-budgets` defaults, record baseline under `evals/decisions/E-PG-1/` and in [sim-notes.md](sim-notes.md) | [mechanical] | T1               |
| T1b | (built) Add `eval.prey_selectivity.<spec>` to `js/evo/scene-guilds.js` (each guild's share of eaten deaths over its mean share of living prey; `E-PG-1` predicts it and #445 did not build it), registry, arithmetic/source tests and `metrics.md`; liveness awaits the detector-baseline top-up because E188 predates these metrics                                           | [judgement]  | T1               |
| T2a | Add age/condition/habitat vulnerability encounter fixtures and baseline tables, with tests distinguishing unavailable prey from failed pursuit; record in sim-notes                                                                                                                                                                                                            | [judgement]  | T2               |
| T2b | Specify and test the five-role interaction matrix with age/habitat/kin denominators; connect descendant outcomes to honest-budgets recruitment diagnostics                                                                                                                                                                                                                     | [judgement]  | T2a              |
| T3  | Not done. Conformance review of Phase 1 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                                                                                                                                                  | [judgement]  | T1, T2, T2a, T2b |

### Phase 2 - `defender` as active guard

| #   | Task                                                                                                                                                                                                           | Nature       | Depends on |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T4  | Built (#448), neutral default. Add `defenderRepelEnergy`, `defenderRepelCost`, `defenderRepelImpulse` in `feeding.js`/`physics.js` and `test/sim/defender-repel.test.js`                                       | [judgement]  | T3         |
| T4a | Stage `repel-hunter` as a drill with its oracle and input-only reference and run `probe:learn` on it (`E-PG-0`); a lesson not reached goes to the instinct prior before the screen                             | [judgement]  | T4         |
| T5  | Grid and prediction built (#448); the `E-PG-2` screen run is not done. Write `evals/screens/prey-guilds-defender.grid.json` (the six arms of Test design) and E-record prediction; run 16-seed screen `E-PG-2` | [judgement]  | T4, T4a    |
| T6  | Not done. Run finalist vs. control on 64 matched seeds with `--keep-rule` (`E-PG-3`)                                                                                                                           | [mechanical] | T5         |
| T6a | Run costly-defence and beneficiary controls; pin repeat-contact costs and multi-body collision cases before adopting repel; record kin benefit and defender cost                                               | [judgement]  | T6         |
| T7  | Not done. Switch: adopt winning `defender` defaults, open/update season, re-pin goldens and `browser:hash` (or park on `WORSE`)                                                                                | [mechanical] | T6, T6a    |
| T8  | Not done. Conformance review of Phase 2 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                  | [judgement]  | T7         |

### Phase 3 - `scout` as vigilance and escape network

| #    | Task                                                                                                                                                                                                                                                                                                                        | Nature       | Depends on |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T9   | Built (#450), neutral default (`sprintBoost` was already a per-spec key read by `sprintBySpec` in `js/sim/world.js`). Add `scoutCallRadiusMultiplier`, `scoutAlarmCostMultiplier` and `scout.sprintBoost` wiring in `calls.js`/`config-defaults.js` and `test/sim/scout-calls.test.js`                                      | [judgement]  | T8         |
| T9a  | Stage `warn-kin` as a drill with its oracle and reference and run `probe:learn` on it; confirm some brain calls at all on the defaults before the screen, else park Phase 3 behind [alarm-calls.md](alarm-calls.md)                                                                                                         | [judgement]  | T9         |
| T10  | Grid and prediction built (#450; it varies `scout.sprintBoost` 1 to 1.35 with the two multipliers); the `E-PG-4` screen run and `E-PG-5` keep rule are not done. Write `evals/screens/prey-guilds-scout.grid.json` and prediction; run 16-seed screen `E-PG-4` (the six arms of Test design) and 64-seed keep rule `E-PG-5` | [judgement]  | T9, T9a    |
| T10a | Reconcile alarm protection owners and run caller/listener/cheater controls with matched costs; report descendant benefits and false-flight costs                                                                                                                                                                            | [judgement]  | T10        |
| T11  | Switch: adopt winning `scout` defaults, open/update season, re-pin goldens and `browser:hash` (or park on `WORSE`)                                                                                                                                                                                                          | [mechanical] | T10, T10a  |
| T12  | Conformance review of Phase 3 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                                                                                                                                         | [judgement]  | T11        |

### Phase 4 - `reproducer` r-strategy vs. `forager` efficiency

| #    | Task                                                                                                                                                                                                           | Nature       | Depends on |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- |
| T13  | Add `maturityMultiplier` and `pregnancyMultiplier` as fields of `specialisations.<name>` (`config-spec-rules.js`), read in `reproduction.js`/`mate-eligibility.js` and `test/sim/reproducer-lifecycle.test.js` | [judgement]  | T12        |
| T14  | Write `evals/screens/prey-guilds-r-k.grid.json` and prediction; run 16-seed screen `E-PG-6` (the six arms of Test design) and 64-seed keep rule `E-PG-7`                                                       | [judgement]  | T13        |
| T14a | Test finite-patch reproductive efficiency, shared maturity thresholds and seasonal trade-offs; distinguish resident recovery from immigration and role flips                                                   | [judgement]  | T14        |
| T15  | Switch: adopt winning `reproducer` and `forager` defaults, open/update season, re-pin goldens and `browser:hash` (or park on `WORSE`)                                                                          | [mechanical] | T14, T14a  |
| T16  | Conformance review of Phase 4 by a fresh agent, in parallel with `scripts/check.sh`                                                                                                                            | [judgement]  | T15        |

### Phase 5 - Combined guild balance and verification

| #    | Task                                                                                                                                                                                                                                 | Nature       | Depends on |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------- |
| T17  | Run `E-PG-8`: 64 matched seeds comparing the full guild world against the pre-Phase-2 baseline                                                                                                                                       | [mechanical] | T16        |
| T17a | Run no-rescue seasonal coexistence and defence ablations using honest-budgets Phase 6 cohort diagnostics; report descendant replacement and refuge feeding excursions with clips                                                     | [judgement]  | T17        |
| T17b | Run rare-role and leave-one-role-out mixture experiments, no-rescue and mutation/migration attribution; report habitat-specific descendant replacement and held-out confirmation                                                     | [judgement]  | T17a, T2b  |
| T18  | Record the guild balance verdict, the per-guild survival, fitness and selectivity table, and each adopted lever as a trade-off (gain and cost in the same units) for [body-genes.md](body-genes.md), in [sim-notes.md](sim-notes.md) | [judgement]  | T17a, T17b |
| T19  | Watch an arena clip of the final season verifying scouts warning, defenders repelling, and reproducers recovering                                                                                                                    | [judgement]  | T18        |
| T20  | Conformance review of Phase 5 by a fresh agent, in parallel with `scripts/check.sh`; move Status line to `Implemented`                                                                                                               | [judgement]  | T19        |

## Verification

1. `scripts/check.sh --fix --docs` for this doc; `scripts/check.sh` green on every chunk PR.
2. Phase 1: `npm run eval -- --seeds 16 --ticks 400000` prints all four `eval.guild_*` metrics.
3. Phases 2–4: each phase's 16-seed screen and 64-seed `eval:compare --keep-rule` report are committed under `evals/decisions/E-PG-*/`, and `npm run browser:hash` matches the re-pinned goldens.
4. Phase 5: `eval.spec_effective` rises over baseline, `eval.spec_dominance < 0.45`, predators remain alive across the run, and the arena clip confirms the scenes by eye.
