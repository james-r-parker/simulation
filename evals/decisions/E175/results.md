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
