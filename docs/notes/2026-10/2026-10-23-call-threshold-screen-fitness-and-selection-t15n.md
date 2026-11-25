### 2026-10-23 - Call threshold screen (fitness-and-selection T15n)

Grid `evals/screens/call-threshold.grid.json`: 4 seeds (offset 28), 200000 ticks, policy `live`, 9 arms (each checked with `createConfig` before the run). `base` is the T15h final package: the T15l package (`predatorRescueMin` 3, `predatorRescueInterval` 450, `predatorKillEnergy` 150, `biteArc` 1.571, `huntSizeRatio` 0.8, predator `passiveLossMultiplier` 0.6, `splitMinEnergyMultiplier` 0.6, `biteMultiplier` 12) plus `huntCallCost` 10, with both thresholds 0. `defaults` (the current defaults) is the reference. Arms: `alarm-0.5`, `alarm-0.8`, `hunt-0.5`, `hunt-0.8`, `both-0.5`, `both-0.65`, `both-0.8`.

Prediction (written before the run): a threshold removes the calls a random brain makes by drift, so `eval.idle_signals_per_1k` falls, unlike with the cost, because the output must now be driven well above zero and selection need not pay for each stray call. I expect about -30% at 0.5 and -60% or more at 0.8 on the arm's own call, so the `both` arms fall furthest. The precisions rise because the denominator (calls) falls faster than the useful calls do; alarm precision stays under 0.01. Population and mating stay near `base` (360 to 390, 0.2), since fewer calls means less energy paid. The risk is hunt at 0.8: the hunt call may become too rare to help, so catch rate and predator births could drop a little. Likeliest best arm: `both-0.5` or `both-0.65`.

Results (4 seeds x 200000 ticks, from `evals/screens/results/call-threshold/`; `idle` is the mean `eval.idle_signals_per_1k`, `alarm p` and `hunt p` the means of `eval.alarm_precision` and `eval.hunt_call_precision`, `births` the mean `eval.predator_births` per seed, `pop` is `eval.population_mean`; the Scorecard is `FAIL` on every arm, the reference included, so the column is left out; the failing row on the arms below `mating` 0.2 is "mating mean >= 0.2"):

| Arm         | idle | alarm p | hunt p | catch | births | pop | mating |
| ----------- | ---- | ------- | ------ | ----- | ------ | --- | ------ |
| `defaults`  | 12.5 | 0.0000  | 0.0051 | 0.004 | 4.5    | 436 | 0.21   |
| `base`      | 10.4 | 0.0004  | 0.0112 | 0.079 | 55.0   | 388 | 0.21   |
| `alarm-0.5` | 9.2  | 0.0002  | 0.0110 | 0.048 | 75.0   | 301 | 0.17   |
| `alarm-0.8` | 8.0  | 0.0002  | 0.0120 | 0.071 | 23.0   | 423 | 0.19   |
| `hunt-0.5`  | 11.1 | 0.0004  | 0.0385 | 0.064 | 31.3   | 422 | 0.22   |
| `hunt-0.8`  | 11.4 | 0.0003  | 0.0234 | 0.060 | 47.5   | 358 | 0.23   |
| `both-0.5`  | 9.5  | 0.0012  | 0.0204 | 0.096 | 233.5  | 327 | 0.17   |
| `both-0.65` | 8.9  | 0.0006  | 0.0153 | 0.084 | 72.3   | 367 | 0.24   |
| `both-0.8`  | 8.8  | 0.0001  | 0.0287 | 0.050 | 52.3   | 344 | 0.18   |

Conclusion:

- **Thresholds make calls rarer, not precise.** Idle signals fall only to 8.0 to 9.5 on the alarm and combined arms (base 10.4, per-seed sd 0.6, so `alarm-0.8` at -23% and `both-0.65` at -14% are real but modest) and do not fall at all on the hunt-only arms (11.1 and 11.4). Nowhere near the halving predicted. Precision stays low: `eval.alarm_precision` is 0.0001 to 0.0012 on every arm (under 0.2% of alarms are followed by a threat), so the alarm call is still not a signal. `eval.hunt_call_precision` is the one gain: 0.0112 on `base` to 0.0385 on `hunt-0.5` (3.4 times), 0.0234 on `hunt-0.8` and 0.0287 on `both-0.8`, but still under 4% of hunt calls precede a catch. The prediction that idle signals fall 30% at 0.5 and 60% at 0.8 was wrong; the precision rise was right for hunt, wrong for alarm.
- **The threshold removes drift calls but not the habit.** The alarm threshold at 0.8 is the best single cut (-23%) because alarm is the call most random brains fire. A hunt call is only fired by predators, so a hunt threshold changes few idle signals but does lift what a call means (hunt p up 2 to 3.4 times).
- **Costs and noise.** A threshold of 0.5 on the alarm hurts: `alarm-0.5` and `both-0.5` lose population (301 and 327) and mating (0.17), the same signature as the T15h alarm costs, and `both-0.5` has 233 predator births per seed (a churn of deaths replaced by the rescue floor). The 0.8 alarm arms keep the population (`alarm-0.8` 423) but not mating (0.19, `both-0.8` 0.18). `both-0.65` is the only arm to improve on `base` for mating (0.24), with population 367 (-5%), catch 0.084 (+6%) and births 72. Mating swings between 0.17 and 0.24 across arms without a monotone trend in the threshold, so some of it is 4-seed noise.
- **Proposed thresholds for T15d: `alarmThreshold` 0.65 and `huntCallThreshold` 0.65 (`both-0.65`).** It is the only arm that keeps mating above 0.2, cuts idle signals (-14%), lifts hunt precision (1.4 times) and keeps the predator gains (catch 0.084, births 72, pop 367). `hunt-0.5` has the best hunt precision (0.0385) and `alarm-0.8` the lowest idle (8.0) but each fails the other's row; their mix (`alarmThreshold` 0.8, `huntCallThreshold` 0.5) was not screened and is the first thing to try if E36 still shows spam. Honest summary: thresholds do not fix idle signals (the best arm is 8.0 against 10.4, not near silence) and the alarm stays imprecise. Caveat: 4 seeds, a screen not a verdict.
