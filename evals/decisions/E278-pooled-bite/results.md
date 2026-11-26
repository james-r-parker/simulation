# E278 - the pooled bite metric, and the interval it exposed (metric-noise T3, D7, D8)

128 seeds x 200000 ticks, floor on, `map-elites-v6`, the season 12 defaults (`rulesHash` `4110c4d043dd1658`), batch 3
code with pooled report cells: `evals/power/defaults-floor-on-E278.json`. It replaces E276 as the shared baseline (same
rules and config hash, plus the pooled cells). Power over all 431 metrics at 16, 32 and 64 seeds with `--include-watch`,
read with the studentised interval at every size (D8): `evals/power/power-E278.json`, and with its source hash and four
disjoint batches `evals/power/metric-noise-E278.json`.

## The prediction

Falsified. `eval.bite_idle_pooled` sees no smaller change than `eval.bite_idle` on the same seeds, and neither reaches
the 0.05 absolute share bar at 64 seeds.

| Metric                  | Interval         | A/A false positives 16 / 32 / 64 | Detectable change 16 / 32 / 64 |
| ----------------------- | ---------------- | -------------------------------- | ------------------------------ |
| `eval.bite_idle_pooled` | BCa (before D7)  | 0.127 / 0.087 / 0.079            | none / 0.15 / 0.10             |
| `eval.bite_idle_pooled` | studentised (D7) | 0.065 / 0.054 / 0.064            | none / 0.20 / 0.15             |
| `eval.bite_idle`        | studentised < 32 | 0.046 / 0.072 / 0.043            | 0.20 / 0.15 / 0.10             |
| `eval.bite_idle`        | studentised (D8) | 0.046 / 0.059 / 0.037            | 0.20 / 0.15 / 0.10             |

Idle hunter-ticks are not concentrated in a few worlds (the top 10 of 128 seeds hold 24% of them), so pooling buys
little; the spread of the per-world share (0.28 to 0.93) is the noise, and pooling does not remove it.

## What it found

The pooled interval was BCa at every size and missed D4's small-arm rule (12.7% false positives at 16 seeds). Reading
the A/A rates of every metric on E276 then showed the per-seed path was also mis-calibrated where BCa took over at 32
seeds. D7 and D8 (T32, T33) make every interval studentised at every size.

| Seeds per arm | Median A/A false positives, E276 (old) | E278 (D8) | Over 0.075, old | D8  | Over 0.10, old | D8  |
| ------------- | -------------------------------------- | --------- | --------------- | --- | -------------- | --- |
| 16            | 0.052                                  | 0.052     | 49              | 49  | 6              | 6   |
| 32            | 0.064                                  | 0.051     | 95              | 35  | 32             | 8   |
| 64            | 0.051                                  | 0.045     | 38              | 18  | 13             | 8   |

## Status changes

207 of 431 metrics verified (210 on E276 with the old interval), 221 unverified, 3 deprecated.

- Became unverified: `eval.hunter_kill_rate_by_source.spec-flip`, `eval.recruit_first_kill_share`,
  `eval.birth_source_share.split`, `eval.winter_pop_ratio`.
- Became verified: `eval.hunter_birth_source_share.spec-flip`.

## Floor off

The same 128 seeds x 200000 ticks with `--config evals/floor-off-config.json`: `evals/power/defaults-floor-off-E278.json`.
Both metrics are live (no null seed, 128 distinct values), and the falsification holds.

| Metric                  | A/A false positives 16 / 32 / 64 | Detectable change 16 / 32 / 64 |
| ----------------------- | -------------------------------- | ------------------------------ |
| `eval.bite_idle_pooled` | 0.062 / 0.046 / 0.064            | none / 0.20 / 0.15             |
| `eval.bite_idle`        | 0.043 / 0.044 / 0.037            | 0.20 / 0.15 / 0.10             |
