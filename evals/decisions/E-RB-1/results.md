# E-RB-1 - the hunter budget on the defaults and the five fair-chase arms

`npm run role:budget` on the default config and on each arm of `evals/fair-chase/` (`control`, `courser`, `even`, `long`,
`stalker`), with `--search` and `--check`. The reports are `<arm>.txt` (the matrix, the detail, the search and the
cross-check, which exits 0 on every arm: no reading outside its tolerance) and `<arm>.json`; the override files the search
wrote are in `evals/role-budget/` (`<arm>-predator-<prey>-<k>.json`, the smallest change first, read by
`npm run audit:chase -- --config <file>`). `control` is the defaults (the store off), so its rows repeat them.

The prediction held: the plan said rows come out red at the defaults, and all four prey rows of the defaults are
`impossible` on the run step. Cells are slack in ticks (`X` impossible, `-` not read, `!` tight); the catch margin and the tier
margins are px on the broken bound at the hunter's own bearing 0, a perfect hunter creeping to the prey's rear reach.

| Arm      | Row                 | see | turn | run | bite | Status     | Catch margin px | perfect / reactive / naive, broken px | Learn slope | Fit | Audit bearings closing |
| -------- | ------------------- | --- | ---- | --- | ---- | ---------- | --------------- | ------------------------------------- | ----------- | --- | ---------------------- |
| defaults | predator:forager    | -   | -    | X   | X    | impossible | -102            | -102 / -58 / -270                     | naive       | no  | 0                      |
| defaults | predator:reproducer | -   | -    | X   | X    | impossible | -52             | -52 / -8 / -218                       | naive       | no  | 0                      |
| defaults | predator:scout      | -   | -    | X   | X    | impossible | -187            | -187 / -146 / -368                    | naive       | no  | 0                      |
| defaults | predator:defender   | -   | -    | X   | X    | impossible | -285            | -285 / -208 / -210                    | naive       | no  | 0                      |
| defaults | predator:average    | X   | X    | X   | X    | impossible | -               | catchable share 0                     | -           | -   | -                      |
| defaults | predator:best       | -   | -    | X   | X    | impossible | -               | picks forager                         | -           | -   | -                      |
| courser  | predator:forager    | 179 | 63   | 179 | 174  | ok         | +601            | +601 / -58 / +273                     | reactive    | no  | 0.875                  |
| courser  | predator:reproducer | -   | -    | X   | X    | impossible | -52             | -52 / -8 / +323                       | reactive    | no  | 0.5                    |
| courser  | predator:scout      | 159 | 49   | 159 | 158  | ok         | +503            | +503 / +400 / +173                    | ok          | yes | 0.625                  |
| courser  | predator:defender   | -   | -    | X   | X    | impossible | -285            | -285 / -208 / +330                    | reactive    | no  | 0.5                    |
| courser  | predator:average    | 85  | 28   | 85  | 83   | ok         | -               | catchable share 0.5                   | -           | -   | -                      |
| courser  | predator:best       | 179 | 63   | 179 | 174  | ok         | -               | picks forager                         | -           | -   | -                      |
| even     | predator:forager    | 179 | 4!   | 179 | 174  | tight      | +83             | +83 / -58 / +38                       | reactive    | no  | 0.125                  |
| even     | predator:reproducer | -   | -    | X   | X    | impossible | -52             | -52 / -8 / +88                        | reactive    | no  | 0                      |
| even     | predator:scout      | -   | -    | X   | -    | impossible | -17             | -17 / -146 / -55                      | reactive    | no  | 0                      |
| even     | predator:defender   | -   | -    | X   | X    | impossible | -285            | -285 / -208 / +69                     | reactive    | no  | 0                      |
| even     | predator:average    | 45  | 1!   | 45  | 44   | tight      | -               | catchable share 0.25                  | -           | -   | -                      |
| even     | predator:best       | 179 | 4!   | 179 | 174  | tight      | -               | picks forager                         | -           | -   | -                      |
| long     | predator:forager    | -   | -    | X   | X    | impossible | -102            | -102 / -58 / -153                     | naive       | no  | 0                      |
| long     | predator:reproducer | -   | -    | X   | X    | impossible | -52             | -52 / -8 / -104                       | naive       | no  | 0                      |
| long     | predator:scout      | -   | -    | X   | X    | impossible | -187            | -187 / -146 / -254                    | naive       | no  | 0                      |
| long     | predator:defender   | -   | -    | X   | X    | impossible | -285            | -285 / -208 / -98                     | naive       | no  | 0                      |
| stalker  | predator:forager    | -   | -    | X   | -    | impossible | -34             | -34 / -66 / -269                      | naive       | no  | 0                      |
| stalker  | predator:reproducer | 3!  | 0!   | 3!  | >200 | tight      | +19             | +19 / -16 / -213                      | naive       | no  | 0.125                  |
| stalker  | predator:scout      | -   | -    | X   | -    | impossible | -124            | -124 / -153 / -363                    | naive       | no  | 0                      |
| stalker  | predator:defender   | -   | -    | X   | X    | impossible | -6              | -6 / -62 / -210                       | naive       | no  | 0                      |

The `long` and `stalker` average and best rows are impossible and the `control` rows repeat the `defaults`; the per-arm files hold
every row.

## Reading

- **Defaults and `control`:** every prey row is impossible. The `straight` bound is positive (a perfect hunter closes it, +408 px
  against the forager) and the `broken` one is not (-102 px): the hunter reaches the forager and cannot hold it through the
  oracle's break. The sim agrees: `audit:chase` reads 0 catches at 160 px and beyond. The naive tier never touches the prey at the
  drill gap, so the slope fails at `naive`.
- **`courser`:** the forager and the scout are catchable (+601 and +503 px), the reproducer and defender are not. Only the scout row
  is fit for the rung screen. The forager row is catchable but `learnSlope` names `reactive`: the reactive hunter (sprinting from
  sight at effort 1) closes the broken bound by less than the naive one (-58 against +273), because it arrives at 14 px a tick and
  cannot turn through the break.
- **`even`:** the forager row is catchable by +83 px and tight on the turn (4 ticks); not fit, for the same reason.
- **`long`, `stalker`:** the forager is impossible; `stalker` catches the reproducer by +19 px (tight).
- **The gate of fair-chase.md T8** (an arm that leaves `predator:forager` catchable on the broken bound with a margin above 0):
  `courser` (+601 px) and `even` (+83 px). The stricter test of the tier section (the reactive tier catchable and the slope ok) is
  met by no arm for the forager. The search names the single settings that would: on `courser`, the hunter's `sprintBoost` x1.25
  (2.0, +750 px, slope ok), its `visionRange` x0.75, `maxThrust` x1.25, `sprintFloor` x1.25 or the forager's `sprintBoost` x1.25; on
  the defaults, the hunter's `sprintBoost` x1.5 (2.4, +1174 px) or the forager's x0.5 (+884 px).

## What the numbers do not say

- `perfect` (effort 1 from the tick the prey is aware) is not an upper bound on the broken bound: sprinting flat out overshoots the
  oracle's break, so the `naive` tier at effort 0.5 closes it where `perfect` does not (`courser` reproducer and defender). The
  oracle brain of `audit:chase` sprints at effort 1 too, which is why the formula agrees with it. A performer that chooses its effort
  (the best of a grid) would be the upper bound; the plan asks for effort 1 and it is not changed here.
- The cross-check agrees with the sim cell by cell: 40 cells per bound per arm, kills within 2 ticks everywhere, the same fair band
  at every start distance. The one disagreement is a start at exactly the hunter's view (the float32 sprint gate), flagged as the
  edge.
