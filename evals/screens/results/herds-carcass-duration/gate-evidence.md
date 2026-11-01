# E76 carcass lifetime extension: matched Phase 1 gate evidence

Registered as a separate E76 extension before the 16-seed run. Both arms use policy `live`, ticks 200000, seed offset 0, and the exact 16-seed E76 confirmation set (`313056, 337535, 612370, 446985, 639124, 888035, 654502, 275725, 851784, 318983, 224570, 833553, 513404, 371179, 785870, 95573`). The earlier 8-seed `herdCarcassTicks: 12000` result was exploratory and is not used as confirmation.

| Arm                                      | Herd animals positive | Mean herd animals | Grazing positive | Mean herd grazed share | Carcass meals positive | Mean carcass meal share | Predators at end positive | Mean predators at end | Mean stampede rate |
| ---------------------------------------- | --------------------: | ----------------: | ---------------: | ---------------------: | ---------------------: | ----------------------: | ------------------------: | --------------------: | -----------------: |
| Radius 200, count 6, carcass ticks 6000  |                 16/16 |          40.42237 |            16/16 |               0.112551 |                  10/16 |                0.002719 |                      2/16 |                 0.375 |            1.99013 |
| Radius 200, count 6, carcass ticks 12000 |                 16/16 |          41.46382 |            16/16 |               0.127430 |                  11/16 |                0.005702 |                      0/16 |                 0.000 |            2.11513 |

The longer lifetime increased mean carcass meal share by about 110% and added one carcass-positive seed, while grazing remained positive in all seeds. It still misses the Phase 1 carcass-meal gate by one seed, and predator presence fell from 2/16 to 0/16. This is evidence for a larger carrion pulse, not a passing Phase 1 or survival result. No default is adopted from this extension.

Raw reports: `best-200-count6.report.json` and `carcassTicks-12000.report.json`. The screen's broad scorecard is in `table.md`; its FAIL verdict is separate from the Phase 1 per-metric counts above.
