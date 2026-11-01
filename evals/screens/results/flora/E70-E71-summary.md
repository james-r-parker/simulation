# Flora E70-E71 screen outcomes

Both grids ran on the live policy for 200000 ticks per seed, seeds 1-8. These results are feature calibration evidence; the screen runner’s generic `FAIL` label is not the Flora local verdict. The global predator/family counts are balancing diagnostics and remain unpassed; they do not block Flora selection or completion.

E69 comparator (16 seeds): food energy 420.56, fed median lifespan 7007, deliberate food share 0.528, patch leave depleted 0.324, carcass meal share 0.899, winter basin density 0.946. E69 has no Flora or toxin metrics.

## E70 species OAT

| Arm               | seasonal diet shift | winter density | food energy / 1k | predators at end (of 8) | prey types (of 8) | family effective ≥3 (of 8) |
| ----------------- | ------------------: | -------------: | ---------------: | ----------------------: | ----------------: | -------------------------: |
| background-0.4    |               0.309 |          0.277 |           390.42 |                     0/8 |               8/8 |                        0/8 |
| berry-energy-0.8x |               0.437 |          0.552 |           345.34 |                     1/8 |               8/8 |                        1/8 |
| berry-energy-1.2x |               0.416 |          0.446 |           345.85 |                     0/8 |               8/8 |                        1/8 |
| berry-span-0.6x   |               0.388 |          0.518 |           367.95 |                     2/8 |               8/8 |                        0/8 |
| defaults          |               0.429 |          0.477 |           365.56 |                     0/8 |               8/8 |                        0/8 |
| grass-energy-0.8x |               0.447 |          0.572 |           358.50 |                     0/8 |               8/8 |                        0/8 |
| grass-energy-1.2x |               0.326 |          0.553 |           357.57 |                     0/8 |               8/8 |                        0/8 |
| nut-energy-0.8x   |               0.431 |          0.549 |           367.75 |                     0/8 |               8/8 |                        0/8 |
| nut-energy-1.2x   |               0.419 |          0.533 |           356.89 |                     1/8 |               8/8 |                        0/8 |
| nut-span-0.6x     |               0.407 |          0.459 |           363.40 |                     1/8 |               8/8 |                        1/8 |

All 10 arms preserve a seasonal diet signal (means 0.309-0.447), but none improves winter basin density over E69 (0.946). Retain all species and background defaults. Predator/family results remain diagnostic: predators at end 0-2/8 and family effective ≥3 on 0-1/8 for every arm.

## E71 toxin OAT

| Arm              | toxic death share | toxic avoidance | food energy / 1k | fed median lifespan | patch leave depleted | carcass meal share | predators at end (of 8) | family effective ≥3 (of 8) |
| ---------------- | ----------------: | --------------: | ---------------: | ------------------: | -------------------: | -----------------: | ----------------------: | -------------------------: |
| defaults         |             0.000 |           0.927 |           365.56 |                4365 |                0.395 |              0.810 |                     0/8 |                        0/8 |
| lethalDose-0.8   |             0.000 |           0.927 |           365.56 |                4365 |                0.395 |              0.810 |                     0/8 |                        0/8 |
| lethalDose-1.4   |             0.000 |           0.927 |           365.56 |                4365 |                0.395 |              0.810 |                     0/8 |                        0/8 |
| sickThrust-0.2   |             0.000 |           0.859 |           349.76 |                4301 |                0.381 |              0.778 |                     0/8 |                        1/8 |
| toxiccap-share-0 |             0.000 |            null |           353.77 |                4380 |                0.405 |              0.875 |                     0/8 |                        0/8 |
| toxiccap-share-1 |             0.000 |           0.925 |           332.91 |                4400 |                0.350 |              0.886 |                     2/8 |                        1/8 |
| toxiccap-share-2 |             0.000 |           0.887 |           334.89 |                4550 |                0.383 |              0.865 |                     0/8 |                        1/8 |
| toxiccap-share-5 |             0.000 |           0.927 |           365.81 |                4356 |                0.389 |              0.990 |                     0/8 |                        0/8 |
| toxinCost-0.8    |             0.000 |           0.912 |           368.80 |                4271 |                0.379 |              0.808 |                     0/8 |                        0/8 |
| toxinCost-1.6    |             0.000 |           0.951 |           396.37 |                4329 |                0.403 |              0.828 |                     1/8 |                        0/8 |
| toxinDose-0.8    |             0.000 |           0.919 |           358.12 |                4189 |                0.380 |              0.794 |                     1/8 |                        2/8 |
| toxinDose-1.2    |             0.009 |           0.972 |           361.48 |                4146 |                0.375 |              0.780 |                     1/8 |                        0/8 |

`toxinDose-1.2` is the only arm with toxic-death share in range (0.00907); avoidance is 0.972. Food energy is 361.48 (14.0% below E69, inside its 15% bound), but fed lifespan is 4146 versus 7007 at E69 (-40.8%), patch leave depleted is 0.375 versus 0.324, and carcass meal share is 0.780 versus 0.899. Keep `toxinDose: 0.45` as the default. Carry 1.2 as an E73 diagnostic candidate, not a selected setting, so integrated results can test the toxin/economy tradeoff. All E71 arms miss the balancing predator/family diagnostics; prey types remain present on 8/8 seeds.
