### 2026-11-05 - E110 ledger and floor-off reading: the floor holds the whole world, not only the hunters

T54 asked whether the hunter gains of E103 and E105 were the floor guard restocking. They partly were, but the larger finding is that no world on the current defaults survives without the floor.

- **Floor-off kills every world.** With `floorTrigger` 0, all 16 worlds go extinct, prey included, between 41k and 149k ticks. Worlds that sat at the 500 cap from 20k fall to 0 within about 30k ticks of 80k. The defaults crash the same way and the floor holds a remnant of 20 to 40; that remnant is why 0.37 of hunter births are floor births.
- **The crash is starvation, not old age.** Old age is 6 of about 85,000 deaths, so a cohort ageing out at `maxAgeTicks` is ruled out.
- **Hunter deaths (4 replays with the eval policy, 417 deaths).** 73% starved. Of those, 65% never ate (median age 956) and 35% ate and still starved (median age 3500). Movement is 0.69 to 0.74 of a hunter's spend; standing is under 0.1.
- **Kill rate by birth source** (kills per 1,000 ticks): split from a hunter 0.177, mated from a hunter 0.337 (9 hunters), spec-flip 0.060, floor 0.011. Spec-flip and floor hunters make up the zero-kill mass; hunters born to hunters do hunt.
- **Hunters die with prey present.** The poorer basin still holds a median of 15 to 30 prey when the last hunter dies.
- **Replays need the eval's policy.** `npm run replay` without `--policy map-elites-v6` runs a world with no archive. Those runs gave 994 floor-born hunters out of 1,091 and one kill, a different world from the eval's.

Consequence: hunter levers cannot be judged on floor-off until the starvation crash is fixed, so the crash comes before E109 and the T57 screen.
