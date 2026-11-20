# E254 - settled hunter metrics on the 128-seed baseline

Question (metric-noise T12, D3): is `eval.hunter_catches_per_1k_settled` live, `verified` and no noisier at 64 seeds than
`eval.hunter_catches_per_1k`, so the keep-rule guard can move to it?

Baseline: `evals/power/defaults-floor-on-E254.json`, 128 seeds, 200000 ticks, floor-on defaults, policy map-elites-v6,
`rulesHash` 38be2908ad820c86 (the same as E210). The run was started under the name `settled-baseline-E252`
(`.runs/settled-baseline-E252.log`; the id was renumbered to E254 because season/next already holds an E252).

Power: `npm run eval:power -- evals/power/defaults-floor-on-E254.json --include-watch --sizes 16,32,64 --metrics <all 375>`
in four disjoint batches; readings in `evals/power/power-E254.json` and `evals/power/metric-noise-E254.json`.

| Metric                                     | Null | Distinct | Status     | Min seeds | Mean   | Detectable 16 / 32 / 64 |
| ------------------------------------------ | ---- | -------- | ---------- | --------- | ------ | ----------------------- |
| `eval.hunter_catches_per_1k`               | 0%   | 128      | verified   | 64        | 1.2903 | 0.5 / 0.3 / 0.2         |
| `eval.hunter_catches_per_1k_settled`       | 0%   | 128      | verified   | 64        | 1.3849 | 0.5 / 0.3 / 0.2         |
| `eval.hunter_kills_per_life_mean`          | 0%   | 128      | verified   | 32        | 1.3900 | 0.3 / 0.2 / 0.15        |
| `eval.hunter_kills_per_life_mean_settled`  | 0%   | 128      | verified   | 32        | 1.4738 | 0.3 / 0.2 / 0.15        |
| `eval.hunter_juvenile_death_share`         | 0%   | 128      | verified   | 32        | 0.8565 | 0.15 / 0.05 / 0.05      |
| `eval.hunter_juvenile_death_share_settled` | 0%   | 127      | unverified | 16 (fpr)  | 0.8539 | 0.1 / 0.1 / 0.075       |
| `eval.pursuit_kill_share`                  | 0%   | 127      | verified   | 64        | 0.6848 | 0.1 / 0.075 / 0.05      |
| `eval.pursuit_kill_share_settled`          | 0.8% | 126      | unverified | none      | 0.6858 | 0.1 / - / -             |

Outcome: the settled catch metric is verified and its 64-seed detectable change (0.2) equals the whole-run metric's, so
the rule is met and `GUARD_METRICS` moved to it. The prediction's first clause (a lower mean) is falsified: the settled
mean is 1.385 against 1.290 whole-run, so the founders' period reads lower, not higher, on the default world at 128
seeds. The second clause (similar detectable change) held. `eval.hunter_juvenile_death_share_settled` fails A/A
false-positive rate at 32 and 64 seeds (0.157, 0.129); `eval.pursuit_kill_share_settled` has no verdict at 64 seeds.
