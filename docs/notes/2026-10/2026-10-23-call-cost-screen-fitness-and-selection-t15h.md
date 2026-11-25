### 2026-10-23 - Call cost screen (fitness-and-selection T15h)

Grid `evals/screens/call-cost.grid.json`: 4 seeds (offset 28), 200000 ticks, policy `live`, 15 arms (each checked with `createConfig` before the run). `base` is the adopted T15l package (`predatorRescueMin` 3, `predatorRescueInterval` 450, `predatorKillEnergy` 150, `biteArc` 1.571, `huntSizeRatio` 0.8, predator `passiveLossMultiplier` 0.6, `splitMinEnergyMultiplier` 0.6, `biteMultiplier` 12); every arm is built on it, and no arm touches `specialisations`. `defaults` (the current defaults: rescue off, arc pi/4, ratio 1.01, bite 4, no economy levers) is the reference. Levers: `alarmCost` 2, 5, 10, 20 (default 0.5); `huntCallCost` 2, 5, 10, 20 (default 0.5); `smokeCost` 10 and 40 (default 20); combinations `alarm5-hunt5`, `alarm10-hunt10-smoke40`, `alarm20-hunt20-smoke40`.

Prediction (written before the run): `eval.idle_signals_per_1k` falls as the cost rises, roughly halving at cost 5 and falling by 80% or more at 20, because a call at nothing is pure energy loss and selection removes it. The precisions rise only if calls survive at all. The likelier outcome at costs of 10 and above is silence: blobs stop calling, idle signals go to near zero and the precisions become null on most seeds, which counts as spam fixed but not as precise calling. 200000 ticks is short for a new signal to evolve, so I expect silence rather than precision. `smokeCost` moves idle signals little (smoke is rare and already costly). The costs should not hurt the predator package (`eval.catch_rate` near 0.07, mating near 0.17), though a heavy hunt call cost may cut predator births a little. The combinations are the strongest arms for idle signals and the most likely to show silence.

Results (4 seeds x 200000 ticks, from `evals/screens/results/call-cost/`; `idle` is the mean `eval.idle_signals_per_1k`, `alarm p` and `hunt p` the means of `eval.alarm_precision` and `eval.hunt_call_precision`, `births` the mean `eval.predator_births` per seed, `pop` is `eval.population_mean`; the Scorecard is `FAIL` on every arm, the reference included, so the column is left out):

| Arm                      | idle | alarm p | hunt p | catch | births | pop | mating |
| ------------------------ | ---- | ------- | ------ | ----- | ------ | --- | ------ |
| `defaults` (reference)   | 12.5 | 0.0000  | 0.0051 | 0.004 | 4.5    | 436 | 0.21   |
| `base`                   | 11.7 | 0.0002  | 0.0084 | 0.069 | 47.5   | 360 | 0.17   |
| `alarm-2`                | 9.5  | 0.0009  | 0.0057 | 0.127 | 131.5  | 334 | 0.16   |
| `alarm-5`                | 11.1 | 0.0008  | 0.0092 | 0.058 | 97.0   | 247 | 0.14   |
| `alarm-10`               | 8.8  | 0.0013  | 0.0076 | 0.051 | 95.8   | 268 | 0.14   |
| `alarm-20`               | 8.4  | 0.0010  | 0.0038 | 0.017 | 179.8  | 134 | 0.09   |
| `hunt-2`                 | 12.9 | 0.0002  | 0.0077 | 0.048 | 47.8   | 370 | 0.18   |
| `hunt-5`                 | 10.7 | 0.0002  | 0.0109 | 0.047 | 45.3   | 380 | 0.20   |
| `hunt-10`                | 10.4 | 0.0004  | 0.0112 | 0.079 | 55.0   | 388 | 0.21   |
| `hunt-20`                | 12.0 | 0.0002  | 0.0085 | 0.036 | 43.3   | 354 | 0.16   |
| `smoke-10`               | 10.7 | 0.0004  | 0.0095 | 0.070 | 88.0   | 394 | 0.20   |
| `smoke-40`               | 11.6 | 0.0006  | 0.0068 | 0.123 | 76.5   | 381 | 0.18   |
| `alarm5-hunt5`           | 9.1  | 0.0013  | 0.0088 | 0.241 | 1533   | 298 | 0.14   |
| `alarm10-hunt10-smoke40` | 8.8  | 0.0006  | 0.0056 | 0.029 | 185.3  | 97  | 0.10   |
| `alarm20-hunt20-smoke40` | 8.0  | 0.0012  | 0.0063 | 0.014 | 138.8  | 104 | 0.05   |

Conclusion:

- **Call costs do not fix idle signals.** Per seed the spread of `base` is 10.6 to 12.5, so the best any arm does is a quarter lower (8.0 on `alarm20-hunt20-smoke40`, 8.4 on `alarm-20`), and only by shrinking the population (134 and 104 against 360) and mating (0.09 and 0.05), which also cuts the denominator. The arms that keep the population are within the noise of `base`: `hunt-10` 10.4, `smoke-10` 10.7, `hunt-5` 10.7. The prediction (a halving at cost 5, 80% off at 20) was wrong: idle signals per 1000 agent-ticks stay at 8 to 13 on every arm.
- **Blobs do not go silent and do not become precise.** `eval.idle_signals_per_1k` never nears zero, and `eval.alarm_precision` stays at 0.000 to 0.001 on every arm (the best, `alarm-10` and `alarm5-hunt5`, 0.0013). `eval.hunt_call_precision` sits at 0.004 to 0.011 (base 0.008); `hunt-10` and `hunt-5` are the only arms that lift it (0.011), a small, 4-seed difference. The prediction of silence was also wrong: with a cost the call still goes out, because the genome has no gradient against it at these sizes (the cost is 0.5 to 20 energy against a call that costs nothing in lost fitness when nothing happens).
- **High `alarmCost` is harmful.** `alarm-5` to `alarm-20` cut population to 247, 268 and 134 and mating to 0.14, 0.14 and 0.09, with fed life -35% to -59%: the cost is paid by every blob that calls, spam or not. `alarm-2` costs mating (0.16) for -2.2 idle. `huntCallCost` is gentler: `hunt-10` keeps the population (388), the mating row (0.21, the only cost arm to pass 0.2 besides `hunt-5` at 0.20), catch rate (0.079) and births (55); `hunt-20` is already worse (mating 0.16). `smokeCost` 10 or 40 does little. The combinations are the worst on population (97 to 104 for the two heavy arms). `alarm5-hunt5` has 1533 predator births per seed and catch 0.24: the call costs kill off many blobs, which the rescue floor replaces with predators (a churn, not a better world).
- **Proposed call costs for T15d: `huntCallCost` 10; `alarmCost` 0.5 and `smokeCost` 20 stay.** `hunt-10` is the only arm not worse than `base` on the judged rows (idle -11%, both precisions up, catch up, births up, population +8%, mating 0.21), and its effect is small and inside 4-seed noise. Honest summary: the call cost lever does not solve spam; it is cheap to set, so the final T15d package is the T15l predator package plus `huntCallCost` 10, with the idle-signal problem left open. The next lever is not the cost but the signal itself (what counts as an idle call, or giving the receiving side a response that makes spam unprofitable), a question for the E36 run and a later design. Caveat: 4 seeds, a screen not a verdict.
