### 2026-10-17 - Jaws cut catches; `huntSizeRatio` 1.01 restores them

With the forward bite arc (`biteArc` PI / 4) and the d7 economy, a 4-seed screen (`map-elites-v1q`, seeds 28-31, 200000 ticks) gave
`eval.predation_per_1k` 0.00068, half of the 0.00135 the same economy had without jaws at 16 seeds. Overrides on the same seeds:
`huntSizeRatio` 1.0 0.00057, 1.01 0.00129 (96% of the reference), predator `sprintBoost` 1.8 0.00085. `huntSizeRatio` 1.01 is the
default (one key). Cost on the same screen: `eval.floor_episodes` 1044 against 891, `eval.population_mean` 217 against 231; fed lifespan (4741 against
4645), food energy and births stayed within 5%. These are 4-seed numbers, not verdicts.
