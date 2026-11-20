# E185 - chase envelope on the defaults (senses-and-motor Phase 2, T5; plan id `E-SM-1`)

**Prediction (recorded before the run).** A predator at a sprint catches a forager from inside 0.6 of its view at every
bearing, a fair band (catch share 0.2 to 0.8) exists between 0.6 and 1.0 of view, and a kill returns more energy than the
chase costs only inside the fair band's near half.

**Run.** `npm run audit:chase -- --out evals/decisions/E185/chase.txt` (seed 1, 4 trials per cell, the defaults; the
five specialisations as evaders, the predator as the only hunter) and the same with `--straight --pairs
predator:forager,predator:predator` (`chase-straight.txt`: an evader that never breaks, the pursuer's upper bound). Both
take under 30 s.

**Bodies.** Terminal speed is 8 for all; sprint speed 12 (every non-predator) and 14.4 (predator); sprint turning circle
radius 32 for the others and 75 for the predator (`turnMultiplier` 0.7 and the speed); stopping distance 152 for all.

## Result

The prediction is **falsified**, in the pursuer's disfavour.

| Pair (oracle pursuer, oracle evader that breaks) | Catch share                                              | Fair band (of view) |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------- |
| predator on forager                              | 0.31 at 0.2 of view, 0.00 at 0.4 to 1.0                  | 0.2 only            |
| predator on reproducer, scout, defender          | as forager (the bodies are equal)                        | 0.2 only            |
| predator on predator                             | 0.00 at every distance and bearing                       | none                |
| predator on forager, evader never breaks         | 0.75 to 0.88 from 0.2 to 1.0 (0 directly behind at 0.6+) | 0.2 and 0.4         |

- A predator catches a forager that breaks only from inside 0.2 of its view, and only ahead (bearing -45 to 45). The
  predator's 1.2x sprint edge (14.4 against 12) is spent by its 75 px sprint turning circle against the forager's 32: the
  forager turns inside it. No fair band exists inside 0.6 to 1.0 of view.
- The same pursuer wins 0.75 to 0.88 of the time against a straight runner, so the oracle evader's break is what stops the
  chase, not the pursuer's speed. Both are heuristics: the table says what the bodies allow against this evader, not a
  bound on a real forager (which cannot match a full-knowledge jink).
- Energy: against a straight runner the chase costs 297 to 478 per kill and returns 638 to 781, so a kill pays at every
  distance; against the breaking runner the only kills (0.2 of view) cost 23 and return 999. The third clause of the
  prediction (pays only in the near half) is not supported: it pays everywhere a kill happens.
- Predator on predator never catches: equal sprint speed, equal turn, and the evader breaks.

## Reading

The body does not forbid a predator kill (the straight-runner column is high), and a prey with full knowledge that turns
inside the pursuer cannot be caught beyond 0.2 of view. Whether real prey can do that (their senses lose the pursuer's
bearing) is the question of the lesson probes (T9 to T11). The finding is handed to the world work
([honest-budgets.md](../../../docs/designs/honest-budgets.md), the kill; [sprint-burst.md](../../../docs/designs/sprint-burst.md), the
sprint), not tuned here. Candidate outcome for T13: the predator's 0.7 `turnMultiplier` with `sprintBoost` 1.6 makes it
the worse turner at speed; test it only with a screen.
