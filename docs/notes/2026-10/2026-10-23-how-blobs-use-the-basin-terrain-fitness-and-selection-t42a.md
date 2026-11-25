### 2026-10-23 - How blobs use the basin terrain (fitness-and-selection T42a, measured early)

Replays of the T15l package (`arc1.571-bite12-size0.8`) on seeds 200460, 597883, 174238 and 553445 for 80000 ticks,
and `defaults` on seed 200460, tallied by a `stepFn` wrapper around `runReplay` (the user asked whether the refuges
and wall gaps are too small).

| Measure                                                                    | Package (4 seeds)                     | `defaults` (1 seed) |
| -------------------------------------------------------------------------- | ------------------------------------- | ------------------- |
| Blobs inside all 4 refuges (mean)                                          | 0.2 to 1.8 (0.14 to 1.4% of capacity) | 2.8 (2.2%)          |
| Refuge entry after reaching the rocks, r under 25 / 25 to 30 / 30 and over | 21% / 20% / 11%                       | 27% / 22% / 9%      |
| Wall-gap crossings per 1000 ticks                                          | 0.5 to 2.1                            | 2.8                 |
| Collision share of deaths                                                  | 0.18 to 0.26                          | 0.33                |
| Collision deaths at the world edge / wall / refuge rocks                   | 59% / 21% / 19%                       | 50% / 26% / 24%     |
| Predator bites on prey inside or near refuges                              | 0                                     | 0                   |

- A refuge gap is exactly 60 px (8 rocks of radius 50 on a 209 px ring, `refugeSizeMax` 30), so the path for a blob's
  centre is `60 - 2r`: 6 px at radius 27 and none at 30. Blob radius is `baseSize` x the size trait plus energy / 250,
  so 44 to 62% of prey ticks on full worlds are at radius 30 or more. Entrances are too tight; the user's concern holds.
- Wall gaps are not the limit: 300 px is about 5 blob diameters, and big blobs cross as often as small ones.
- Refuges have no pull and no push: none of the 16 food patches is centred in one (food items inside 0.9 to 1.7% against
  0.48% of the area) and no predator bite happened near one, so prey use them at chance level. Predators and prey are
  the same size, so `refugeSizeMax` keeps out rich blobs, not predators.
- Collision deaths are starvation with a bump: 99.6% had 60 energy or less before a 50-energy bounce, so
  `eval.terrain_death_share` overstates the terrain's cost.
- Levers for the terrain round (T42c): `refugeRocks` 6 or 5 (gaps of 109 or 146 px at the same ring; a new key),
  `refugeSizeMax` 45 or 60 (gap and interior grow together), a food patch in each refuge (new), and `wallGaps` 6 with
  `wallGapWidth` 400; judged by refuge occupancy, entry rate, `eval.migration_index` and predator bites near refuges.
