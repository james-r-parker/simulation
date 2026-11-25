### 2026-10-17 - Food placement in a fertile zone an obstacle covers

Long runs died with "no point clear of obstacles for radius 30 in 100 tries" in the `field` phase (three times:
tick 85542 on a 7680 x 4320 world, tick 175856 and tick 115629 under tuning overrides). It was not the uniform
sampler: `placeInZone` draws only within `fertileZoneRadius` (150) of a zone centre, and obstacles drift
(radius up to 120, plus 30 for a high-value item) until one lies over a zone and blocks every draw. A zone is
long-lived, so over hundreds of thousands of ticks this is certain to happen. `placeInZone` now falls back to
`placeClear` after `placementTries` zone draws; runs that never hit the case replay unchanged (no golden
changed). The same cause explains the earlier "2000 x 1000 test world can fail food placement" note.
