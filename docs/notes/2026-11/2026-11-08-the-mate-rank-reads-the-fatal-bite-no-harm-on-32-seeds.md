### 2026-11-08 - The mate rank reads the fatal bite: no harm on 32 seeds (metric-trust T15, T15a, E147)

- **Change:** `noteKill` and `creditKills` (the `deliberateKills` the mate rank reads) and the observer's per-slot count judge the fatal bite's own deliberateness through `isDeliberateKill`, as the ledger has since T14. No golden hash moved in Node or Chromium: the golden worlds hold no deliberate kill that changes a mate rank within their ticks.
- **Run:** defaults, floor on, policy live, 32 seeds x 200000 ticks, configHash `ff8d890a5a70c14d`, before `a1562fb0`, after `b56054ee`.
- **Keep rule (paired):** hunters alive 27 and 27 of 32, seeds ending under 80 agents 9 and 9 (both differences 0). `eval.population_mean`, `eval.food_energy_per_1k`, `eval.births_per_1k`, `eval.mating_share`, `eval.predators_at_end` and `eval.prey_types_at_end` show no difference.
- **One `worse`:** `eval.basin_families` 2.04 to 1.92 (-5.6%, interval -0.54 to -0.01), 1 of 68 metrics with a verdict, which is near the false-positive count at this interval, and not a keep-rule guard. It is unverified in the registry (metric-trust Phase 4 measures its power). T15 stays.
