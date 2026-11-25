### 2026-11-15 - The chase envelope: a predator cannot catch a breaking forager beyond 0.2 of its view (senses-and-motor E-SM-1)

`npm run audit:chase` on the defaults (seed 1, 4 trials per cell; record `E185`, tables under `evals/decisions/E185/`).
The prediction (a fair band between 0.6 and 1.0 of view) is falsified. Bodies: terminal speed 8 for all; sprint 12, and 14.4
for the predator; sprint turning circle 32 px (others) and 75 px (predator); stopping distance 152.

| Pursuer on evader (evader breaks across the path inside 120 px) | Catch share by view share 0.2 / 0.4 / 0.6 / 0.8 / 1.0 | Fair band |
| --------------------------------------------------------------- | ----------------------------------------------------- | --------- |
| predator on forager (also reproducer, scout, defender)          | 0.31 / 0 / 0 / 0 / 0                                  | 0.2 only  |
| predator on predator                                            | 0 at every distance                                   | none      |
| predator on forager, evader never breaks (`--straight`)         | 0.78 / 0.75 / 0.88 / 0.88 / 0.84                      | 0.2, 0.4  |

The predator's sprint edge (1.2x) is cancelled by its turning circle (75 px against 32): a forager that turns inside it is
not caught from beyond 0.2 of view. Against a straight runner a kill pays at every distance (297 to 478 spent, 638 to 781
returned). Both oracles are heuristics, so these are what the bodies allow against this evader, not bounds. The finding is
handed to [honest-budgets.md](../../designs/honest-budgets.md) and [sprint-burst.md](../../designs/sprint-burst.md); the lesson probes (T9 to T11) say
whether a real forager's senses let it do the same.
