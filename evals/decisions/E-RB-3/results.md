# E-RB-3 - the scout budget on the defaults and the five fair-chase arms

`npm run role:budget -- --rows scout:predator --check` on the default config and on each arm of `evals/fair-chase/`
(`control`, `courser`, `even`, `long`, `stalker`). The reports are `<arm>.txt` (the matrix, the chain and the cross-check,
which exits 0 on every arm: no reading outside its tolerance) and `<arm>.json`. Every row is read with every effect off (the
user's rule of 2026-11-21): `alarmBiteShare` is 1 and the scout's call multipliers are 1.

The scene is the one of `warnTimeline`: a hunter creeps at its cruise speed (8 px a tick) up on a forager, the scout (at the
forager, `defenderGap` of 150 px from it for the hearing) sees it at 445 px (its reach of 400 plus the hunter's size of 45) and
calls alarm 2 ticks later, the forager hears 1 tick after that, moves 2 ticks after hearing, turns 11 ticks to face away from
the hunter (it grazes side-on: 90 degrees) and runs. The forager runs at tick 16, 317 px from the hunter. Cells are slack in
ticks (`X` impossible, `-` not read, `!` tight).

| Arm      | see | hear | warn | turn | run | Status     | Binding | The hunter closes on the forager from |
| -------- | --- | ---- | ---- | ---- | --- | ---------- | ------- | ------------------------------------- |
| defaults | 12  | 9    | 7    | 9    | 9   | ok         | warn    | 243 px                                |
| control  | 12  | 9    | 7    | 9    | 9   | ok         | warn    | 243 px                                |
| courser  | 12  | 48   | 7    | -    | X   | impossible | run     | 953 px                                |
| even     | 12  | 48   | 7    | -    | X   | impossible | run     | 481 px                                |
| long     | 12  | 48   | 7    | -    | X   | impossible | run     | 633 px                                |
| stalker  | 12  | 0!   | 7    | 0!   | 0!  | tight      | hear    | 311 px                                |

## Reading

- **The prediction held:** the row is green at the defaults and red on the arms where the hunter closes. At the defaults the
  forager is 317 px from the hunter when it runs and the hunter closes on a forager only from 243 px or less, so the margin is
  74 px, 9 ticks of the hunter's creep.
- **The warning is not what saves the forager at the defaults.** A forager that sees the hunter itself, at 345 px, is already
  beyond 243 px: the `predator:forager` row is red (E-RB-1). The scout's contribution is the lead alone: it sees the hunter 100
  px (12 ticks) before the forager would, the alarm is heard 7 ticks before the forager's own sight would have started it, and
  that is the `warn` cell, the binding step.
- **Where the hunter does close (`courser`, `even`, `long`), the scout cannot save the forager.** The chain costs it 40 px
  before it starts to turn and 88 px before it runs, and the hunter closes from 481 to 953 px; no delay in the chain matters
  when the forager's gap is 317 px. The `hear` cell reads 48 there: with `run` impossible it is the audible window of the
  call at 150 px (the call is above 0.1 for 48 ticks after the alarm).
- **`stalker` is the one arm on the edge:** the hunter closes from 311 px and the forager runs from 317, 6 px of margin,
  under one tick, so `run`, `turn` and `hear` read `0!`.
- **The scout's lead is two numbers:** `see` is the scout's `visionRange` less the forager's rear reach (400 against 300 px) over
  the hunter's speed, 12 ticks. The 11 ticks of the forager's turn and the 5 ticks of the chain (2 + 1 + 2) cost more than it.

## What the numbers do not say

- The scout and the forager are one point on the hunter's line of approach; the plan's formulas are one-dimensional. The scene
  puts the scout 150 px to the side of the forager and 26 px nearer the hunter so that it sees it at 445 px on tick 0; the
  hearing is the distance of 150 px (152 px in the scene, the same loudness at every tick that matters).
- The formula holds the forager still while it turns. In the sim it moves as it turns and gains on the hunter: its gap when it has
  turned is 342 px, not 317 px. The cross-check reads that the scene is never worse for the forager than the formula; the
  formula is the conservative one by about 25 px.
- The formula is a bound, as the `broken` bound of Phase 1 is: on `even` it says the warned forager is caught (the hunter closes
  from 481 px) and the oracle forager escapes in the scene. The cross-check reads the other direction, that a forager the
  formula calls safe is safe in the sim, and it is on every arm.
- The warning chain is exact: the alarm, the hearing, the first move and the gap then match the scene to the tick and to 1 px.
