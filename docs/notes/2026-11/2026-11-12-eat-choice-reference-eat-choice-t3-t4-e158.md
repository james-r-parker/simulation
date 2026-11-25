### 2026-11-12 - Eat-choice reference (eat-choice T3, T4, E158)

Reads of `evals/decisions/E158/defaults-floor-on.json` (defaults, floor on, policy live, 128 seeds x 200000 ticks, configHash
`ff8d890a5a70c14d`, run at `e86ea555`, code-identical to main; 310 metrics, 2938 s). None of the three eat-choice detectors is
null on any seed, and the 307 metrics registered before read as they did in E155 (`metric-liveness`, compared metric by metric).
Power is from `eval:power` at 16, 32 and 64 seeds with 1000 splits and 200 power splits; every split is valid.

| Detector                                        | Mean (SD)     | Status     | minSeeds | Power at 16 / 32 / 64 seeds (fpr, detectable)                    |
| ----------------------------------------------- | ------------- | ---------- | -------- | ---------------------------------------------------------------- |
| `eval.food_contact_bite_share`                  | 0.498 (0.152) | unverified | null     | fpr 0.07 / 0.07 / 0.05; detectable 0.15 / 0.15 / 0.10            |
| `eval.full_contact_bite_share`                  | 0.504 (0.168) | unverified | null     | fpr 0.07 / 0.06 / 0.06; detectable 0.20 / 0.15 / 0.10            |
| `eval.fat_speed_ratio`                          | 1.317 (0.124) | verified   | 16       | fpr 0.08 / 0.03 / 0.00; detectable 0.10 / 0.10 / 0.10 (relative) |
| `eval.bite_idle` (E155 metric; power from E150) | 0.724 (0.137) | unverified | null     | fpr 0.08 / 0.07 / 0.06; detectable 0.15 / 0.15 / 0.075           |

The two share detectors are `unverified` on power, not on false positives: a `share` needs a detectable change of 0.05 or less
(`MAX_SHARE_MDE` in `js/evo/metric-registry/status.js`), and at 64 seeds they still detect only 0.10. Read them as reference
means, not as verdicts. `eval.fat_speed_ratio` is a ratio, so its bar is 0.20 of the mean, and 16 seeds clear it.

**The reading.** A forager's `BITE` is a coin flip at food (0.50), and it shows no restraint when full (0.50): an agent holding
a nearly full store bites at food as often as an empty one. Fatter agents move 1.32 times faster than leaner ones of their kind,
because the movers are the eaters and fat costs nothing: the thrust and turn lines ignore the store (`actAll`), so a full
agent is never slowed. The eat-choice screen in Phase 2 reads these three numbers against this reference.
