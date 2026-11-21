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
| courser  | predator:forager    | 163 | 74   | 163 | 157  | ok         | +609            | +609 / -58 / +273                     | reactive    | no  | 0.875                  |
| courser  | predator:reproducer | 173 | 81   | 173 | 167  | ok         | +659            | +659 / -8 / +323                      | reactive    | no  | 0.875                  |
| courser  | predator:scout      | 146 | 55   | 146 | 145  | ok         | +510            | +510 / +400 / +173                    | ok          | yes | 0.875                  |
| courser  | predator:defender   | 174 | 81   | 174 | 166  | ok         | +662            | +662 / -208 / +330                    | reactive    | no  | 0.875                  |
| courser  | predator:average    | 164 | 73   | 164 | 159  | ok         | -               | catchable share 1                     | -           | -   | -                      |
| courser  | predator:best       | 173 | 81   | 173 | 167  | ok         | -               | picks reproducer                      | -           | -   | -                      |
| even     | predator:forager    | 96  | 18   | 96  | 74   | ok         | +141            | +141 / -58 / +38                      | reactive    | no  | 0.375                  |
| even     | predator:reproducer | 115 | 27   | 115 | 98   | ok         | +188            | +188 / -8 / +88                       | reactive    | no  | 0.375                  |
| even     | predator:scout      | 56  | 3!   | 56  | 39   | tight      | +56             | +56 / -146 / -55                      | reactive    | no  | 0.375                  |
| even     | predator:defender   | 175 | 12   | 175 | 167  | ok         | +143            | +143 / -208 / +69                     | reactive    | no  | 0.375                  |
| even     | predator:average    | 111 | 15   | 111 | 95   | ok         | -               | catchable share 1                     | -           | -   | -                      |
| even     | predator:best       | 115 | 27   | 115 | 98   | ok         | -               | picks reproducer                      | -           | -   | -                      |
| long     | predator:forager    | 71  | 36   | 71  | 65   | ok         | +289            | +289 / -58 / -153                     | naive       | no  | 0.625                  |
| long     | predator:reproducer | 70  | 35   | 70  | 64   | ok         | +266            | +266 / -8 / -104                      | naive       | no  | 0.625                  |
| long     | predator:scout      | 56  | 25   | 56  | 56   | ok         | +250            | +250 / -146 / -254                    | naive       | no  | 0.375                  |
| long     | predator:defender   | 69  | 35   | 69  | 63   | ok         | +262            | +262 / -208 / -98                     | naive       | no  | 0.625                  |
| stalker  | predator:forager    | -   | -    | X   | -    | impossible | -34             | -34 / -66 / -269                      | naive       | no  | 0                      |
| stalker  | predator:reproducer | 3!  | 0!   | 3!  | >200 | tight      | +19             | +19 / -16 / -213                      | naive       | no  | 0.125                  |
| stalker  | predator:scout      | -   | -    | X   | -    | impossible | -124            | -124 / -153 / -363                    | naive       | no  | 0                      |
| stalker  | predator:defender   | -   | -    | X   | X    | impossible | -6              | -6 / -62 / -210                       | naive       | no  | 0                      |

The `perfect` tier is the best of a sweep of the sprint effort (0 to 1 in steps of 0.05, then steps of 0.01 within 0.04 of the best),
so the step cells, the catch margin and the perfect column are read at the effort that reaches furthest. The best efforts: `courser`
0.79 (forager, reproducer, defender) and 0.86 (scout); `even` 0.35 to 0.39 (forager, reproducer, scout) and 0.80 (defender); `long`
0.68 to 0.79. The `defaults` and `stalker` rows are unchanged by the sweep (their best effort is 1), and `control` repeats the
`defaults`. The `long` and `stalker` average and best rows are in the per-arm files, which hold every row.

## Reading

- **Re-run (2026-11-21, review of PR 593):** the first run read `perfect` at effort 1 and it was not an upper bound; the table above is
  after the sweep. Verdicts that changed (before to after, broken bound, hunter at its own bearing 0): `courser` reproducer and
  defender `impossible` (-52, -285 px) to `ok` (+659, +662); `even` forager `tight` (+83) to `ok` (+141), reproducer and defender
  `impossible` (-52, -285) to `ok` (+188, +143), scout `impossible` (-17) to `tight` (+56); `long` all four prey rows `impossible`
  (-102, -52, -187, -285) to `ok` (+289, +266, +250, +262). Margins that stayed catchable moved up: `courser` forager +601 to +609 and
  scout +503 to +510. Nothing moved on `defaults`, `control` or `stalker`. Learn slope and fit did not change on any row (the reactive
  and naive tiers did not move); `long` leaves `impossible` on the sweep alone.
- **Defaults and `control`:** every prey row is impossible. The `straight` bound is positive (a perfect hunter closes it, +408 px
  against the forager) and the `broken` one is not (-102 px): the hunter reaches the forager and cannot hold it through the
  oracle's break, at any effort. The sim agrees: `audit:chase` reads 0 catches at 160 px and beyond. The naive tier never touches the
  prey at the drill gap, so the slope fails at `naive`.
- **`courser`:** all four prey are catchable by a hunter of the right effort (+510 to +662 px). Only the scout row is fit for the rung
  screen. The forager row is catchable but `learnSlope` names `reactive`: the reactive hunter (sprinting from sight at effort 1)
  closes the broken bound by less than the naive one (-58 against +273), because it arrives at 14 px a tick and cannot turn through
  the break; the best effort for the perfect hunter is 0.79.
- **`even`:** the forager row is catchable by +141 px at effort 0.38 and has 18 ticks of slack on the turn; not fit, for the same
  reason.
- **`long`:** catchable on every row at effort 0.68 to 0.79 (+250 to +289 px), but the beginner never touches the prey at the drill
  gap (`naive`), so not fit. **`stalker`:** the forager is impossible; it catches the reproducer by +19 px (tight).
- **The gate of fair-chase.md T8** (an arm that leaves `predator:forager` catchable on the broken bound with a margin above 0):
  `courser` (+609 px), `even` (+141 px) and now `long` (+289 px). The stricter test of the tier section (the reactive tier catchable and
  the slope ok) is met by no arm for the forager. The search names the single settings that would: on `courser`, the hunter's
  `sprintBoost` x1.25 (2.0, +874 px, slope ok), the forager's `sprintBoost` x0.75, the hunter's `visionRange` x0.75, `sprintFloor`
  x1.25 or `maxThrust` x1.25; on the defaults, the hunter's `sprintBoost` x1.5 (2.4, +1174 px) or the forager's x0.5 (+884 px).

## What the numbers do not say

- `perfect` is the best of a sweep of the sprint effort, so it is an upper bound on the performer the plan allows (the effort is its one
  choice). The sweep is a grid, not a continuum: the reach steps by up to 60 px between neighbouring efforts (`long` forager 231 px at 0.70, 289 at 0.74), so a first pass of 0.05 alone under-read it and the second pass of 0.01 was added; a pass of 0.0025 over the `long` and `even` broken rows reads within 7 px of it. The eight audit bearings read the first pass only (straight ahead reads both), so the share of bearings that close is a little conservative. The rows that the sweep turned catchable are
  caught at an effort under 1, and the sim cannot confirm them: the oracle brain of `audit:chase` and the `--check` scenes sprint at
  effort 1, so the cross-check validates the formula at effort 1 only. A graded-effort oracle in the audit would close that.
- The cross-check agrees with the sim cell by cell: 40 cells per bound per arm, kills within 2 ticks everywhere, the same fair band
  at every start distance. The one disagreement is a start at exactly the hunter's view (the float32 sprint gate), flagged as the
  edge.
