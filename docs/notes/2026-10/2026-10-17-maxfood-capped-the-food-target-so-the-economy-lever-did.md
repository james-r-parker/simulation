### 2026-10-17 - `maxFood` capped the food target, so the economy lever did nothing

The food target is `min(maxFood, max(foodTargetMin, foodTargetPerAgent x population))`. With `maxFood` 800 and a
self-sustaining population of 100 or more agents, `foodTargetPerAgent` 8 already met the cap near 100 agents, so raising
`foodTargetPerAgent` changed nothing and the economy could not grow with the population. Sweeping the economy needed
`maxFood` 1600 first (and `foodTargetPerAgent` 12). Check the cap before reading a flat result from a per-agent knob.
Recorded in E20: fed lifespan +19.4%, food +120%, births +74% against E17, population 101 to 270.
