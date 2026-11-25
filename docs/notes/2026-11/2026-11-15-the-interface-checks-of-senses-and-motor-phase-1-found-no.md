### 2026-11-15 - The interface checks of senses-and-motor Phase 1 found no sign or class bug

`test/sim/interface.test.js`, `interface.slow.test.js` and `interface-motor.test.js` stage one subject and one item per
channel in an empty arena. Every check passed on the first run: a body dead ahead reads cosine 1 and sine 0 on its
channel (food, threat, prey, other, kin, obstacle, smoke; the wall separately), the sign of the pooled sine is the side
`TURN` above 0 turns towards (so the hunt, flee and food reflexes of `applyInstinct` turn the right way, lead L9),
mirroring flips every sine and the two lateral body inputs and nothing else, rotating or shifting the scene with the
subject leaves the row equal, strength rises with nearness (a ray ends on an item's edge), a body that is kin and a
threat lands on `kin`, and one that is a threat and prey lands on `threat`. There is no JS path to compare: the ray
march and the pooling were deleted when the kernels were adopted. The herd (`megafauna`) channel is not staged.

Findings, each recorded and none fixed here (a fix changes what a brain reads or does, so it moves the golden hashes and
waits for the honest-budgets switch; candidates for T13):

- **F1: the velocity inputs leave [-1, 1].** `writeBodyInputs` divides the forward and lateral velocity by
  `maxVelocity`, but a sprint raises the speed cap to `maxVelocity x (1 + sprintMultiplier x sprintBoost)` (1.5 for a
  forager, 1.8 for a predator), so inputs 1 and 2 of the body block reach 1.8 (the 2000-tick default world showed -1.5 to
  1.28). `poolRays` documents "every value lies in [-1, 1]". The size input also reaches 1.004 (the size trait). Failing
  case: sprint a predator for 200 ticks and read `bodyInput(row, 1)`, which is 1.8. Proposed fix: divide by the sprint
  cap of the agent's own spec, or clamp; it changes an input's meaning, so a new layout name.
- **F2: three of the actions fire above a threshold, not above 0.** `OUTPUT_INDEX` and lead L1 say an action fires when its
  output is above 0. That holds for `BITE`, `SPRINT` and `MATE`. The alarm, hunt call and smoke fire above
  `alarmThreshold` (0.65), `huntCallThreshold` (0.65) and `smokeThreshold` (0.8) and only off cooldown, so they do not
  chatter at 0. The thresholds are compared as doubles against a `Float32Array` output, so an output written as exactly
  0.8 reads 0.800000011920929 and fires. Proposed fix: correct the `OUTPUT_INDEX` comment and lead L1 (no behaviour).
- **F3: `THRUST` saturates at 0.6.** At temperature efficiency 1 the uncapped terminal speed is
  `damping x maxThrust x THRUST / (1 - damping)` = 13.3 x `THRUST`, above `maxVelocity` (8) from `THRUST` 0.6, so every
  thrust from 0.6 to 1 gives the same speed after about 20 ticks, and a sprint's cap (12, 14.4) is reached only by a
  sprint. Reverse thrust is as strong as forward (`THRUST` -1 gives the mirror velocity), and turning has no inertia
  (`TURN` sets the heading change outright): both pinned, as lead L4 asks the chase envelope to weigh.

Every multiplier on thrust and turn against the input that tells the brain of it (lead L8). The state is sensed when an
input is a function of it, and the brain's own outputs reach it only through its hidden state and the two memory
outputs:

| Multiplier (`thrustOf`, `actAll`, `moveAgentsKernel`)                | Default                 | Brain input that tells it                                         | Sensed |
| -------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------- | ------ |
| Temperature efficiency (`thrustEfficiency`)                          | 1 at start              | Temperature inputs 13 to 16 (level, distance from band, stress)   | yes    |
| Graze (`BITE` above 0, a non-hunter): `grazeThrust`                  | 0.6                     | None; the brain's own last output is not an input                 | no     |
| Sprint (`SPRINT` above 0): `1 + sprintMultiplier x sprintBoost`      | 1.5 forager, 1.8 hunter | None for the output; the speed it gives is read (input 1)         | effect |
| Rest after a kill (`restTimer`, `predatorRestTicks`)                 | 60 ticks at 0 thrust    | None                                                              | no     |
| Handling a meal (`ateTimer` under `handlingTicks`): `handlingThrust` | 0.2 for 20 ticks        | Input 9, `1 - ateTimer / 30` (falls from 1 to 0.33 over 20 ticks) | yes    |
| Sickness (`dose` at `sickDose`): `sickThrust`                        | 0.4                     | None (the dose is not an input)                                   | no     |
| Fat (`fatSlowShare x energy / maxEnergy`), thrust and turn           | 0.5                     | Energy input 0                                                    | yes    |
| Turn multiplier (`turnBySpec`)                                       | 1, predator 0.7         | Spec input 11 (`spec / 4`); turn-rate input 3 reads the result    | yes    |
| Speed cap while sprinting (`move_agent`)                             | 8 x 1.5 or 8 x 1.8      | Input 1 (above 1, finding F1)                                     | effect |

The rest timer and sickness change the body with no input of their own; the plan holds them until a lesson's
oracle-to-reference gap names the missing state (Phase 4, "The body moves for reasons unsensed").
