### 2026-11-05 - E99 herd body radius: the trampled share barely moves, one arm clears the gate

`E99` (`evals/screens/results/herd-body/`): `herdBodyRadius` 60, 45, 30 with `herdRadius` 80 (graze reach) unchanged, 4 arms x 8 seeds x 200000 ticks, `live` policy, seeds 1-8. Means over 8 seeds; predators is seeds with a hunter alive at the last tick; floor is episodes summed over seeds.

| Arm      | population | under 80 | fed life | floor | predators | trampled | seeded | pollination | carcass | grazed | dominance | prey types |
| -------- | ---------- | -------- | -------- | ----- | --------- | -------- | ------ | ----------- | ------- | ------ | --------- | ---------- |
| defaults | 126        | 1/8      | 4622     | 72    | 1/8       | 0.040    | 0.006  | 0.058       | 0.015   | 0.363  | 0.345     | 2.25       |
| body60   | 153        | 2/8      | 4588     | 47    | 0/8       | 0.047    | 0.007  | 0.070       | 0.018   | 0.347  | 0.342     | 2.00       |
| body45   | 130        | 2/8      | 4545     | 57    | 1/8       | 0.034    | 0.007  | 0.066       | 0.016   | 0.344  | 0.310     | 2.25       |
| body30   | 184        | 1/8      | 5328     | 40    | 0/8       | 0.032    | 0.003  | 0.063       | 0.013   | 0.322  | 0.313     | 2.25       |

Predictions mostly missed. The trampled share fell far less than predicted (-25%, -50%, -70% predicted; +18%, -15%, -20% measured), so a smaller exclusion disc is not what cuts trampling. Population rose in two arms but not in order of radius (+21%, +3%, +46%), with a seed sd of about 60 (se about 22), so the gains look like seed noise as in E96/E97. Predators stayed at 0-1/8 as predicted. Gate (population +10% or more, no herd role down over 30%, no prey type lost; every arm including defaults has a seed with one prey type at the end): `body60` passes and is the candidate (`evals/body60-config.json`); `body30` fails on seeded patches (-50%); `body45` fails on population (+3%). A 16-seed `eval:compare` of `body60` decides it. The mechanism is not visible, so the bar is a population gain with the interval excluding 0; without it `herdBodyRadius` is deleted with its tests (AGENTS.md "Delete what a switch replaces").

E101 (16 seeds) did not confirm body60: population +17% with the interval including 0, hunters at end 0.44 to 0 per seed (worse). The body is not the herds' cost; herdBodyRadius is deleted.
