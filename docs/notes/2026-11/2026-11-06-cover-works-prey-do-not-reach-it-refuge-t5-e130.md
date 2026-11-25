### 2026-11-06 - Cover works, prey do not reach it (refuge T5, E130)

On 32 floor-on seeds the rings already protect and admit prey, but the Refuge scene is absent because threatened prey are
not near a ring. Bites per prey-tick inside a ring are 0.12 of the outside rate, 64% of prey ticks are at a size that fits
(T3: radius 20 to 32 enter from every angle; `obstacleBounce` lets a body squeeze a 60 px gap), and 64% of ring exits
lead to a meal, yet `eval.refuge_use_under_threat` is negative on all 32 seeds (-0.0024) and a threatened prey is no
likelier to enter than a calm one. The eight rings are 0.94% of the map. The bite guard and wider gaps were dropped from
refuge.md before they were built; the screen tests reach first (`refugeCount` 16 and 24) and concealment.

Also: the first 16 seeds of `evals/seeds.json` are kinder than the next 16 - floor-on worlds end under 80 agents on 2 of
seeds 1 to 16 and on 8 of seeds 17 to 32. Read 16-seed absolute health figures as optimistic; matched-seed comparisons
are unaffected.
