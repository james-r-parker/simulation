### 2026-10-17 - Combat metrics at the tuned defaults

The five combat metrics (predator-prey.md Phase 2) first recorded for the two reference policies at the tuned Phase 1
defaults: 16 seeds x 200000 ticks, `npm run eval -- --policy <p> --seeds 16 --workers 16`. Means over the seeds with a
value; these are recordings, not comparisons, so there is no ledger entry.

| Metric                 | `baseline-v5`   | `map-elites-v1q` | `null` seeds                                   |
| ---------------------- | --------------- | ---------------- | ---------------------------------------------- |
| `eval.catch_rate`      | 0.00729         | 0.01076          | none                                           |
| `eval.escape_rate`     | 0.621           | 0.656            | none                                           |
| `eval.pack_kill_share` | 0.0312          | 0.0265           | none                                           |
| `eval.alarm_response`  | 0.00155         | 0.00454          | none                                           |
| `eval.smoke_escapes`   | 0.786 (7 of 16) | 0.722 (14 of 16) | `no smoke release after a bite`: 9 and 2 seeds |

Every seed had hunters, so `eval.catch_rate` was never `null` (`no hunters`). Catch rates are small (0.007 and 0.011
catches per 1000 hunter agent-ticks) and pack kills a few percent of kills, which is the headroom Phase 3
targets. The hunter on the micro-world also earns most of its `fitnessV1` from bite energy taken from peers (about 680
per agent against 260 from food at the tuned defaults), which the anti-exploit bound, measured on food energy, does not
allow for.
