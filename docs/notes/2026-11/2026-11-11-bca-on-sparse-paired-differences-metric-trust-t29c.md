### 2026-11-11 - BCa on sparse paired differences (metric-trust T29c)

`bootstrapInterval` in `js/evo/compare.js` (BCa, 10000 resamples) gives an interval that excludes 0 when only a few
paired differences are nonzero and they share a sign. With k seeds at -1 and the other seeds at 0:

| k of n  | BCa (as built)   | BCa, ties counted half | Percentile       | Exact sign test p |
| ------- | ---------------- | ---------------------- | ---------------- | ----------------- |
| 1 of 32 | -0.156 to 0      | -0.156 to 0            | -0.094 to 0      | 1.000             |
| 2 of 32 | -0.250 to -0.031 | -0.188 to 0            | -0.156 to 0      | 0.500             |
| 3 of 32 | -0.313 to -0.031 | -0.250 to -0.031       | -0.219 to 0      | 0.250             |
| 4 of 32 | -0.344 to -0.063 | -0.281 to -0.031       | -0.250 to -0.031 | 0.125             |
| 6 of 32 | -0.406 to -0.094 | -0.344 to -0.063       | -0.313 to -0.063 | 0.031             |
| 2 of 16 | -0.500 to -0.063 | -0.375 to 0            | -0.313 to 0      | 0.500             |

There are two causes. The bias correction `z0` counts resample means strictly below the observed mean, and on discrete
data many resamples tie with it, which shifts the interval toward the tail. Counting ties as half fixes 2 of 32 but not 3. The deeper cause holds for any bootstrap of the mean: when every nonzero difference has the same sign, no resample
can have the other sign, so the interval reaches 0 only through resamples that draw no nonzero seed at all. That share
is `(1 - k/n)^n`, which drops under 2.5% at k = 4 of 32. Even the percentile interval then excludes 0, while the sign
test gives p = 0.125.

**Where it decides a verdict.** On the committed paired reports:

- Floor on against floor off (`evals/power/defaults-floor-*-E150.json`, 128 seeds): 204 of 284 metrics have more than
  half their paired differences exactly 0, because the two worlds are identical until the floor first fires. Of the 26
  verdicts, 25 hold under the sign test (p 0.04 or less). `eval.idle_signals_per_1k` reads `worse` on 3 nonzero seeds
  (sign p 0.25, percentile `no-difference`); that verdict is spurious.
- `mateRoamTicks` 0 against 6000 and `herdDungTicks` 900 against 1800 (32 seeds each) act from tick 0. Only 20 of 268
  and 14 of 180 metrics are sparse there, and no verdict rests on a sparse metric except `eval.prey_types_at_end` in the
  roam pair (15 nonzero, sign p 0.007, holds).
- In `evals/experiments.json`, the only verdict from `E120` on that rests on a metric whose E150 values are at least
  half one value is `E146` `eval.prey_types_at_end` `worse`, which holds. Earlier, `eval.idle_signals_per_1k` (0 on 95%
  of seeds) carries verdicts in `E25`, `E28`, `E29`, `E36` and `E47`. `E29` is the calibration of two halves of one
  baseline, so its `better` is a false positive. These are v5-era records, before T35's range.

So the fault is narrow and real: it bites arms that share early trajectories (floor and late-acting changes), rare-event
counts, and 0/1 flags such as the keep rule's seed guards.

**The fix (T29c).** When at least half of a metric's paired differences are exactly 0, `compareReports` gives a
`better` or `worse` verdict only if an exact two-sided sign test on the nonzero differences also gives p below 0.05
(otherwise `no-difference`, with a note). Dense metrics keep the BCa interval alone; there the sign test is weaker than
the mean test (`eval.behaviour_coverage` in the roam pair: 32 nonzero, sign p 0.22, a real shift of the mean). The keep
rule's seed guards use the same exact test as McNemar on discordant seeds (T30). Tie-corrected BCa alone was rejected,
because it still fails at 3 of 32.
