### 2026-10-23 - Why hunting fails (fitness-and-selection T15k)

The rules do not block kills; the evolved predators do not hunt. A scripted `hunter` controller (`js/evo/scripted-combat.js`: steer at the nearest "I can bite it" ray, sprint, bite) driving every predator of the live world gets 1.68 kills per 1000 predator-ticks, against 0.002 for the evolved predators of the same seeds and config: about 1000 times more. Method: the T15g arm `kill150-passive0.6-split0.6` (its `config` from `evals/screens/results/predator-economy/kill150-passive0.6-split0.6.report.json`, policy `map-elites-v1q`) on seeds 174238, 200460 and 597883 (three of the grid's four), with a read-only probe outside the sim that looks at every predator each tick: its nearest biteable agent, the ray hit, heading error and outputs, and a chase per predator-prey pair (the prey within the predator's vision, gaps up to 15 ticks allowed). The first 5000 ticks are discarded. "Evolved" is the unmodified arm for 60000 ticks; "scripted" is the same world for 30000 ticks with the `canHunt` agents' outputs replaced by `hunter` through `createControllerBrain` (arms `{ canHunt: 'hunter', rest: 'random' }`, so the prey keep their own evolved brains). Pooled over the three seeds:

| Pooled over 3 seeds       | Evolved predators | Scripted `hunter` |
| ------------------------- | ----------------- | ----------------- |
| Predator-ticks measured   | 595000            | 1587000           |
| Chases                    | 919               | 19302             |
| Reached contact           | 242 (26%)         | 9260 (48%)        |
| Bitten at least once      | 28 (3%)           | 6836 (35%)        |
| Killed                    | 1 (0.1%)          | 2666 (14%)        |
| Bites                     | 118               | 134954            |
| Kills per 1000 pred-ticks | 0.002             | 1.68              |

The seeds agree: per seed (174238, 200460, 597883) the scripted rate is 1.73, 0.90 and 1.65 kills per 1000 and the evolved rate 0, 0 and 0.005. The scripted predators breed (about 47, 3 and 13 alive on average against about 3 evolved), so the two worlds are not the same economy; the contrast is in rates per predator-tick and per chase.

What the evolved and the scripted predator do (range over the three seeds; "in vision" is a biteable agent within the predator's vision):

| Measure                                                  | Evolved                 | Scripted                |
| -------------------------------------------------------- | ----------------------- | ----------------------- |
| Mean predator speed (px/tick)                            | 1.0 to 1.3              | 5.6 to 6.5              |
| Mean prey speed (px/tick)                                | 1.8 to 2.8              | 2.2 to 2.3              |
| Predator mean energy / size                              | 241 to 1360 / 26 to 31  | 636 to 2160 / 29 to 38  |
| Prey mean energy / size                                  | 438 to 2080 / 26 to 33  | 452 to 483 / 27 to 28   |
| Predator-ticks with a biteable agent in vision           | 0.05 to 0.27            | 0.15 to 0.59            |
| Heading within 0.4 rad of the prey, chase ticks          | 0.11 to 0.22            | 0.47 to 0.59            |
| (a random heading gives)                                 | 0.13                    | 0.13                    |
| Touching a biteable prey, per in-vision tick             | 0.014 to 0.090          | 0.17 to 0.26            |
| Prey in the jaws, given touching                         | 0.04 to 0.40            | 0.88 to 0.92            |
| `BITE` output on, given touching and in the jaws         | 0.00 to 0.12            | 0.82 to 0.91            |
| Prey sees the predator (threat ray), within 200 px       | 0.80 to 0.88            | 0.65 to 0.74            |
| Prey heading away from the predator (cosine), within 200 | -0.04 to 0.04           | 0.37 to 0.46            |
| Prey sprinting, within 200 px                            | 0.41 to 0.54            | 0.14 to 0.17            |
| Predator vision / prey vision (px)                       | 345 to 353 / 311 to 344 | 290 to 361 / 317 to 369 |

The `eval.*` intent counters of the arm agree: `eval.pursuit_bite_share` 0.08 on average (0, 0, 0.21 and 0.09 by seed), `eval.pursuit_kill_share` 0 on 4 of 4, `eval.hunt_call_answer` 0.00003, `eval.undefended_bite_share` 0.93 and `eval.escape_rate` 0.73.

Speeds and costs (`js/sim/physics.js`, `js/sim/energy.js`, default config). The no-sprint cap is `maxVelocity` 8 for every body; the sprint cap is 8 x (1 + 0.5 x `sprintBoost`), so 14.4 for the predator (`sprintBoost` 1.6) and 12 for the rest, a margin of 20%. A tick costs `movementCost` 0.015 x speed^2, plus `sprintCost` 0.05 while sprinting, plus a standing term of about 0.05, so moving is the cost:

| Speed (px/tick)                             | 2    | 5    | 8    | 12   | 14.4 |
| ------------------------------------------- | ---- | ---- | ---- | ---- | ---- |
| Move cost per tick                          | 0.06 | 0.38 | 0.96 | 2.16 | 3.11 |
| Total per tick (standing 0.05, sprint 0.05) | 0.16 | 0.48 | 1.06 | 2.26 | 3.21 |
| Ticks a 241-energy predator can hold it     | 1500 | 500  | 230  | 107  | 75   |

A scripted chase takes a median 30 ticks (killing chases 70) at about 7 px/tick, so about 24 energy per chase and 170 per kill (7 chases per kill); a kill returns about 20 bites x 20 plus 150 plus the carcass, over 550. Hunting pays for a predator that does it; the evolved ones, at 1.2 px/tick, spend almost nothing and find almost nothing.

Bites per kill is large. A bite takes `biteEnergy` 5 x `biteMultiplier` 4 = 20 and prey carry 350 to 2000 energy, so a kill needs 18 to 100 bites in contact and in the jaws. Scripted killing chases took a median 7 bites when the prey held under 300 energy, 18 (300 to 600), 33 (600 to 1000), 54 (1000 to 2000) and 103 (above 2000), and the share of bitten chases that end in a kill falls with it: 65%, 55%, 44%, 30% and 16%. The evolved chases that were bitten at all had a median of 1 to 2 bites. The kill payment (150) is under a third of a kill's income and arrives on a tail event, which is why `predatorKillEnergy` moved nothing in T15g.

Size gate. `couldBite` needs `size[biter] > huntSizeRatio x size[victim]`, and `size = baseSize + energy / 250`, so a poor predator is a small one. Of the non-hunter agent-ticks within a predator's vision, the biteable share is 40%, 23% and 39% for the evolved predators (seeds 200460, 597883, 174238) and 63%, 62% and 63% for the scripted ones. `huntSizeRatio` cannot go below 1 (`config-validate.js` wants a number of at least 1). Had it been 0.9 the evolved shares would be 83%, 58% and 66%, and 100%, 79% and 83% at 0.7 (from the probe's size histogram of prey size over predator size).

Mechanism, in the order of the chain a predator must complete:

1. **Steering and approach (skill).** Evolved predators move slowly (about 1.2 px/tick against 1.8 to 2.8 for prey) and point at the prey no better than chance. A biteable agent is in vision on 5% to 27% of their ticks.
2. **Size (rule).** Most prey a poor predator sees are as large as it is or larger, and cannot be bitten.
3. **Contact in the jaws (rule and skill).** Reach is the contact list: `resolvePair` records a pair only when the circles overlap and `feed` bites over that list, so there is no reach beyond touching, and the victim's centre must be within `biteArc` (45 degrees) of the heading. A body that touches at a random heading is in the jaws a quarter of the time; the evolved predators measured 4% to 40%, the scripted 88% to 92%.
4. **Bite output (skill).** Touching and in the jaws, the evolved `BITE` output is on in 0% to 12% of ticks; the scripted in 82% to 91%.
5. **Staying in contact for 18 to 100 bites (rule).** A bitten prey flees and nothing slows it. The scripted `hunter` closes at 0.2 to 0.6 px/tick on prey that flee at 5 to 6 px/tick, 65% of its chases end without a bite and 21% with a bite and no kill.
6. **No step towards hunting before the first bite (inference).** A predator that does not move does not starve faster for it, and a half-aligned approach earns nothing, so selection has only the first bite to reward. This is not measured.

Ranked by evidence (what keeps the kills from happening; none of the rules blocks a competent hunter):

1. **Evolved predators do not pursue or bite** (skill, not a rule): 1000 times the kill rate for the scripted contrast, chance-level heading, speed 1.2, bite output off at contact. Direct, three seeds, same rule set.
2. **Size gate**: 60% to 77% of the prey a poor predator sees cannot be bitten, and a predator that does not eat stays small. Direct (the size histogram). A rule only because `huntSizeRatio` has a floor of 1.
3. **Contact-only reach and the 45-degree jaws**: a chance contact turns into a bite 4% to 40% of the time (jaws) times 0% to 12% (output). A random-walk predator touches a biteable prey on 1.4% to 9% of its in-vision ticks. Direct for the rates; that a wider arc teaches hunting is not shown.
4. **Bites needed per kill** (18 to 100 against a median of 1 to 2 landed): it explains the idle kill payment, not the absence of bites, since each bite pays 20.
5. **Prey detection and flight**: prey see the predator on 65% to 88% of near ticks, but only the prey of the scripted world flee (cosine 0.37 to 0.46); against evolved predators they do not (about 0). Equal ranges (about 350 against about 330) give the hunter no edge, and scripted hunters still win 14% of chases. Not a block.
6. **Speed and sprint**: the 20% edge of the predator's sprint cap is thin (the scripted hunters close at 0.2 to 0.6 px/tick) but enough to kill. Not a block. The cost of running (0.96 per tick at 8 px/tick, 3.1 at the cap) is why a poor predator that sprints starves in a few hundred ticks.

Uncertain: the scripted world's population differs from the evolved one, so only rates per predator-tick and per chase are compared; the evolved sample is small (1 kill and 28 bitten chases in 595000 predator-ticks); a wider jaws arc run (`biteArc` 90 degrees, 60000 ticks, seeds 174238 and 200460) gave 35 and 36 bites against 111 and 0, which is noise at this length and says nothing about evolution, so the T15l levers are proposals from the mechanism, not measured effects. The probe is a scratch script, not committed; the numbers are not in a report file.
