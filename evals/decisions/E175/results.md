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

**Next.** `body-k25r` (`evals/decisions/E175/body-k25r.config.json`) on seeds 1 to 64 against the 64-seed default
run (`evals/decisions/E174/y1-b2.report.json`, the same defaults; Phase 2's code leaves every hash unchanged with its
switch off), `--keep-rule`.
