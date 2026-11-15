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

## Screen result (16 seeds, 400000 ticks)

**Verdict: the prediction holds on the screen.** Every impact arm cuts collision deaths by more than ten times, and
every arm reads no harm on the 16-seed keep rule (hunters alive 15/16 against 13/16):

| Arm       | collision death share p50 | hunter collision death share p50 | hunter catches / 1k p50 | population_mean p50 | lineages_alive p50 | spec <= 70% | life p50 |
| --------- | ------------------------- | -------------------------------- | ----------------------- | ------------------- | ------------------ | ----------- | -------- |
| `control` | 0.225                     | 0.253                            | 0.366                   | 310                 | 2.38               | 13/16       | 459      |
| `d2-x8`   | 0.016                     | 0.019                            | 0.310                   | 349                 | 2.54               | 9/16        | 1307     |
| `d4-x12`  | 0.008                     | 0.012                            | 0.328                   | 326                 | 2.59               | 10/16       | 1045     |
| `d4-x25`  | 0.018                     | 0.029                            | 0.309                   | 338                 | 2.58               | 12/16       | 1713     |

- The flat contact damage of 50 per tick was killing a fifth of all blobs; most were brushing or resting against a
  surface. Priced by the speed into the surface, collisions kill under one in fifty.
- `eval.refuge_episode_entry` does not move on any arm (about 0).
- `d4-x25` is the finalist: a full-speed hit still costs 100, twice today's 50, so a sprint into a rock still kills
  while a brush is free; it has the most seeds under the specialisation cap of the impact arms and the longest median
  life. `d4-x12` reads the lowest collision share, by 0.01.

## Keep rule (64 seeds, 400000 ticks, on the Phase 2 defaults)

`npm run eval:compare -- evals/decisions/E176/defaults-s10b.report.json evals/decisions/E176/d4-x25.report.json --keep-rule
--allow-config-diff impactDamage,impactDeadband,obstacleDamage,wallDamage`

**Verdict: `WORSE` on the hunter catches guard; the switch (T20) is not made and Phase 3 is parked.**

| Guard                        | Result                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- |
| alive                        | no harm: 7 seeds harmed, 16 recovered, exact p 0.093 (55/64 against 46) |
| held                         | better: 3 harmed, 22 recovered, exact p 0.00016                         |
| under80                      | no harm: 0 harmed, 3 recovered                                          |
| `eval.hunter_catches_per_1k` | worse: 1.347 to 1.199, interval [-0.234, -0.061]                        |

- The mechanism does what it was built for: `eval.collision_death_share` falls from 0.218 to 0.013 (better), and the
  adoption bar is met (hunters alive 55/64, no seed under 80 against 3).
- Also better: `eval.lineages_alive` (2.30 to 2.50), `eval.median_lifespan`, `eval.fed_median_lifespan`,
  `eval.hunter_juvenile_death_share` (0.76 to 0.72), `eval.qd_score`. The population mean rises from 255 to 324.
- Also worse: `eval.births_per_1k` (-14%), `eval.food_energy_per_1k` (-13%), `eval.cold_stress_share` (0.13 to 0.19),
  `eval.strike_miss_energy_ratio`, `eval.pursuit_kill_share`.
- `eval.hunter_catches_per_1k` is a speed (catches per 1000 hunter ticks): longer-lived hunters among more prey catch
  less often per tick while more of them stay alive. Whether that loss is real harm or the denominator growing is the
  open question for the next pass; an arm with a lower `impactDamage` (`d4-x12`) is the other candidate.
