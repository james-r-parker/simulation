# Megafauna Phase 1 gate evidence

The gate requires each of `eval.herd_animals`, `eval.herd_grazed_share`, and `eval.herd_carcass_meal_share` to be positive on at least 12 of 16 seeds.

| Run / arm                                             | Seeds | Herds positive | Grazing positive | Carcass meals positive | Mean grazing share | Mean carcass meal share |
| ----------------------------------------------------- | ----: | -------------: | ---------------: | ---------------------: | -----------------: | ----------------------: |
| E76 defaults (startle radius 700, herd count 4)       |    16 |          16/16 |            16/16 |                   9/16 |            0.08142 |                 0.00257 |
| E76 startle radius 200                                |    16 |          16/16 |            16/16 |                   8/16 |            0.06958 |                 0.00099 |
| E76 startle radius 400                                |    16 |          16/16 |            16/16 |                   8/16 |            0.06534 |                 0.00088 |
| E76 startle radius 700                                |    16 |          16/16 |            16/16 |                   9/16 |            0.08142 |                 0.00257 |
| E76 startle radius 1000                               |    16 |          16/16 |            16/16 |                   5/16 |            0.06787 |                 0.00070 |
| E76 stage 2 reference (radius 200, count 4)           |     8 |            8/8 |              8/8 |                    4/8 |            0.08246 |                 0.00102 |
| E76 stage 2 herd count 6                              |     8 |            8/8 |              8/8 |                    5/8 |            0.10108 |                 0.00231 |
| Candidate (radius 200, count 6), 16-seed confirmation |    16 |          16/16 |            16/16 |                  10/16 |            0.11255 |                 0.00272 |

The chosen candidate is the strongest tested combination for grazing and carcass meals. It still misses the written carcass-meal gate by two seeds, so Phase 1 conformance is not complete. The recorded 64-seed power report shows that carcass meal share, carcass share by role, gap crossings and stampede rate are weak or sparse detectors at the tested sample sizes; grazing share and herd presence are better powered. See `E76-power-64.report.json` and `E76-power.json`.
