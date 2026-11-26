# E279 - the pooled share family (metric-noise T3, T4)

128 seeds x 200000 ticks, `map-elites-v6`, the season 12 defaults (`rulesHash` `4110c4d043dd1658`), batch 4 code with
the four pooled share cells: `evals/power/defaults-floor-on-E279.json` and, with `evals/floor-off-config.json`,
`evals/power/defaults-floor-off-E279.json`. It replaces E278 as the shared baseline: same rules, config hash and seeds,
and every one of E278's 431 metrics is byte-identical in it, so the four pooled shares are the only new readings.

Power at 16, 32 and 64 seeds with `--include-watch` (studentised, D7 and D8). The eight share metrics were re-read on
E279, floor on and floor off: `power-shares-floor-on.json` and `power-shares-floor-off.json` beside this file. Re-reading four of E278's metrics gave their 12 rows byte for byte, because power is seeded and the values are the
same. So `evals/power/power-E279.json` and `evals/power/metric-noise-E279.json` are E278's 1293 rows plus the 12 new
pooled rows, and the source hash points at the E279 report.

## The prediction

Falsified for two of the four. `eval.food_contact_bite_share_pooled` and `eval.carcass_hunter_share_pooled` detect a
smaller 64-seed change than their per-seed shares on both floor settings, and both pass the 0.05 absolute share bar.
`eval.mating_share_pooled` reads the same as `eval.mating_share`. `eval.gap_never_share_pooled` is smaller only with the
floor off. All four are live on both settings (no null seed).

| Metric                                | Floor | A/A false positives 16 / 32 / 64 | Detectable change 16 / 32 / 64 |
| ------------------------------------- | ----- | -------------------------------- | ------------------------------ |
| `eval.food_contact_bite_share_pooled` | on    | 0.071 / 0.045 / 0.009            | 0.05 / 0.05 / 0.03             |
| `eval.food_contact_bite_share`        | on    | 0.103 / 0.090 / 0.082            | 0.15 / 0.10 / 0.075            |
| `eval.food_contact_bite_share_pooled` | off   | 0.079 / 0.050 / 0.013            | 0.075 / 0.05 / 0.03            |
| `eval.food_contact_bite_share`        | off   | 0.107 / 0.089 / 0.084            | 0.15 / 0.10 / 0.075            |
| `eval.carcass_hunter_share_pooled`    | on    | 0.068 / 0.053 / 0.050            | 0.075 / 0.05 / 0.05            |
| `eval.carcass_hunter_share`           | on    | 0.110 / 0.090 / 0.079            | none / 0.15 / 0.10             |
| `eval.carcass_hunter_share_pooled`    | off   | 0.062 / 0.058 / 0.062            | 0.075 / 0.05 / 0.05            |
| `eval.carcass_hunter_share`           | off   | 0.088 / 0.090 / 0.087            | none / 0.15 / 0.10             |
| `eval.mating_share_pooled`            | on    | 0.056 / 0.061 / 0.052            | 0.15 / 0.10 / 0.075            |
| `eval.mating_share`                   | on    | 0.056 / 0.051 / 0.044            | 0.15 / 0.10 / 0.075            |
| `eval.mating_share_pooled`            | off   | 0.050 / 0.056 / 0.051            | 0.15 / 0.10 / 0.075            |
| `eval.mating_share`                   | off   | 0.058 / 0.050 / 0.051            | 0.15 / 0.10 / 0.075            |
| `eval.gap_never_share_pooled`         | on    | 0.071 / 0.031 / 0.044            | none / none / 0.15             |
| `eval.gap_never_share`                | on    | 0.046 / 0.060 / 0.054            | none / 0.20 / 0.15             |
| `eval.gap_never_share_pooled`         | off   | 0.072 / 0.066 / 0.046            | 0.20 / 0.15 / 0.10             |
| `eval.gap_never_share`                | off   | 0.053 / 0.057 / 0.044            | none / 0.15 / 0.15             |

## Why pooling helps two and not the others

Pooling helps where a world's share tracks how much exposure it had. Then the low-exposure worlds supply the outlying
shares, and pooling down-weights them. The table shows the correlation of the per-world share with log exposure, floor
on (floor off in brackets).

| Share             | Correlation with log exposure | Exposure p10 / p50 / p90 (floor on) | Pooled estimate | Mean of per-world shares |
| ----------------- | ----------------------------- | ----------------------------------- | --------------- | ------------------------ |
| food contact bite | -0.79 (-0.67)                 | 0.71M / 3.5M / 9.9M                 | 0.046           | 0.096                    |
| carcass hunter    | 0.78 (0.69)                   | 41k / 251k / 737k                   | 0.904           | 0.827                    |
| gap never         | 0.60 (0.13)                   | 4 / 7 / 38                          | 0.815           | 0.659                    |
| mating            | 0.00 (0.07)                   | 3.5k / 8.4k / 11.9k                 | 0.489           | 0.491                    |

E278's idle-bite exposure was spread evenly over the worlds, and its share did not track it, so pooling bought nothing
there. The pooled estimate is a different quantity from the old metric. It is the share over every event in the pool, so
the busiest worlds weigh most. Phase 3 has to judge whether that is the question each scene asks before an old share is
retired.

## Caveats

- `eval.food_contact_bite_share_pooled` reads 0.009 and 0.013 false positives at 64 seeds. The interval is conservative
  there, which is the safe side, not a false call. Its level is 0.046, so the 0.05 absolute share bar is larger than
  the share itself. A 0.03 change is about two thirds of the level.
- `eval.gap_never_share_pooled` with the floor on finds no change at 32 seeds, where the per-seed share finds 0.20.
  Most worlds have 4 to 38 crossers, and the few with many decide the pool.

## Status changes

209 of 435 metrics verified (207 of 431 on E278). `eval.carcass_hunter_share_pooled` is verified from 32 seeds and
becomes the Scavenge headline, the scene's first. `eval.food_contact_bite_share_pooled` is verified from 16 seeds (it
has no scene tag). The two others stay unverified. No E278 reading moved.

## Metric bugs found on the way

The scene scorecard and `npm run baseline:table` printed a pooled metric's mean as the mean of its per-seed ratios
(0.827 for the carcass share), not the pooled estimate its verdicts and power read (0.904). Both now print the pooled
estimate, each with a failing test first.
