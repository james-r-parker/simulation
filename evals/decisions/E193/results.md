# E193 - a silent bite at birth (honest-budgets Phase 6, T41)

**Question.** E192 found blind biting never leaves because the birth reflex (`applyInstinct`, `applyBirthReflex`) silences the
`ALARM`, `HUNT` and `SMOKE` biases but writes nothing to the `BITE` bias, so 75% of hunters are born with a bias of exactly 0 and
hold the jaws open on 72% of ticks, and split clones copy it. T41 closes it: new numeric key `hunterBiteBias` in [-4, 0]
(default 0, off), a ceiling on the `BITE` output bias of every `canHunt` founder and child of `hunterBiteBias` x `instinctWeight`
(`applyHunterReflex`, reached from `applyInstinct` and `applyBirthReflex`). A prey in view still releases the jaws through the
+2 x `instinctWeight` prey-to-`BITE` skip weight. Draws no random numbers; at 0 the rows are byte-identical.

**Scene and rule.** Scene: A real chase, the abort (a hunter that is not closing on prey does not burn energy striking at
nothing). Selection rule 6 (hunting wins by the chain, and the chain fails closed: the strike is released by a target, not open by
default). Also serves Parent spends and Boom and bust through the hunters that survive to feed.

**Natural analogue.** An innate releasing mechanism: a toad snaps only at a small moving shape, a frog's strike is inhibited
until the tectum signals prey, a cat's pounce follows a stalk. The wiring is closed until a target releases it. The sim opened
the jaws by default and left selection to close them (E192).

**Arms** (`evals/screens/honest-bite-bias.grid.json`, 16 seeds, 400000 ticks, policy live, defaults including
`killGorgeShare` 0.4, no `specFlipNoHunt`): `control` (`hunterBiteBias` 0: today's worlds), `bias-0.5`, `bias-1`, `bias-2`
(`hunterBiteBias` -0.5, -1, -2, so the founder's `BITE` bias starts at -0.5, -1 or -2 against the +2 prey skip weight: prey
strength above 0.25, 0.5 or 1 opens the jaws at birth).

**Prediction (written before any run).** At least one arm lowers `eval.strike_miss_energy_ratio` and `eval.bite_idle` (strikes at
air fall), lowers `eval.hunter_juvenile_death_share` below 0.70 (control reads about 0.86), keeps hunters alive at the end on at
least 11 of 16 seeds (control 11), keeps `eval.hunter_catches_per_1k` not `WORSE` against `control`, and `--keep-rule` against
`control` reads no guard `WORSE`. The cost is a slower first strike where prey is seen only faintly (the unseen share below 0.15).
Expected order of effect: -2 closes hardest and risks never opening for weak prey signals; -0.5 changes least. **Falsified when
every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE`** (a silenced bite that never opens), the Stop-when for this screen.

**Run.** `scripts/run-detached.sh T41-screen --frozen -- npm run screen -- --grid evals/screens/honest-bite-bias.grid.json` on
branch `feat/honest-budgets-t41`. A finalist then runs 64 matched seeds (65 to 128) with `--keep-rule` (T42), then T36a on it.
A new key moves `rulesHash` (it opens season 11 in `library/seasons.json`, since season 10 shipped as 10.0.0).

## Screen result (T41, 16 seeds, 400000 ticks, on main e96d4eec)

`screen-table.md` is the screen's `table.md`, the verdicts are `screen-verdicts.json`, the reports stay in
`evals/screens/results/honest-bite-bias/`. The table below is written by script from the reports and the verdicts (means over
seeds 1 to 16; `eval.bite_idle` is the share of hunter ticks holding `BITE` with nothing to bite, the strike-at-air reading):

| Metric                                         | `control` | `bias-0.5`                                                         | `bias-1`                                   | `bias-2`                                                          |
| ---------------------------------------------- | --------- | ------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------- |
| `eval.bite_idle` (strikes at air)              | 0.672     | 0.197                                                              | 0.115                                      | 0.033                                                             |
| `eval.strike_miss_energy_ratio`                | 0.393     | 0.264                                                              | 0.196                                      | 0.058                                                             |
| `eval.hunter_juvenile_death_share`             | 0.864     | 0.640                                                              | 0.553                                      | 0.577                                                             |
| `eval.hunter_catches_per_1k`                   | 1.410     | 0.634                                                              | 0.502                                      | 0.452                                                             |
| `eval.recruit_matured_share`                   | 0.690     | 0.808                                                              | 0.852                                      | 0.848                                                             |
| hunters alive at the end (seeds of 16)         | 11        | 12                                                                 | 10                                         | 8                                                                 |
| pop > min (seeds of 16)                        | 14        | 9 (5 lost, 0 regained, p 0.0625)                                   | 8 (7 lost, 1 regained, p 0.0703)           | 11 (4 lost, 1 regained, p 0.375)                                  |
| pop mean                                       | 200       | 132                                                                | 109                                        | 160                                                               |
| keep rule vs `control` (smallest loss visible) | -         | no harm; alive 0.625 (10 seeds), under80 0.375 (6), held 0.375 (6) | no harm; under80 0.375 (6), held 0.375 (6) | no harm; alive 0.500 (8 seeds), under80 0.375 (6), held 0.375 (6) |

All four arms pass the screen (catches above 0 on 16 of 16 seeds). `eval.hunter_catches_per_1k` has no 16-seed verdict (the keep
rule's catches guard reads "needs 64 seeds"), so it is read here from its means only.

## Verdict against the prediction

**The mechanism works, and it is the opposite of a rescue in one respect and worrying in another.**

- **Strikes at air fall as predicted, and in order:** `eval.bite_idle` 0.672 to 0.197, 0.115 and 0.033; `eval.strike_miss_energy_ratio`
  0.393 to 0.264, 0.196 and 0.058. A closed bias at birth closes the jaws.
- **The juvenile death share falls below 0.70 on every arm** (0.640, 0.553, 0.577 against 0.864) and `eval.recruit_matured_share`
  rises (0.690 to 0.81 to 0.85): more hunters live to maturity. Only `bias-1` and `bias-2` get near the Done-when row; none meets it.
- **Hunters alive at the end (at least 11 of 16): met only by `bias-0.5`** (12), which is the only arm at or above the control (11).
  `bias-1` (10) and `bias-2` (8) fall short, and the keep rule's `alive` guard reads no harm only because it sees a loss of 8 to 10
  seeds at best.
- **Catches fall by 55 to 68%** (1.410 to 0.634, 0.502 and 0.452). The prediction wrote "not `WORSE`", and no 16-seed verdict
  exists for that metric, so the stated falsifier (every arm reads catches or `held` `WORSE`) is **not met**: `held` reads no harm on
  every arm. A halving of the catch rate is still a large point estimate, and a bite that opens too rarely is what the falsifier
  was written to catch. The 64-seed keep rule is the arbiter, not these means (worse point estimates alone are not harm).
- **A possible harm signal, not proof:** the seeds with the population above `minAgents` fall from 14 of 16 to 9, 8 and 11 (the
  paired tests: 5 lost and 0 regained, p 0.063 on `bias-0.5`; 7 lost and 1 regained, p 0.070 on `bias-1`; 4 and 1, p 0.375 on
  `bias-2`), and the mean population falls from 200 to 132, 109 and 160. This is the pattern of fewer catches feeding fewer
  hunters and, through them, a lower population, and it is not a keep-rule guard. It does not fall monotonically with the bias,
  and no p is below 0.05 at 16 seeds; it is a reason to read the 64-seed run's `popAboveMin` and `held` numbers first.

**Finalist: `bias-0.5` (`hunterBiteBias` -0.5), to the 64-seed keep rule (T42).** It is the only arm that meets the prediction on
hunters alive (12 of 16, at or above the control), the juvenile death share (0.640) and strikes at air (0.197), with the mildest
closing and so the smallest cost to the chase. `bias-1` has the lowest juvenile death share (0.553) but fewer hunters alive and
a lower population; `bias-2` is the most silent and the worst on hunters alive. If the 64-seed run reads catches or `popAboveMin`
`WORSE` on `bias-0.5`, the lever is falsified as a whole (the milder arm is the safest).
