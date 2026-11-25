### 2026-11-05 - E100 hunter life history: births rise 3 to 8 times, hunters at the end do not, and they starve

`E100` (`evals/screens/results/hunter-life/`): 7 arms x 8 seeds x 200000 ticks, `live` policy, E98's seeds and defaults. Means over 8 seeds; hunters is seeds with one or more alive at the last tick (total); births are predator births per run.

| Arm          | hunters | births | catch rate | population | seeds < 80 | fed life | floor episodes | families eff. | mating | dominance |
| ------------ | ------- | ------ | ---------- | ---------- | ---------- | -------- | -------------- | ------------- | ------ | --------- |
| defaults     | 1/8 (2) | 5.0    | 0.069      | 126        | 1          | 4622     | 9.0            | 1.43          | 0.56   | 0.35      |
| split-low    | 1/8 (1) | 12.3   | 0.096      | 106        | 3          | 4501     | 9.8            | 1.44          | 0.49   | 0.36      |
| upkeep-low   | 0/8     | 2.1    | 0.061      | 115        | 4          | 4442     | 7.0            | 1.36          | 0.47   | 0.32      |
| specmut-high | 2/8 (3) | 28.5   | 0.077      | 99         | 3          | 4511     | 9.8            | 1.17          | 0.44   | 0.31      |
| store-big    | 2/8 (2) | 15.0   | 0.146      | 131        | 2          | 4345     | 8.6            | 1.50          | 0.53   | 0.29      |
| rest-cheap   | 1/8 (2) | 38.9   | 0.123      | 114        | 3          | 5062     | 7.8            | 1.17          | 0.48   | 0.34      |
| mature-fast  | 0/8     | 5.5    | 0.094      | 101        | 5          | 3983     | 8.6            | 1.47          | 0.53   | 0.31      |

No arm reaches 3/8, so there is no candidate for a 16-seed run. Four arms lift births by 50% or more, yet hunters at the end stay at 0-2 of 8: a born hunter does not live to be counted. The reports carry no death cause per role (`eval.disease_deaths_share`, `eval.terrain_death_share`, `eval.toxic_death_share` and `eval.trampled_share` cover all agents), so four defaults replays (`npm run replay -- --seed <n> --ticks 200000 --level debug --policy map-elites-v6`, seeds 313056, 612370, 446985, 639124) were read for `AgentDied` events with `spec` 1: of 251 hunter deaths, 188 starved (75%, median age 1859 ticks, about three maturity spans), 45 hit a rock or wall (18%, `obstacleDamage` and `wallDamage` 50), 10 were eaten, 5 trampled, 3 died of disease; none of old age or poison. Hunters were born by split (93), floor re-seed (81), the initial seed (68) and mating (9). Hunters therefore starve soon after they mature, whatever their birth route. A note on the replays: `replay` defaults to `baseline-v5`, which is a different world; the screens use `map-elites-v6`. Next: E102 (`evals/screens/hunter-starve.grid.json`), one factor against starvation and rock damage per arm; `evals/hunter-store-specmut-config.json` holds the `specmut-high` plus `store-big` combination (each 2/8 against 1/8, within noise) for E102's last arm.
