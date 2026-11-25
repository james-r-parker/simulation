### 2026-11-11 - Calibration stop (carrying-capacity T11, E152)

The plan stops at Phase 2. `evals/decisions/E152/screen16/`: 10 arms (the defaults, four `foodRegrowPerArea` values at 0.5, 0.75, 1.0
and 1.5 times the eaten rate 0.016, the same four on a flat season, and a flat season on default food), seeds 1 to 16,
floor on, policy live, 200000 ticks. `node scripts/capacity-rank.mjs` ranks them (no verdict) and
`node scripts/capacity-traces.mjs` reads the traces after `BURN_IN_TICKS` and runs `keepRule`'s seed guards of each arm against the defaults.

**Ranking** (held and alive of 16; the detectors are unverified, so the elasticities are means):

Made by `node scripts/capacity-rank.mjs evals/decisions/E152/screen16`; sorted by held, then alive, then lowest cap_share.

| Rank | Arm             | held | alive | cap_share | starve slope | intake slope | food standing | pop mean |
| ---- | --------------- | ---- | ----- | --------- | ------------ | ------------ | ------------- | -------- |
| 1    | defaults        | 6/16 | 13/16 | 0.174     | -0.158       | -0.055       | 0.934         | 233.923  |
| 2    | flat-defaults   | 4/16 | 12/16 | 0.129     | -0.089       | 0.031        | 0.939         | 218.325  |
| 3    | flat-food-1.0x  | 0/16 | 12/16 | 0.000     | 0.017        | -0.200       | 0.816         | 110.465  |
| 4    | food-1.5x       | 0/16 | 12/16 | 0.036     | 0.222        | -0.179       | 0.778         | 183.750  |
| 5    | flat-food-0.75x | 0/16 | 11/16 | 0.000     | 0.028        | -0.161       | 0.840         | 67.298   |
| 6    | flat-food-1.5x  | 0/16 | 10/16 | 0.038     | 0.059        | -0.097       | 0.820         | 165.935  |
| 7    | food-0.75x      | 0/16 | 8/16  | 0.000     | 0.031        | -0.170       | 0.789         | 76.301   |
| 8    | food-1.0x       | 0/16 | 8/16  | 0.000     | 0.033        | -0.094       | 0.816         | 104.651  |
| 9    | flat-food-0.5x  | 0/16 | 5/16  | 0.000     | 0.098        | -0.149       | 0.730         | 46.693   |
| 10   | food-0.5x       | 0/16 | 5/16  | 0.000     | 0.112        | -0.287       | 0.705         | 48.329   |

**Traces and paired tests** (medians over seeds; the last column is the exact test on the seeds that moved, arm after, defaults before):

| arm             | median lowest pop | seeds under 40 | median CV | hunters alive at end | median pop | checkpoints under 50 prey | food energy per 1k agent-ticks | vs defaults, seeds moved to worse / better, exact p    |
| --------------- | ----------------- | -------------- | --------- | -------------------- | ---------- | ------------------------- | ------------------------------ | ------------------------------------------------------ |
| defaults        | 16.5              | 9/16           | 0.56      | 13/16                | 251        | 0.223                     | 532                            | -                                                      |
| flat-defaults   | 26.5              | 8/16           | 0.60      | 12/16                | 207        | 0.210                     | 551                            | alive no-harm (3/2, p 1); held no-harm (3/1, p 0.63)   |
| flat-food-0.5x  | 8                 | 16/16          | 0.70      | 5/16                 | 33         | 0.685                     | 415                            | alive worse (9/1, p 0.021); held worse (6/0, p 0.031)  |
| flat-food-0.75x | 8                 | 16/16          | 0.78      | 11/16                | 46         | 0.556                     | 452                            | alive no-harm (4/2, p 0.69); held worse (6/0, p 0.031) |
| flat-food-1.0x  | 8                 | 14/16          | 0.69      | 12/16                | 84         | 0.375                     | 448                            | alive no-harm (3/2, p 1); held worse (6/0, p 0.031)    |
| flat-food-1.5x  | 8.5               | 11/16          | 0.71      | 10/16                | 142        | 0.266                     | 484                            | alive no-harm (5/2, p 0.45); held worse (6/0, p 0.031) |
| food-0.5x       | 8                 | 16/16          | 0.59      | 5/16                 | 37         | 0.666                     | 403                            | alive worse (9/1, p 0.021); held worse (6/0, p 0.031)  |
| food-0.75x      | 8                 | 16/16          | 0.60      | 8/16                 | 60         | 0.454                     | 452                            | alive no-harm (6/1, p 0.13); held worse (6/0, p 0.031) |
| food-1.0x       | 8                 | 13/16          | 0.69      | 8/16                 | 79         | 0.388                     | 445                            | alive no-harm (6/1, p 0.13); held worse (6/0, p 0.031) |
| food-1.5x       | 20                | 9/16           | 0.51      | 12/16                | 174        | 0.183                     | 494                            | alive no-harm (4/3, p 1); held worse (6/0, p 0.031)    |

**Reading.** Less food makes food a brake: `eval.cap_share` falls to 0 to 0.04 and the starvation elasticity turns positive
(0.02 to 0.22 against -0.16). But the world does not settle. Every food arm crashes as deep as the defaults, in more seeds
and with larger swings, at a smaller size: seeds under 40 agents after burn-in are 9 of 16 on the defaults and 13 to 16 of 16
on the 0.5x to 1.0x arms; `held` is 0 of 16 on all eight food arms against 6 of 16 (exact p 0.031, six seeds lost and none
gained); `alive` reads worse on the 0.5x arms (9 lost, 1 gained, p 0.021) and no worse on the rest. Flattening the season
does not help (flat-defaults holds 4 of 16, no-harm). So the crash is not the boom meeting the cap: something fails at low
density, consistent with the mating Allee edge (world-balance Phase 6, review H1), which the plan's "If it fails" path names as
primary. E-CC-1 is falsified; E-CC-2 and E-CC-3 are not run (E153, E154).

**Intake per agent under 50 prey.** The reports carry no windowed intake, so the figure the plan asks for is not in them.
The two readings they hold, per arm, are in the table: the share of checkpoints with fewer than 50 prey (0.18 on food-1.5x to 0.69 on
flat-food-0.5x, 0.22 on the defaults) and food energy per 1k agent-ticks over the whole run (403 to 494 on the food arms against 532
on the defaults). Intake per agent falls with the food cut as designed; whether it falls further under 50 prey than above
it (330 against 553 per prey per 1k in the 2026-11-06 T66 reading, floor off) needs a windowed intake probe in the plan that reopens.

**Not reproduced.** The coordinator's own trace reading gave a median lowest population of 8 to 11 and a median population of
228 on the defaults; the committed script gives 16.5 and 251 (pooled over checkpoints at tick 10000 or later, the cut the detectors use). The
seed counts under 40 and the hunters alive agree. The numbers above are the committed script's.
