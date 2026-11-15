# E176 - impacts, not contact (honest-budgets Phase 3, T15 to T19)

**Prediction (recorded before the run).** With `obstacleDamage` and `wallDamage` 0 and `impactDamage` on, a wall or
rock costs a body only by how hard it hits (`impactDamage` x (speed into the surface - `impactDeadband`)), so a blob
that brushes, slides along or rests against a surface pays nothing, and collision deaths come only from hard hits. On
the 16-seed screen (`evals/screens/honest-impact.grid.json`, seeds 1 to 16, 400000 ticks, floor on, policy live), the
finalist reads `eval.collision_death_share` `better` (lower) than `control`, and the 64-seed keep rule
(`eval:compare --keep-rule`) reads no guard `WORSE`. Falsified when `eval.collision_death_share` stays above 0.15 on
every arm.

**Arms.** `control` is season 10 (`obstacleDamage` and `wallDamage` 50 on every tick a body strikes a surface moving
into it, whatever its speed). Each impact arm sets both contact damages to 0. `d2-x8` frees impacts up to speed 2 and
charges 8 per unit above it; `d4-x12` frees up to 4 and charges 12; `d4-x25` frees up to 4 and charges 25. A
full-speed hit (speed 8) costs 48, 48 and 100.

**Run:** `npm run screen -- --grid evals/screens/honest-impact.grid.json` on branch `season/next` (T15 and T16), then
the finalist and the control on seeds 1 to 64 with `--keep-rule` (T19).
