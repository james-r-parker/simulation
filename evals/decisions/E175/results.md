# E175 - the kill is the body (honest-budgets Phase 2, T8 to T12)

**Prediction (recorded before the run).** With `carcassBody` on and `predatorKillEnergy` 0, a kill pays only the energy
the victim held and the carcass is what the killer left, so hunters stop earning from kills that had no body behind
them. On the 16-seed screen (`evals/screens/honest-kill.grid.json`, seeds 1 to 16, 400000 ticks, floor on, policy
live), the finalist reads `eval.hunter_zero_kill_carcass_share` lower than `control`, and the 64-seed keep rule
(`eval:compare --keep-rule`) reads no guard `WORSE`, hunter catches (`eval.hunter_catches_per_1k`) included.
Falsified when every arm reads hunter catches `WORSE`.

**Arms.** `control` is season 10 (`killShare` 0, a 600-energy kill payment, the lifetime-intake carcass of 300 ticks).
`body` prices the carcass by the body (`carcassBody`, `carcassFadeTicks` 1500) with a kill at an empty store
(`killShare` 0) and `killGorgeCap` 2000. `body-k25` kills at a quarter of the maximum energy, so the remainder is the
carcass. `body-k25r` also cuts the predator's `passiveLossMultiplier` from 0.3 to 0.2, to pay for the smaller income.
`body-k25g` raises the gorge to 4000 and the fade to 2500 ticks.

**Run:** `npm run screen -- --grid evals/screens/honest-kill.grid.json` on branch `season/next` (T8 and T9), then the
finalist and the control on seeds 1 to 64 with `--keep-rule` (T12).

## Screen result (16 seeds, 400000 ticks)

**Verdict: the prediction holds on the screen.** Every body arm moves hunter income off carcasses and onto kills:

| Arm         | carcass income share p50 | hunter catches / 1k p50 | zero-kill carcass share p50 | hunters alive | population_mean p50 | lineages_alive p50 |
| ----------- | ------------------------ | ----------------------- | --------------------------- | ------------- | ------------------- | ------------------ |
| `control`   | 0.494                    | 0.384                   | 0.118                       | 13/16         | 297                 | 2.42               |
| `body`      | 0.002                    | 0.948                   | 0.112                       | 8/16          | 323                 | 2.48               |
| `body-k25`  | 0.005                    | 1.375                   | 0.051                       | 9/16          | 350                 | 2.35               |
| `body-k25r` | 0.005                    | 1.338                   | 0.038                       | 11/16         | 311                 | 2.07               |
| `body-k25g` | 0.008                    | 1.385                   | 0.052                       | 10/16         | 330                 | 2.44               |

- With no minted 600, a hunter must kill to eat: catches rise 2.5 to 3.6 times and the carcass share of hunter income falls
  to about 0. Every arm passes the screen and reads no harm on the keep rule at 16 seeds.
- Fewer hunters stay alive (8 to 11 of 16 against 13); the median predator headcount falls from 10 to 1.
- `body-k25r` is the finalist: the lowest zero-kill carcass share and the most hunters alive of the body arms (the
  predators' passive loss is 0.2).

## Keep rule (64 seeds, 400000 ticks)

`npm run eval:compare -- evals/decisions/E174/y1-b2.report.json evals/decisions/E175/body-k25r.report.json --keep-rule`
(`--allow-config-diff` for the arm's keys and for `patchStockEnergy`, `foodPatchDepletion` and the seasons'
`foodScarcity`, which the Phase 1 switch deleted and which the control ran with at their stock-rule values; `impactDamage`
0 is off).

**Verdict: no harm; the switch goes ahead (T13).**

| Guard                        | Result                                               |
| ---------------------------- | ---------------------------------------------------- |
| alive                        | no harm: 12 seeds harmed, 5 recovered, exact p 0.143 |
| held                         | no harm: 11 harmed, 5 recovered, exact p 0.21        |
| under80                      | no harm: 3 harmed, 1 recovered, exact p 0.625        |
| `eval.hunter_catches_per_1k` | better: 0.389 to 1.347, interval [0.89, 1.03]        |

| Target                                | Control | body-k25r | Interval         |
| ------------------------------------- | ------- | --------- | ---------------- |
| `eval.hunter_zero_kill_carcass_share` | 0.108   | 0.084     | [-0.047, 0.012]  |
| `eval.hunter_income_share.carcass`    | 0.479   | 0.008     | [-0.478, -0.463] |
| `eval.hunter_income_share.kill`       | 0.092   | 0.254     | [0.151, 0.175]   |
| `eval.hunter_first_kill_rmst`         | 2591    | 1397      | better           |

- Hunters now live on the bodies they catch: the carcass share of their income falls from 48% to under 1%, and the
  zero-kill carcass share falls 22% (the interval includes 0).
- Hunters stay alive on 46 of 64 seeds against 53; the guard cannot call it harm, and the adoption bar (0.75 of seeds)
  is not met. Juvenile hunter deaths rise (`eval.hunter_juvenile_death_share` 0.52 to 0.76, worse), and the hunter
  births from a specialisation flip double. The next balance pass watches hunter recruitment.
- Also worse: `eval.food_energy_per_1k` (442 to 361), `eval.escape_share` (0.61 to 0.44), `eval.behaviour_coverage`,
  `eval.coverage`, `eval.cold_stress_share`. Better: `eval.collision_death_share` (0.242 to 0.218),
  `eval.hunter_carrion_idle_share`.
