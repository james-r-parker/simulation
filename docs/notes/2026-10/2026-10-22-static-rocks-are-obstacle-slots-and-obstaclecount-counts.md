### 2026-10-22 - Static rocks are obstacle slots, and `obstacleCount` counts only the wandering ones

With `terrainLayout` `basins` the wall and the refuge rings are obstacles that never move, stored after the wandering
ones (`obstacleSlots(config)` = `obstacleCount` + `terrainRockCount(config)`, 101 slots at the defaults and
`obstacleCount` 0). Code that counts every obstacle must loop to `obsX.length` or `obstacleSlots` (collisions, ray
gathering, placement, the snapshot and `worldInfo.obstacleCount`); code that moves them loops to `config.obstacleCount`
(`moveObstacles`), which is what keeps the rocks still. `validateConfig` rejects `basins` with `obstacleCount` above 0, so
the two never mix in one world. A new loop over `config.obstacleCount` that should see the rocks is a bug that only shows
with terrain on.
