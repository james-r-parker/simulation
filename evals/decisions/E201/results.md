# E201 - the hunt rung after nine ladder iterations: what the runs show and the levers left (training-stages Phase 6)

An outcome record, no run. It reads the ladder records E-TS-1 (E191), E-TS-1b, E-TS-1c, E-TS-1d (E194), E-TS-1f (E196), E-TS-1g (E197),
E-TS-1h (E198), E-TS-1i (E199) and E-TS-1j (E200) together (E-TS-1e, the nursery-offsets run, was never run). No gate, bar or sim rule was
changed by any of them.

## What nine iterations show

| Iteration   | Lever tried                                            | Best `hunt` reading (`prey-ahead` `winShareOverReference`, bar 0.5) | Outcome                                                    |
| ----------- | ------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| E-TS-1, 1b  | slowed prey; a contact gate (`prey-adrift`)            | 0 to 0.057                                                          | `hunt-contact` passes; `hunt` stalls                       |
| E-TS-1c     | the `hunt-weak` rung (sprint 0.2); a closed birth bias | 0.031                                                               | `hunt-weak` 1 of 4; bias falsified by its keep rule (E193) |
| E-TS-1d     | short episodes, early offer window                     | 0.031                                                               | `hunt-weak` 2 of 4                                         |
| E-TS-1f     | prey share 0.9 in the hunt worlds                      | **0.119**                                                           | `hunt-weak` 2 of 3                                         |
| E-TS-1g, 1h | a `hunt-mid` rung at 0.5, then 0.3                     | 0.087 (offset 144, 1h)                                              | rung passes on 1 offset of 4; stalls on 0 and 192          |
| E-TS-1i     | a denser nursery                                       | 0.000                                                               | falsified, reverted                                        |
| E-TS-1j     | `hunt` for up to 215 generations, resumed              | 0.087 and 0.120 (the same maxima, then lost)                        | falsified: longer does not raise it                        |

1. **No run has ever read above 0.12** on `prey-ahead` at the full sprint, whatever the schedule, the prey share, the rungs or the
   length of `hunt`. The bar (0.5) asks for a lower-bound win share of half the `memoryless` reference's (0.14 on the gate seed, 9 of 64
   trials): about 0.07, near 11 wins of 64. The best elites win 3 to 7 of 64 at the full sprint and 0 to 1 at most checkpoints
   (`graded-sprint.json`, `E-TS-1b/graded-fleer.json`).
2. **The elites never reach the jaws.** Lost trials of every `hunt` stall are `never-in-jaws` (121 to 128 of 128), not `never-bit`: the
   hunter does not close on a prey that runs. The wins climb as the prey's sprint falls (0 to 1 at 1, 3 to 7 at 0.5, 6 to 11 at 0.2, 11
   at 0.05) but an inert prey is caught on 32 to 54 of 64: the cliff is between an inert prey and a prey that moves at all, not between
   sprints. The scripted references climb the same way (the oracle 21 to 48 of 64, `memoryless` 14 to 21), so the envelope allows it.
3. **The rungs are real but do not carry.** A passer of `hunt-weak` wins 6 of 64 at 0.2 and 0.3 and 1 at 0.5; `hunt-mid` at 0.3 passes on
   the offset with a wide `hunt-weak` margin (144: 0.134, `hunt-mid` 0.040) and stalls where the margin was 0.007 (0 and 192). A rung
   passes when the elites were already past it; it adds little skill. Prey share and the offer window changed which offsets pass, not how
   many.
4. **The retention review drags runs back.** `REVIEW_GENERATIONS` 5 and `REVIEW_MAX` 3 (`js/evo/stage-gate.js`): a passed rung that
   regresses at two checkpoints sends the run back for 5 generations. In E-TS-1j it sent offset 144 to `nursery` twice (`food-behind`
   0.207, the old stall) where it stalled for good, and offset 0 to `hunt-weak` three times. In earlier runs it cycled `hunt`/`hunt-weak`
   (E-TS-1d offset 128, four times) and `hunt-mid`/`hunt-weak` (E-TS-1g and 1h). A reading that holds flat for 40 to 80 generations and
   then changes as a whole (one elite holds a cell, then a different one replaces it) is what the review reads as regression.
5. **The nursery stalls on 4 of 8 offsets** (16, 48, 64, 80) and the denser world did not fix it (E199). It is the weakest link a hunt run
   can be sent back to.
6. **`kin-spared` is -0.015 on every run that reaches `hunt`** (`bit-kin` in 125 to 128 of 128 lost trials). Kin are
   not rare there (they touch a hunter on 0.34 of hunter-ticks in `hunt`, recoil 1.74 energy per hunter-tick) but the elite wants BITE on
   0.80 of kin-close ticks and 0.66 elsewhere (E196): a 14-point signal under general blind biting (E192).

## Biology

- **Hunters do not win a chase by speed alone.** A cheetah, wolf or lion catches 10 to 40% of the chases it starts (success rates across
  the large carnivores), and wins by (a) stalking to inside striking range before the prey flees, (b) endurance against a prey that
  sprints in a burst and tires (wolves on elk, hunting dogs on antelope), (c) cooperation (a pack turns the prey toward a flanker), and
  (d) selecting the young, old and the weak. The hunt here asks for none of (a) to (d): the stage prey sprints at full boost with no tiring,
  the hunter is a single one, and the hunt world gives no stalk to learn in.
- **Prey sprint in bursts and pay for it.** Gazelles and hares run flat out for seconds, then stop or break; the sprint costs a stamina
  the pursuer can outlast. A prey whose sprint is free (as `sprintBoost` here, drawn on energy only) is an opponent that nature does
  not produce, and the gap from a 0.2 sprint to 1 is a gap from a fawn to a healthy adult.
- **Predators learn in a family.** Cubs hunt with adults and play-chase siblings; the adults inhibit the bite on kin and the young learn
  it by being bitten back (play-biting is stopped by the playmate's yelp). Here the kin is bitten with only a recoil to pay.

## Levers left, ranked

Config or curriculum only (no sim rule, the keep rule not needed):

1. **Keep the best passing elite through a review** (a curriculum or trainer option, not a sim rule): a review's regression reads the
   champion pick, not the archive; a stage keeps its best-passing archive as the champion source. Supported by finding 4 (the flat
   readings and the cycles); needs a small trainer change and a test, so it is a code change but not a sim rule.
2. **More offsets, fewer runs per rung**: the ladder's yield is 1 offset in 3 or 4 per rung and `hunt` has never passed. Running 8 to 12
   fresh offsets on the current ladder and resuming only the ones that reach `hunt` with a wide margin (offset 144's 0.040 at `hunt-mid`)
   is the cheapest read of the spread. Supported by finding 3; a cost of runs, no change.
3. **A stalk rung**: the cliff in finding 2 is between an inert prey and one that moves; `hunt-contact` (inert) to `hunt-weak` (0.2) skips it. A stage prey is a brain, not a script, so no config key gives a prey that stays still until the hunter is near; the lever needs a scripted stage prey, which the plan refuses ("Scripted sparring partners in a stage world are not built"), so it is listed as blocked by that decision, not as config-only.
4. **Pool opponents in `hunt`** (the `pool` curriculum share, already a config key): founders drawn from earlier champions, so the
   prey the hunters face are the foragers that survived the last stage. Untested here; weakly supported (cross-play exists as a
   detector).

Needs a sim rule or a keep-rule read:

5. **Prey stamina** (the sprint spends a budget that refills slowly, so a prey cannot hold full sprint): the biology above; changes the
   default world, so the keep rule on 64 matched floor-on seeds (`eval:compare --keep-rule`) and a scene metric (`eval.chase_catch_share`,
   `eval.pursuit_kill_share`) first; `rulesHash` moves, so `season/next`.
6. **Hunter stamina or a hunter burst** (the symmetric lever: the hunter's sprint also spends a budget and is cheaper at the strike):
   the same read; the cheetah's burst is the model. It affects every hunter in the live world.
7. **T44, the innate kin inhibition** (an innate ceiling on the kin-to-BITE weight): addresses finding 6 only, a sim rule behind a new
   config key; keep rule and a scene metric first. The kin lesson is not what blocks `prey-ahead`.

The order follows how much of the stall each addresses: 1 and 2 fix the loss of progress by the review and the offset spread;
5 and 6 address the cause (a chase that cannot be closed); 4 is a cheap test and 3 is blocked by a plan decision; 7 addresses a separate gate.

## Task rows

T59 to T63 in training-stages Phase 6, proposed.
