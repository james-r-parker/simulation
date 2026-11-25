### 2026-10-21 - Honest ray classes

World-balance Phase 2 made the agent ray classes honest. `agentChannel` in `js/sim/ray-march.js` now asks `couldBite`
(the rule `feed` uses, without the jaws) instead of comparing sizes: a hit is kin, else "can bite me" (channel 2), else "I can bite
it" (channel 3), else other (channel 4). Class channels carry the hit's proximity; food, wall, obstacle and smoke
still carry 1. At `huntSizeRatio` 1.01 about half of all agents had read as bigger, so before this a prey saw a
threat on most rays and a hunter saw prey on most rays, whether or not either could bite. Now a prey sees only
agents that can bite it (they can hunt and are bigger by the ratio, from any angle; the first build also required the jaws to face the caster, and the user chose on 2026-10-21 that prey should know a predator from any angle), and a hunter sees only
what it can bite. The intent state's threat is the nearest channel-2 hit, so the `canHunt` scan and its grid are
gone. Mating has its own size band, `mateSizeRatio` (1.3).

- **The survivable-prey world had to be re-chosen by its criterion.** Honest classes change which agents a hunter
  treats as prey, so the Phase 1 settings no longer left prey alive on seeds 2 and 3. `evals/survivable-prey-world.json`
  now has 60 starting agents, `maxAgents` 120, 100 food and one predator in eight; the criterion in
  `test/evo/survivable-world.slow.test.js` is unchanged. One in four held until the classes moved to `couldBite`:
  once hunters see prey from any angle they multiply after the midpoint and empty the prey.
- **B20: `hunter` fails the anti-exploit suite under `fitnessV5`.** With honest classes the scripted `hunter` finds
  prey reliably, and `fitnessV5` pays a flat 720 points per kill whatever the kill brings in (legacy-audit FIT-5), so
  the intake bound is exceeded. The cause is the fitness, not the senses, so the suite marks `hunter` an expected
  FIT-5 failure under `fitnessV5` only (user); no bound was loosened.
