### 2026-10-16 - baseline-v5 lives on the population floor

`evals/baselines/baseline-v5.json` (8 seeds x 200000 ticks, 77 s on 8 workers) shows the default config does not
sustain unevolved brains: mean population 21.5 against `minAgents` 20, 557 floor episodes per seed, 0.005 births per
1000 agent-ticks and almost no predation. Agents eat about 47 energy per 1000 agent-ticks against a cost near
twice that, so most die at a median age of about 4100 ticks and the floor refills with fresh random genomes. Diversity
sits at 0.1416, which is `sqrt(2) x 0.1`, the expected distance between two unrelated `N(0, 0.1)` rows - nothing is
inherited. `cloneWithNoisePolicy` collapses to the floor the same way (seed 1, 20000 ticks), so this is the default
world, not the policy. The evolution rework has to get agents past the floor before inheritance can show up in the
metrics.
