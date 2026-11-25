### 2026-10-22 - The population-scaled food rule makes a thin population starve faster (an Allee effect)

`populationExpected` targets `max(foodTargetMin, foodTargetPerAgent x population)` items, so the food per area is
proportional to the population. At `minAgents` 40 the per-agent starvation rate is 0.21 per 1000 agent-ticks against 0.12 at 100,
and births/1k fall from 0.15 to 0.05, so the floor never lets go. `foodTargetMin` 1200 (the stock at 100 agents) lets a 40-agent
world take off in 25000 ticks on one seed. The area rule (`foodAreaCapacity`) has no population term and does not show it:
all features on with `minAgents` 40 reaches `maxAgents` within 20000 to 50000 ticks. Read a floor-bound result against the food
rule before blaming the feature.
