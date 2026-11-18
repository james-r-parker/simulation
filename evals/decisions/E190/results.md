# E190 - how hunters die while juvenile (honest-budgets Phase 6, diagnosis after E189)

**Question.** `eval.hunter_juvenile_death_share` reads 0.86 on the defaults (`killGorgeShare` 0.4) and E189 found no lever
that lowers it below 0.78. Why do most predator juveniles die, and which lever does the mechanism point to?

**Detector check (step 0).** The metric is **not** the share of newborn hunters that die before maturity. `scene-hunter-age.js`
counts, over every `HunterLedger` record of the run (no burn-in cut), the share of hunter **deaths** whose age is below
`juvenileTicks` (3000, five times `maturityTicks` 600). It is a lifespan statistic: 0.86 means that 86% of the hunters that
die do so under 3000 ticks old. Read that way, the E189 levers (a better first hundred ticks) could not be expected to move it.

**Method (diagnosis only, no sim behaviour change).** Replays with `--level debug --policy map-elites-v6` (the live policy),
100000 ticks, seeds 1 to 6, on the defaults (`control`) and on the `cub-plant` arm (`juvenilePlantShare` 0.25), read with
`node scripts/juvenile-deaths.mjs <logs>` (new; `js/evo/juvenile-deaths.js`; hunters born from tick 10000, a life alive and
under 3000 ticks old at the end is censored). The log holds no energy at birth, no positions and no strike counts, so a
scratch probe (not committed) replayed seeds 1 to 6 for 80000 ticks through `runReplay`'s `stepFn` hook and watched every
hunter slot each tick: birth energy, ticks holding `BITE`, ticks holding it with no body in the jaws, recoil ticks, and the
nearest kin, non-hunter and carcass at death. One counterfactual replay set (`strikeMissCost` 0, seeds 1 to 6, 100000 ticks)
tests the mechanism named below; it is one run per seed, a lead and not a verdict. Control hunters live on seeds 3, 4 and 5
(share of deaths 0.80, 0.82, 0.91); on seeds 1 and 2 only 10 hunters are born after burn-in and all die, and on seed 6 none.

## Table (hunters born after burn-in, seeds 1 to 6, 100000 ticks)

| Reading                                           | `control`     | `cub-plant` | `strikeMissCost` 0 (counterfactual) |
| ------------------------------------------------- | ------------- | ----------- | ----------------------------------- |
| hunter lives with a known outcome                 | 466           | 1430        | 1103                                |
| juvenile deaths (age under 3000)                  | 395           | 1050        | 664                                 |
| share of deaths that are juvenile (the metric)    | 0.85          | 0.74        | 0.63                                |
| share of lives that reach 3000 ticks              | 0.15          | 0.27        | 0.40                                |
| median age at a juvenile death                    | 830           | 961         | 1144                                |
| median age at an adult death                      | 3959          | 5189        | 5281                                |
| juvenile deaths that starved                      | 0.65          | 0.51        | 0.44                                |
| juvenile deaths that never made a kill            | 0.53          | 0.53        | 0.61                                |
| juvenile deaths by cause: starved/collision/eaten | 255/75/61     | 533/146/360 | 294/196/162                         |
| birth source `split-hunter-parent`, share dying   | 0.84 (of 421) | 0.73        | 0.63                                |
| birth source `spec-flip`, share dying (n)         | 0.90 (42)     | 0.92 (61)   | 0.67 (33)                           |

Probe readings (seeds 1 to 6, 80000 ticks; juvenile = dies under 3000 ticks old):

| Reading                                             | `control`  | `cub-plant` |
| --------------------------------------------------- | ---------- | ----------- |
| median energy at birth, juvenile deaths             | 921        | 894         |
| ticks holding `BITE`, juvenile deaths               | 0.70       | 0.62        |
| ticks holding `BITE` with no body in jaws, juvenile | 0.61       | 0.56        |
| ticks holding `BITE`, adult deaths                  | 0.62       | 0.46        |
| bite cost of a juvenile death: strike misses        | 0.48       | 0.55        |
| bite cost of a juvenile death: recoil on kin / big  | 0.42       | 0.35        |
| bite cost of a juvenile death: landed-bite kicks    | 0.10       | 0.10        |
| juvenile deaths with zero income (n of all)         | 127 of 284 | 359 of 903  |
| zero-income: median age, median birth energy        | 391, 724   | 407, 653    |
| zero-income: median bite cost                       | 412        | 334         |
| zero-income: nearest non-hunter at death            | 844        | 605         |
| zero-income: nearest carcass at death               | 3691       | 3624        |

## Diagnosis

1. **The 0.86 is a lifespan, not a newborn crash.** Only 15% of control hunters (27% on `cub-plant`) reach 3000 ticks. The
   deaths fall evenly across the window (control, ages 0-200 / 200-400 / 400-800 / 800-1600 / 1600-3000: 63, 52, 76, 110,
   94 on seeds 1 to 6), so a first-hundred-ticks lever (plant food for the cub, a bigger split reserve, a freer territory,
   a lower size barrier) acts on a minority of the deaths. An early first kill barely helps: of the hunters alive at 400
   ticks, 25% of those that had killed and 15% of those that had not reach 3000. Hunters that do survive die adult at
   about 4000 to 5000 ticks: the whole life is short.
2. **The mechanism is a bite-hold energy drain.** Juvenile hunters hold `BITE` on 70% of their ticks (adults 62%, `cub-plant`
   juveniles 62%) and on 61% of all their ticks there is no body in their jaws, so each of those ticks pays
   `strikeMissCost` (1 energy). Misses are 48% to 55% of a juvenile's bite cost and recoil (20 energy a tick at kin or a
   too-large target; kin is within 120 units at 43% to 54% of the zero-income deaths) is another 35% to 42%; landed-bite
   kicks are 10%. For the juveniles that die with no income at all (45% of control juvenile deaths, 40% on `cub-plant`),
   the bite cost is 412 of a median 724 birth energy: they starve at 391 ticks, 844 units from the nearest non-hunter and
   3691 from the nearest carcass. A hunter is born with about 900 energy (not 270) and the burn that ends it is mostly
   energy spent biting at nothing.
3. **Counterfactual (a lead, one run per seed).** `strikeMissCost` 0 moves the metric from 0.85 to 0.63, the share of
   hunters that reach 3000 ticks from 0.15 to 0.40 and the lives with a known outcome from 466 to 1103; the share of deaths
   that never killed rises (0.53 to 0.61), so the extra life is not better hunting yet, and recoil becomes 64% of the
   spend of a juvenile death, the next tax. `cub-plant` alone moves the metric 0.85 to 0.74 by feeding the cub (69% of its
   juvenile deaths ate something against 47%) but leaves the bite-hold cost untouched.
4. **Spec-flip children** are about 10% of hunter births and die at 0.90 (median age 474 on `control`, 92% with a parent
   alive), the weakest source; they hold `BITE` on 78% to 90% of ticks. They are a small share of deaths, so a fix for them alone
   cannot lower the metric.

**What this does not show.** Nothing here proves a brain "never bites" or "always bites": it bites often and mostly at
nothing, and that pays no matter how it arose. The counterfactual is not an eval: no 16 seeds, no keep rule, no
`eval:compare`. The `bit` column of the script is 0.99 everywhere because a recoil counts as a bite attempt; read `kill`
and `fed` instead. The probe's cost split (misses by ticks held, recoil by ticks charged) is a ticks-times-price estimate,
not a ledger entry, and the kick share is the remainder.

**Principle check.** The diagnosis adds no input and no reward; the next lever (below) changes a config price in the world a
run happens in, keeps the hunt chain fail-closed (a miss still costs, only less), and deletes nothing (the keep rule:
`strikeMissCost` is a realistic cost of a failed strike and stays a key).

**Nature.** A stalking predator creeps in and strikes at close range, and a failed strike costs it real energy; it does not
keep its jaws working against empty air on most ticks. The sim's bite is a held output, so a hunter that keeps it armed
pays the strike price on every tick it holds it, and a cub pays the same price as an adult from a smaller store with
the nearest prey farther away.

**Outcome to task.** T40 (`docs/designs/honest-budgets.md` Phase 6): screen `strikeMissCost` and `recoilEnergy` as
lower-price arms on the 0.4 defaults. Prediction, falsifier and bars are written in the T40 row before any run.
