# E-RB-3 - the scout budget on the defaults and the five fair-chase arms

`npm run role:budget -- --rows scout:predator --check` on the default config and on each arm of `evals/fair-chase/`
(`control`, `courser`, `even`, `long`, `stalker`). The reports are `<arm>.txt` (the matrix, the chain and the cross-check,
which exits 0 on the defaults, `control`, `courser` and `long` and 1 on `even` and `stalker`: the effort-1 reading, below) and `<arm>.json`. Every row is read with every effect off (the
user's rule of 2026-11-21): `alarmBiteShare` is 1 and the scout's call multipliers are 1.

The scene is the one of `warnTimeline`: a hunter creeps at its cruise speed (8 px a tick) up on a forager, the scout (at the
forager, `defenderGap` of 150 px from it for the hearing) sees it at 445 px (its reach of 400 plus the hunter's size of 45) and
calls alarm 2 ticks later, the forager hears 1 tick after that, moves 2 ticks after hearing, turns 11 ticks to face away from
the hunter (it grazes side-on: 90 degrees) and runs. The hunter creeps until the forager moves (tick 5, 405 px) and sprints from
there, the convention of Phase 1 (the hunter acts the tick the prey is aware), so the forager runs at tick 16, 289 px from
the hunter (317 px when the hunter was left creeping until tick 16, the first draft of this scene). Cells are slack in
ticks (`X` impossible, `-` not read, `!` tight).

| Arm      | see | hear | warn | turn | run | Status     | Binding | The hunter closes on the forager from |
| -------- | --- | ---- | ---- | ---- | --- | ---------- | ------- | ------------------------------------- |
| defaults | 12  | 5    | 7    | 3!   | 3!  | tight      | turn    | 243 px                                |
| control  | 12  | 5    | 7    | 3!   | 3!  | tight      | turn    | 243 px                                |
| courser  | 12  | 48   | 7    | -    | X   | impossible | run     | 953 px                                |
| even     | 12  | 48   | 7    | -    | X   | impossible | run     | 481 px                                |
| long     | 12  | 48   | 7    | -    | X   | impossible | run     | 633 px                                |
| stalker  | 12  | 48   | 7    | -    | X   | impossible | run     | 311 px                                |

Re-run on 2026-11-21 after the Phase 3 review fixes (the hunter sprints from the forager's first move; the sign check is
two-sided at effort 1). **Verdict changes:** the defaults and `control` go from `ok` (binding `warn`) to `tight` (binding `turn`:
`hear` 5, `turn` and `run` 3 ticks, down from 9), and `stalker` goes from `tight` to `impossible` (binding `run`: the forager
runs from 281 px against a hunter that closes from 311). `courser`, `even` and `long` stay `impossible` on `run`.

## Reading

- **The prediction held, with less room.** The row is still green-ish at the defaults (`tight`, not `ok`) and red on the arms
  where the hunter closes. At the defaults the forager is 289 px from the hunter when it runs, and the hunter closes on a forager
  only from 243 px or less, so the margin is 46 px. The first draft left the hunter creeping through the forager's 11-tick
  turn (74 px of margin); a hunter that sees the forager react sprints through it, which costs the forager 28 px.
- **The warning is not what saves the forager at the defaults.** A forager that sees the hunter itself, at 345 px, is already
  beyond 243 px: the `predator:forager` row is red (E-RB-1). The scout's contribution is the lead alone: it sees the hunter 100
  px (12 ticks) before the forager would, the alarm is heard 7 ticks before the forager's own sight would have started it, and
  that is the `warn` cell. The hunter's sprint through the turn is what binds now.
- **Where the hunter does close (`courser`, `even`, `long`, and now `stalker`), the scout cannot save the forager.** The chain
  costs it 40 px before it starts to turn and about 156 px before it runs, and the hunter closes from 311 to 953 px. The `hear`
  cell reads 48 there: with `run` impossible it is the audible window of the call at 150 px.
- **The effort-1 reading is the plan's two-sided check, and it holds on four arms of six.** The formula's `catchable` is the best
  effort (about 0.36 on `even`), while the oracle hunter (`stalkerBrain`) sprints at effort 1, so the one-sided reading
  ("a forager the formula calls safe is safe") could not fail where the formula is the more pessimistic. The formula at an
  explicit `effort: 1` agrees with the sim on the defaults, `control`, `courser` (caught in both) and `long` (safe in both). It does
  not on `even` (the hunter closes from 427 px at effort 1 against the forager's 313, and the oracle forager escapes) or on
  `stalker` (311 against 305). The earlier prose blamed the `broken` bound for this; the effort mismatch explains part of it
  (at the best effort `even` reads 481 px) and the rest is the forager's start, below.
- **The scout's lead is two numbers:** `see` is the scout's `visionRange` less the forager's rear reach (400 against 300 px) over
  the hunter's speed, 12 ticks. The 11 ticks of the forager's turn and the 5 ticks of the chain (2 + 1 + 2) cost more than it.

## What the numbers do not say

- The scout and the forager are one point on the hunter's line of approach; the plan's formulas are one-dimensional. The scene
  puts the scout 150 px to the side of the forager and 26 px nearer the hunter so that it sees it at 445 px on tick 0; the
  hearing is the distance of 150 px (152 px in the scene, the same loudness at every tick that matters).
- **Known gap: the forager's turn gain and flying start.** The formula holds the forager still while it turns, and the frame
  of `maxCatchableGap` starts the prey from rest facing away. In the sim the forager moves as it turns: its gap when it has
  turned is 313 px, not 289 px (24 px of gain), and it is already moving when the chase starts. This is a change of the Phase 1
  frame (a prey start speed and position), not of the warn module, so it is recorded here and not modelled. It is the likely
  cause of the `even` and `stalker` drift at effort 1 (a hypothesis: not yet run with the forager held at rest in the scene).
- The hunter's speed at the forager's run is its sprint speed, where the frame starts it at cruise; the effect is a few px.
- The warning chain is exact: the alarm, the hearing, the first move and the gap then match the scene to the tick and to 1 px.
