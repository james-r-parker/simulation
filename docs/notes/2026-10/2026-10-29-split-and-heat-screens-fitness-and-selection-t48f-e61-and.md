### 2026-10-29 - Split and heat screens (fitness-and-selection T48f, E61 and E62)

- **Split screen (`E61`)**: `evals/screens/split.grid.json`, `map-elites-v6`, 7 arms x 8 seeds at offset 32 (seeds 33-40, fresh against the E37 and E41 seeds 1-32), 200000 ticks. Means over seeds:

| Arm              | mating | bumper share | split delib | deliberate share | skill_trend | pop | floor eps | fed life | lineages | spec dom | predator births |
| ---------------- | ------ | ------------ | ----------- | ---------------- | ----------- | --- | --------- | -------- | -------- | -------- | --------------- |
| ref              | 0.129  | 0.291        | 0.178       | 0.130            | -0.022      | 353 | 7.8       | 7827     | 21.7     | 0.749    | 672             |
| share-0.2        | 0.146  | 0.111        | 0.261       | 0.162            | +0.012      | 250 | 4.5       | 5795     | 19.3     | 0.779    | 41              |
| share-0.3        | 0.151  | 0.233        | 0.269       | 0.172            | +0.009      | 157 | 8.8       | 5600     | 20.0     | 0.668    | 140             |
| share-0.4        | 0.152  | 0.384        | 0.202       | 0.152            | -0.041      | 95  | 38.5      | 5469     | 19.0     | 0.561    | 55              |
| share-0.3-once   | 0.146  | 0.410        | 0.177       | 0.139            | -0.037      | 99  | 21.1      | 6404     | 20.7     | 0.547    | 43              |
| prey-no-split    | 0.146  | 0.458        | 0.143       | 0.138            | -0.007      | 97  | 30.3      | 6806     | 19.7     | 0.627    | 45              |
| share-0.3-strict | 0.144  | 0.283        | 0.248       | 0.167            | -0.014      | 59  | 18.3      | 5512     | 19.1     | 0.520    | 30              |

- The reference's `eval.split_bumper_share` is 0.291, not the 0.4 to 0.5 predicted; its split-parent deliberate share (0.178) is close to the mate-parent share (0.170). Its predator births (672) are one seed of 5238; the other seven average 20.
- **Every gate that bites shrinks the world** (population 59 to 250 against 353, food per 1000 ticks -8% to -49%, fed lifespan -13% to -30%): the births a gate refuses are not replaced by matings, because mating stays difficult (0.13 to 0.15 in every arm). Below about 100 agents the population sits on the floor bypass and `eval.floor_episodes` rises (30 to 38 for `share-0.4` and `prey-no-split`). Only `share-0.2` keeps both the floor episodes (4.5) and a population above 200 on most seeds (lowest 94 and 110).
- **`prey-no-split` makes the bumper share worse** (0.458): when only predators may split, the split births that remain are the predators' and they are bumpers. `splitMaxPerLife` 1 does not cut it either (0.410).
- Mating share moves only 0.129 to 0.152 across the arms, so nothing here makes mating easy, which is the intent.
- **Heat screen (`E62`)**: `evals/screens/heat.grid.json`, 4 arms x 16 seeds at offset 32, on the old split default (`splitDeliberateShareMin` 0):

| Arm        | heat stress | cold stress | mating | skill_trend | pop | fed life | floor eps | food/1k |
| ---------- | ----------- | ----------- | ------ | ----------- | --- | -------- | --------- | ------- |
| ref        | 0.496       | 0.074       | 0.125  | -0.036      | 346 | 7753     | 18.4      | 599     |
| eat-1.5    | 0.415       | 0.097       | 0.183  | -0.015      | 328 | 7306     | 30.2      | 614     |
| loss-0.009 | 0.387       | 0.137       | 0.146  | -0.049      | 307 | 7476     | 36.4      | 566     |
| both       | 0.358       | 0.159       | 0.171  | -0.001      | 335 | 7680     | 23.8      | 604     |

- No arm reaches heat stress 0.3. `loss-0.009` lowers heat less than `eat-1.5` and raises cold more (the passive loss is doubled in the cold margin), so the two levers do not add up as predicted; `both` breaks the cold limit. No arm collapses. Heat 0.3 needs a different lever (a smaller `coldFactor`, or heat from movement); it was not screened.
- Not yet tested together: `share-0.2` with `temperatureGainEat` 1.5. T48g adopts both only after a 16-seed `eval:compare` on the combination.
