### 2026-11-06 - Why floor-off worlds collapse (T64)

Floor-off worlds collapse because pairs stop meeting once the population is small, not because food runs out. `E126` (32 seeds, `floorTrigger` 0): 19 end under 80 agents. Three of those never fill (peak 106 to 121 or 306: seeds 833553, 912822, 50850); 10 fall through 80 between 50k and 100k ticks; 6 fall between 140k and 180k. Replays (`map-elites-v6`, per-1000-tick tallies by basin, a scratch driver) of collapsing seeds 224570 and 612370, the survivor 337535, and 639124 and 888035 for contrast.

- **Food is not short.** Edible slots sit at 3,590 of `maxFood` 3,600 the whole run, total edible energy 200k to 400k, and the value per slot is steady at 55 to 120. Per surviving prey the map holds 8 slots at the 430 peak, then 50 (seed 612370, tick 46k), 160 (60k) and 700 (80k) as prey vanish. Toxic caps appear only from tick 80k (30 to 980 slots) and are a late addition, not the trigger (the E112 fix holds).
- **Hunters are not the trigger.** Hunters cause 22% of prey deaths in the crash (seed 612370 at 32k to 36k: 82 eaten, 205 starved, 84 other per 2k ticks) and then starve in turn as prey fall: hunter deaths by starvation 4 to 10 per 2k ticks while hunters fall from 52 to 4.
- **Births collapse first.** Seed 612370, prey only, per 2,000 ticks:

| Tick | Prey | Hunters | Prey mate / split births | Prey deaths starved / eaten / other | Mean prey energy |
| ---- | ---- | ------- | ------------------------ | ----------------------------------- | ---------------- |
| 30k  | 446  | 30      | 262 / 6                  | 124 / 14 / 56                       | 912              |
| 34k  | 301  | 40      | 89 / 73                  | 98 / 92 / 48                        | 911              |
| 38k  | 207  | 52      | 30 / 58                  | 74 / 18 / 41                        | 832              |
| 42k  | 98   | 47      | 2 / 32                   | 45 / 9 / 14                         | 651              |
| 46k  | 55   | 37      | 0 / 25                   | 11 / 7 / 7                          | 891              |
| 50k  | 60   | 35      | 8 / 7                    | 17 / 1 / 2                          | 808              |
| 56k  | 40   | 28      | 1 / 6                    | 11 / 4 / 7                          | 1030             |
| 62k  | 24   | 17      | 0 / 11                   | 4 / 0 / 0                           | 1230             |
| 70k  | 15   | 10      | 0 / 0                    | 2 / 0 / 0                           | 1078             |

Seed 224570 shows the same shape (prey 351 at 29k, 125 at 50k, 61 at 65k, 15 at 92k; mate births 104 per 3k ticks fall to 4). Prey mate births drop to zero at 55 prey in a 14,400 x 8,100 world, and splitting cannot replace them: a prey line splits at most `splitClonalMax` (3) times in a row before it must mate, and a split needs `splitMateScarceTicks` without a mate in view. At 44k to 52k about half of the adult prey (26 to 30 of 53 to 56) are at the clonal cap and only 18 to 25 hold more than `splitMinEnergy` (900). Prey meet no one, so they neither mate nor split. The survivor holds 200 to 450 prey and 10 to 25 mate births per 1k ticks the whole run; its hunters alone fell (127 to 49 by 80k) without the world falling with them.

- **Per-agent intake falls with density** (plant energy per agent per 1k ticks): seed 612370 440 at 427 agents, 282 at 95, 155 at 31; the survivor 530 at 300. This is the second half of the loop: a lone forager finds less (no herd, no flock to follow), starves at about the same rate, and the next birth is further away.
- **Controlled reruns** (floor off, 80,000 ticks, total population):

| Arm                            | 612370 at 50k / 80k | 224570 at 50k / 80k |
| ------------------------------ | ------------------- | ------------------- |
| defaults                       | 91 / 7              | 175 / 71            |
| `splitClonalMax` 100000        | 72 / 247            | 152 / 25            |
| `mateRange` 900                | 454 / 432           | 397 / 450           |
| `splitClonalMax` + `mateRange` | 27 / 333            | 125 / 136           |

A longer mate search keeps both collapsing worlds at 430 to 450 through 80k ticks. Lifting the clonal cap alone does not (seed 224570 still falls to 25). Single seeds and one 80k window, so this names the cause and a lever to screen, not a result: the full 200k and 8 or 16 seeds are the T65 screen.

- **Why the floor hides it.** With the floor on, a world under 40 is refilled with fresh lineages, so the mating collapse looks like a dip (2 of 16 seeds under 80) while the same dynamics run underneath. The floor-off world is the honest test of this loop.
- **Ranked causes.** (1) The mating Allee effect: prey density falls below the distance at which `mateRange` 200 (edge-to-edge) finds a partner, mating births go to 0, the clonal cap and the mate-scarcity rule stop splitting from replacing them. (2) A hunter-prey overshoot starts the fall: hunters rise from 7 to 40 or more while prey fall from 430 to 100, then follow them down. (3) Late, in 6 seeds, autumn toxic caps and winter finish remnants of 8 to 60 agents. Not causes: food supply, herd grazing (47 herd animals steady), the season drain (onsets at tick 30k to 44k straddle spring and summer in different seeds).
- **Nature's answers, as candidate levers.** Animals meet at low density with long-range signals (calls, pheromone trails, leks), by ranging wider when alone, by aggregating at refuges (herds, a breeding ground), and by facultative selfing or parthenogenesis (already the shark rule here, but capped at 3). Candidates: a longer mate search when no partner has been seen for a while (density-dependent range), a mate call or scent a female can follow, and an Allee-safe split cap (reset the clonal count after a long mate drought). T65 screens these.
- **Method trap.** `npm run replay --policy` takes a registry name (`map-elites-v6`), not `live`; the diagnosis used a scratch driver with the same policy. Division by basin used the x position of the tick before the death, since `freeAgent` zeroes the slot.
