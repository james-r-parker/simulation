### 2026-11-07 - Reflex cases: what a brain-only case can sense, the bars and the throughput (brain-reflex-tests Phase 1)

The six reflex cases of [brain-reflex-tests.md](../../designs/brain-reflex-tests.md) are built from `stageWorld`, `buildHash` and `senseAll`, so
what follows is what the sim's own sensing gives a brain, not a design choice. Each placement below was changed from the
doc's first draft because the draft's scene could not be sensed.

- **A ray hits only a target wider than the spacing between rays.** 16 rays are 22.5 degrees apart; a hunter of radius 31 at
  210 px (0.7 of a forager's view) subtends 17 degrees, so one staging in ten left it unseen on a scored tick and even the
  scripted reference failed. The hunter now closes from 0.5 to 0.3 of view and the prey stands at 0.35.
- **Pooling keeps the two strongest hits per channel, so a nearer item can hide a farther one.** A toxic food at 0.4 of view
  covers two rays and fills both food slots; the safe food behind it never reaches the brain. `pick-safe-food` stands each
  food on one ray direction at a distance where the neighbouring rays miss it (0.55 and 0.8 of view).
- **The brain's food hue is not in the `inputs` row.** Pooling reads `world.rayHue`, which `castSlot` writes beside
  `inputs`; a table that copied only `inputs` would show every food hueless. The table snapshots both.
- **A forager cannot be made too big to bite by energy.** `addEnergy` caps at the store (2000), so a forager's size stops at
  25 + 8 = 33. `couldBite` holds while the biter's size exceeds `huntSizeRatio` (0.8) of the victim's, so a hunter of size 31
  can bite any victim up to 38.75. The `prey-too-big` drill's prey (energy 3000) is size 33 and bitable: the ray shows it as
  prey, and the drill's abort win is for not biting a bitable prey. A size gene at the top gives 1.3 x 25 + 8 = 40.5, which is
  too big: `bite-discrimination` stages it that way.
- **Dead behind has no turn side.** A food at 180 degrees is on ray 8, where `turnTowards` returns +1 whichever side it is
  on; `approach-food` stops at 160 degrees and `flee-threat` asks only for thrust past 160.

Bars (reference, random mean of 64 brains, best constant brain), the same on case seeds 1, 2, 3, 101, 105 and 116 to the
precision shown unless a range is given; every case is valid (reference at least 0.9, the other two at most 0.5):

| Case                  | Reference        | Random mean  | Best constant                                               |
| --------------------- | ---------------- | ------------ | ----------------------------------------------------------- |
| `flee-threat`         | 1.00             | 0.00         | 0.00 to 0.19 (thrust alone passes the dead-behind stagings) |
| `approach-food`       | 1.00             | 0.01 to 0.04 | 0.06 to 0.25 (full thrust passes the ahead set)             |
| `pick-safe-food`      | 1.00 (hue-aware) | 0.00 to 0.02 | 0.00                                                        |
| `avoid-obstacle`      | 1.00             | 0.00 to 0.02 | 0.00                                                        |
| `approach-prey`       | 1.00             | 0.00         | 0.00                                                        |
| `bite-discrimination` | 1.00             | 0.03 to 0.11 | 0.00                                                        |

`npm run reflex -- --policy map-elites-v6 --count 8 --workers 1` (seed 1, 20000 ticks, 16 trials; the pass share and, in
brackets, the edge over the random mean):

| Genome (best elite of the policy run) | flee-threat  | approach-food | pick-safe-food | avoid-obstacle | approach-prey | bite-discrimination |
| ------------------------------------- | ------------ | ------------- | -------------- | -------------- | ------------- | ------------------- |
| forager-cell4                         | 0.44 (+0.44) | 1.00 (+0.99)  | 0.00 (+0.00)   | 0.00 (-0.02)   | -             | -                   |
| predator cell24, cell14, cell34       | -            | -             | -              | -              | 1.00 (+1.00)  | 1.00 (+0.89)        |

The run's other genomes are defenders and scouts, which have no case. The evolved predators pass both predator cases
and the one forager passes only `approach-food`: no genome passes `pick-safe-food` or `avoid-obstacle`, and the forager
turns away from a closing hunter in under half the trials. One forager is a sample of one, not a verdict on the cases.

Throughput (`npm run bench:reflex`, under `flock /tmp/claude-1000/cpu.lock` while other streams' evals ran): the four forager
cases are 12 sequences a trial (2 + 2 + 2 + 6, each with its mirror), 16 trials, 6 ticks, so 1152 brain forwards per
genome; 512 random brains in one batch took 1.9 ms a genome, **522 genomes per second**, 1.66 microseconds a forward with
the scoring. The same kind of genomes through the five forager drills at 32 trials ran at 0.67 genomes per second, so the
tier is **776 times** cheaper. The doc's first target (900) rested on 768 forwards; it is now 300, which both numbers clear.
A table costs about 0.1 s to build (one `stageWorld` per distinct tick), paid once per case, seed and trials.
