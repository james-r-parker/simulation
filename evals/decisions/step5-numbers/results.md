# Step 5 numbers (E271) - the candidate arm `step5-d`

Lane B step 5 of [fair-chase.md](../../../docs/designs/fair-chase.md), the calculator part: [status-effects.md](../../../docs/designs/status-effects.md)
T15 (the effect numbers), [body-genes.md](../../../docs/designs/body-genes.md) T17 (the span corners, E-BG-1) and a try at the defender's `body`.
No training, no eval, no default and no `library/seasons.json` changed: this is `npm run role:budget` only (no world, seconds a row
except the corner reads). Adoption is T18, after the 16-seed screen and the 64-seed keep rule.

The base is `step5-b` of [E263](../step5-candidates/results.md) (sprint store on, hunter drain halved, `entrantEnergy` 400, `herdRunSpeed` 5.5).
Every gated row is read with every effect off, the user's rule of 2026-11-21: a job works at the defaults for a good performer, and a
buff only amplifies teamwork once it emerges. The pack row is the one amplifier row, read with `rallied` on, never part of the gate.

`evals/role-budget/step5-d.json` is the candidate: `step5-b` plus `entrantEnergy` 700, `coldStackRate` 0.4, `rallyThrust` 0.1,
`rallyBurn` 4, `staggerThrust` 0.5, `staggerTicks` 30, and the menu spans of body-genes.md narrowed as in "T17 - the span corners" below. `step5-d-defender-probe.json` is the defender's body probe (below), kept as evidence and not a candidate.

## The matrix with `step5-d` (every effect off)

`npm run role:budget -- --config evals/role-budget/step5-d.json`: **13 ok / 6 tight / 6 red / 1 n/a** (`step5-b` read 10 / 9 / 6 / 1).

| row                   | `step5-b`        | `step5-d`      | what moved it                                                                               |
| --------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------- |
| predator:forager      | ok turn 73       | ok turn 73     | unchanged                                                                                   |
| predator:reproducer   | ok turn 81       | ok turn 81     | unchanged                                                                                   |
| predator:scout        | ok turn 56       | ok turn 56     | unchanged                                                                                   |
| predator:defender     | ok turn 81       | ok turn 81     | unchanged                                                                                   |
| forager:idle          | tight sit -1737  | ok sit 25      | the cold stack: the sitter's ratio 1.59 to 0.99                                             |
| reproducer:idle       | tight sit -1737  | ok sit 25      | the same                                                                                    |
| scout:idle            | tight sit -1547  | ok sit 106     | 1.67 to 0.96                                                                                |
| predator:idle         | tight sit -16299 | tight sit -968 | 1.54 to 1.08                                                                                |
| defender:idle         | tight sit -1745  | tight sit -23  | 1.59 to 1.01                                                                                |
| forager:first-meal    | ok reach 200+    | ok reach 200+  | `entrantEnergy` 700 pays for the cold stack (find share 0.70, was 0.70)                     |
| reproducer:first-meal | ok reach 200+    | ok reach 200+  | the same                                                                                    |
| scout:first-meal      | ok reach 200+    | ok reach 200+  | the same                                                                                    |
| defender:first-meal   | ok find 110      | ok find 112    | the same                                                                                    |
| the four `:herd` rows | tight            | tight          | unchanged (`herdRunSpeed` 5.5 from `step5-b`)                                               |
| defender:predator     | red repel: off   | red repel: off | still red (below)                                                                           |
| scout:predator        | red run          | red run        | still red (below)                                                                           |
| forager:predator      | red run          | red run        | still red as the model reads it; green when read over the encounters before the first split |
| reproducer:predator   | red run          | red run        | the same                                                                                    |
| predator:living       | red breed        | red breed      | net -362.9 a chase at catch share 0.3 (E263)                                                |
| predator:first-meal   | red eat          | red eat        | inherits the living row                                                                     |

`--check` on `step5-d` exits 1 on five readings, all `forager:idle` (the formula's cold stack against the scene: sits 3166 against 3293
(0.5% tolerance) and searches 3191 against 3273 (2%), the same for the entrant and the child). The scene lives 3.9% longer sitting and
2.6% longer searching, so the formula's sitter ratio is 1.4% low: forager 0.99 reads about 1.00 in the world. `step5-b`'s `--check` exits 0. The
cold stack's recurrence in `js/evo/role-budget-forage.js` is the model to correct before T18 (a calculator drift, not a number to hide).

## T15 - the effect numbers

### `rallyThrust` and `rallyBurn` (the pack row)

`--rows pack:forager`, hearer at `rallied: 1` against a forager, the lone hunter unchanged by construction (its `rallied` is 0). At the
neutral numbers `packGain` is 0 and the lone hunter's forager row is `ok` turn 73 (margin +607.8 px), so the buff is not what makes the
hunt possible. `tightTicks` is 5.

| `rallyThrust` | rallied margin (px) | `packGain` px | `packGain` ticks | against `tightTicks` 5 |
| ------------- | ------------------- | ------------- | ---------------- | ---------------------- |
| 0.05          | +667.9              | +60.1         | +4.2             | under                  |
| 0.10          | +727.5              | +119.7        | +8.3             | 1.7 times, **chosen**  |
| 0.15          | +785.0              | +177.2        | +12.3            | 2.5 times              |
| 0.20          | +841.9              | +234.1        | +16.3            | 3.3 times              |
| 0.30          | +957.4              | +349.6        | +24.3            | 4.9 times              |

0.1 is the smallest number on the 0.05 grid whose pack gain clears `tightTicks`, with a margin (a rally adds a tenth to the thrust and
sprint boost times the body's nerve; the lone hunter is already catchable by 608 px, so the buff is margin on a working job).

`rallyBurn` leaves `packGain` unchanged from 0.05 to 8 (119.7 to 119.4 px) and moves the hearer's chase cost against the lone
hunter's (a negative number is the pack saving energy by ending the chase sooner):

| `rallyBurn` | 0.05  | 0.5   | 1     | 2    | 4        | 8    |
| ----------- | ----- | ----- | ----- | ---- | -------- | ---- |
| chase spent | -11.2 | -10.7 | -10.2 | -9.2 | **-6.0** | -1.9 |

4 is chosen: the burn scales the passive cost and the heat gain of movement by `1 + burn x nerve` for a `rallyTicks` (120) window, so a
rally is not free: the standing cost of a body at rest is 0.0153 a tick (`predator:living`), 7.3 energy over the window at burn 4, and
the chase heat of +0.93 of 15 headroom rises to at most 4.7 (a linear estimate, 31% of the headroom, still no overheating). At burn 8 the
chase is no longer cheaper (-1.9) but the heat estimate is 8.4 of 15, over half; the pack's price is read by the three cheat checks of T17.

### `staggerThrust` and `staggerTicks`

Not read by the calculator: T13 built the pack row only, and the defender row reads the shove (`defenderRepelEnergy` and
`defenderRepelImpulse`), not the `staggered` stack. A `staggered` hunter loses `staggerThrust` of its thrust and cannot bite for
`staggerTicks`, so it is an amplifier of a shove that lands. The defender's intercept cell is red with every effect off (below), so by the user's
rule the stagger is margin and not what makes the defence possible. `staggerThrust` 0.5 and `staggerTicks` 30 are chosen as a body
that takes a shove loses half its thrust for 30 ticks, six times the 5 ticks a hunter needs to kill a forager (the defender row's
`caller dies tick 27`); the first reading of them is the screen (`eval.effect_share.staggered`), not this record.

### The cold stack with the sitter row

`coldStackRate` is read by the idle rows through `coldStackTicks` 60 and `coldRecoverTicks` 15 (kept). It is a cost on a body that stands
in the cold, not a buff, so reading the idle row with it on is the row's design (role-budget.md, "The sitter"). It pulls against the
first-meal rows: a colder body's searcher also loses range, so each rate needs more birth energy. Grid of the rows that move, `step5-b` base,
largest idle ratio of the five specs and the first-meal rows that stay `ok` (of forager, reproducer, scout, defender):

| `entrantEnergy` | `coldStackRate` | idle ratios (forager / scout / predator / defender / reproducer) | first-meal ok       |
| --------------- | --------------- | ---------------------------------------------------------------- | ------------------- |
| 400             | 0               | 1.59 / 1.67 / 1.54 / 1.59 / 1.59                                 | 4 of 4              |
| 400             | 0.4             | ok / ok / tight / tight / ok                                     | 1 of 4 (scout only) |
| 600             | 0.3             | 1.03 / 1.01 / 1.11 / 1.05 / 1.03                                 | 4 of 4              |
| 600             | 0.35            | 1.01 / 0.98 / 1.10 / 1.03 / 1.01                                 | 3 of 4 (defender)   |
| 700             | 0.35            | 1.01 / 0.98 / 1.10 / 1.03 / 1.01                                 | 4 of 4              |
| **700**         | **0.4**         | **0.99 / 0.96 / 1.08 / 1.01 / 0.99**                             | **4 of 4**          |
| 700             | 0.5             | 0.96 / 0.93 / 1.06 / 0.98 / 0.96                                 | 3 of 4 (defender)   |

`entrantEnergy` 700 and `coldStackRate` 0.4 is the largest rate at which the four plant eaters' first-meal rows all stay `ok`; the
sitters' ratio falls from 1.54 to 1.67 down to 0.96 to 1.08, so a sitter no longer outlives a searcher on the three plant eaters
and by at most 8% on the predator (`tight`, not red). 700 is under a founder's 800. The predator's and the defender's idle rows stay `tight`:
`coldStackRate` 1.5 and above turns them `ok` but turns the forager's first-meal row `impossible` on `find`.

## The defender's `body` (`step5-d-defender-probe.json`)

The defender row is red at the defaults and stays red. The first cause is that there is no shove (`repel: off`), which is a mechanism and
not a body number; the probe turns it on (`defenderRepelEnergy` 40, `defenderRepelImpulse` 4, the first arm of prey-guilds.md Phase 2).
With it on the row is `impossible` on `run`: the hunter, creeping at its cruise, reaches the caller at tick 23 and kills at tick 27; the
defender stands 150 px beside the caller, starts to move at tick 5, and holding `BITE` moves at `grazeThrust` (0.6) of its thrust.

What the body numbers do (`specialisations.defender`, shove on, `step5-b` base):

| try                                                         | result                                                                                           |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `body.maxThrust` x1.5, x2, x3                               | run `impossible`: the smoke walk shortens by 5 ticks, the touch never comes                      |
| `body.maxVelocity` x1.5, x2                                 | no change (the cap is not what binds)                                                            |
| `sprintBoost` 2.4, 3                                        | no change to the run                                                                             |
| `body.grazeThrust` x2, x3, x4                               | no change alone (capped at 1)                                                                    |
| thrust x3, turn x3, sprintBoost 3, graze 1                  | the shove lands at tick 34, after the kill at 27: `impossible`                                   |
| thrust x6, turn x3, sprintBoost 2, graze 1                  | the shove lands at tick 24: run ok 5, intercept tight 3                                          |
| **thrust x6, turn x3, sprintBoost 3, graze 1** (the probe)  | hear 3, turn 9, run 10, intercept 9: the defence is `ok`, `predator:defender` still ok (+218 px) |
| the same plus `smokeRadius` x2 or x4, `smokeTicks` x1 or x3 | smoke still `impossible`                                                                         |

Reading: the defence needs a body with six times the thrust, three times the turn and a sprint boost of 3 (top speed 24 against the
hunter's 14.4), which is no longer a defender and costs the hunter -419 a chase against one (`predator:defender` net), so it is not
taken. The smoke cell stays `impossible` for every body number: the latest release is tick 8 and the defender's walk to the smoke
spot is 43 ticks at best. With `alarmBiteShare` as the lever instead (a global number, nature: an alarmed prey is hard to hold) the
defender reaches the hunter only at 0.1 (kill at tick 63, touch at 52 to 58) and the smoke cell is still red. **The defender row is a
geometry red, not a body-number red**: the model puts the defender 150 px from a caller that a creeping hunter kills 22 ticks after the
alarm. A reading that stands the defender beside the herd it guards is built (`escortGap`, below) and does not turn the row green.

## The defender row at an escort distance (2026-11-21)

User decision (2026-11-21): the row reads the defender at an escort distance, a guard that stays near the herd it guards
([role-budget.md](../../../docs/designs/role-budget.md), Decisions). `escortGap` derives it as the caller's size, the defender's
size and one defender radius of air: 29 + 29 + 29 = 87 px, against the 150 px of the fixed `defenderGap`. No world rule or sim
key changed. The reading, `npm run role:budget -- --rows defender:predator` on the defaults and with `--config
evals/role-budget/step5-d.json` (the two are the same on this row), every effect off:

| reading              | escort 150 px (before) | escort 87 px (now)             |
| -------------------- | ---------------------- | ------------------------------ |
| status, binding      | impossible, repel: off | impossible, repel: off         |
| hear                 | ok 48                  | ok 51                          |
| run, intercept       | X, X (touches never)   | X, X (touches never)           |
| smoke walk, release  | 48, tick 53            | 37, tick 42 (latest release 9) |
| smoke slack defender | -45                    | -33 (caller -2)                |

Sweep of the escort at 150, 100, 87, 75, 60, 50, 40, 30, 25, 20, 15 and 10 px, on step5-d with the shove off and with it on
(`defenderRepelEnergy` 40, `defenderRepelImpulse` 4): **the row is red at every one.** The walk to the smoke spot is 48 ticks at
150 px, 41 at 100, 34 at 60, 33 at 40 and 38 at 10 (a defender under the two sizes' sum, 58 px, overlaps the caller and is
pushed off it), against a latest release of tick 8 or 9; the smoke slack is -45, -38, -30, -29 and -34. The defender never
touches the hunter: it starts to move at tick 5 at the grazing gait, from rest and at right angles to the hunter, while the hunter
closes 14.4 px a tick and kills at tick 27. So the earlier reading ("a geometry red") is half right: the distance costs 10 to 15
ticks of the walk, but it is not what binds, the defender's speed and heading are. Nothing was tuned to make it green. What would
change it is not an escort distance but the defender's start (facing the hunter, or standing between it and the herd) or its
speed, which is a body or behaviour question for the coordinator. The walk scene of `--check` is not read at 87 px (the path to
the smoke spot grazes the caller, which the formula has no bumps for) and is read at 150 px in `test/evo/role-budget-defence-check.test.js`.

## The defender row in a guard posture (2026-11-21)

User decision (2026-11-21): try the guard posture first, fall back to speed. `guardPosture` `between` (a model option,
`--model guardPosture=between`; the derived default stays `side`) stands the defender on the hunter's approach line, `escortGap` (87 px)
from the caller, facing the hunter, at rest, and aims it straight at it (no lead). No world rule or sim key changed. Readings, the
defaults and `evals/role-budget/step5-d.json` alike, every effect off, and with the shove on (`defenderRepelEnergy` 40,
`defenderRepelImpulse` 4):

| reading                         | side-on (before)       | guard, shove off       | guard, shove on                |
| ------------------------------- | ---------------------- | ---------------------- | ------------------------------ |
| status, binding                 | impossible, repel: off | impossible, repel: off | impossible, smoke              |
| hear, turn, run                 | ok, n/a, X             | ok, ok, ok             | ok, ok, ok                     |
| intercept                       | impossible             | impossible (shove off) | ok: touch and shove at tick 15 |
| kill tick (27 with no defender) | 27                     | none in the run        | none in the run                |
| smoke walk, release, latest     | 37, 42, 9              | 0, 26, 5               | 0, 26, 5                       |
| smoke slack defender, caller    | -33, -2                | -21, -20               | -21, -20                       |

The guard fixes the defence: the defender reaches the hunter at tick 15 and, with the shove on, shoves it, with every body number at
its default. Caveat: the model's perfect hunter steers at the caller and has no path round a blocker, so it never kills in the run;
the intercept slack is read against the 27-tick kill with no defender, and the no-kill is an upper bound. The row stays red on the
**smoke**: a guard faces the hunter and the cloud drops behind the releaser, so it must turn 180 degrees first (release at tick 26
against a latest release of tick 5).

Speed fallback (guard on, shove on, step5-d, `turnMultiplier` with `body.maxThrust` x1 and x2 and `sprintBoost` 2): turn x1 smoke
slack -21 (release tick 26), x2 -11 (16), x4 -6 (11), x8 -3 (8), x20 -2 (7), against a latest release of 5; the caller's smoke slack is
-20 to -26 at every value; thrust x2 and `sprintBoost` 2 change nothing in the smoke. **No set up to x2 turns the row non-red** (turn
x2 reads -11), and not even x20 does, so no arm `step5-e.json` was written. The defence needs no speed; the smoke needs a release
without the 180 degree turn (behaviour, or a cloud dropped ahead of the releaser), which no body multiplier supplies.

## The three prey run rows

`forager:predator` and `reproducer:predator` read `encountersPerLife` (138) against a perfect hunter over an adult life of 71400 ticks.
The coordinator's call is to read them over the encounters before the first split: with `entrantEnergy` 700 the gate of 900 takes 41
ticks, so `138 x 41 / 71400` is 0.08 encounters, and at a good performer's catch share 0.3 the chance of meeting a lethal chase before
splitting is 2.4%. Read with `--model` `hunterShare` 0.0007 (the same encounter count, 1 in a life, which the row reads as under
the `impossible` rule) both rows are **ok, binding `breed`**. `scout:predator` is a different row (`run` against the hunter at 14.4 px a
tick: the scout's warning does not outrun a perfect hunter), still red. No world number moved; the reading is the model's.

## Rows still red on `step5-d`

| row                 | why                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| defender:predator   | no shove at the defaults, and with one the geometry (above); no body number or effect makes it green without a body that is no defender |
| scout:predator      | the forager's `run` against a perfect hunter at 14.4 against 12 px a tick                                                               |
| forager:predator    | the whole-life encounter count; ok over the encounters before the first split                                                           |
| reproducer:predator | the same                                                                                                                                |
| predator:living     | a chase nets -362.9 at catch share 0.3, no setting of this chunk touches the hunter's income                                            |
| predator:first-meal | inherits the living row                                                                                                                 |

## T17 - the span corners (E-BG-1)

`role:budget --genes corners` refuses a hunter row at the candidate spans (16384 pairs, at most 4096), so the corners were read with
a scratch script (not committed) that calls `rowAt` and `traitCorners` of `js/evo/role-budget-corners.js` over every pair
(the predator's `heatBand` and `burn` closed to fit 4096 pairs; `--genes best-vs-worst` and `worst-vs-best` read them open), and
`--genes worst-vs-best` as a cross-check. The seven budget traits are `size`, `vision`, `speed`, `sprintStore`, `fat`, `burn`, `heatBand`.

At the candidate spans of body-genes.md (every `size`, `vision` and `fat` at 0.3 or the table's value) **the prediction of E-BG-1 is falsified**:

| row                 | corner pairs | impossible at the candidate spans | the corner                                                                                    |
| ------------------- | ------------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| predator:defender   | 1024         | 176 (run and bite)                | a small, fat defender (size 0.7, fat 1.3) against a weak hunter (speed 0.9, sprint store 0.7) |
| predator:reproducer | 2048         | 16 (S2 spans)                     | a small, fast, fat reproducer (size 0.7, speed 1.1, fat 1.3)                                  |
| predator:forager    | 4096         | 128 (S2 spans)                    | a small, fast forager with a big sprint store (size 0.7, speed 1.15, store 1.3)               |
| predator:scout      | 4096         | 328 (S2 spans)                    | the same                                                                                      |

The first cause is the size gate: a hunter at size 0.7 cannot bite a prey at 1.3 (`huntSizeRatio` 0.8 over runtime sizes; the worst-vs-best read
failed at the predator `size` span 0.2 and passed at 0.1), so the predator's `size` span is 0.1. The second is the prey's `size` and `fat`: a
small body is faster and a fat one holds a larger store, so the prey's best corner outruns the hunter's worst. Narrowing in steps
(each read over every pair): the predator's `size` 0.1, `fat` 0.1, `vision` 0.15, `speed` 0.05, `sprintStore` 0.1 and the defender's
`size`, `fat`, `vision` 0.15 leave the defender row green (0 of 1024) and the others red; the prey's `size` and `vision` 0.15, `fat` 0.1 and
their `speed` halved (forager 0.1 with store 0.15, reproducer 0.05, scout 0.1 with store 0.1) turn all four green.

At the **chosen spans** (the `genes` of `step5-d.json`) every hunter row has 0 impossible pairs:

| row                 | pairs | impossible | least slack (ticks) |
| ------------------- | ----- | ---------- | ------------------- |
| predator:forager    | 4096  | 0          | 9                   |
| predator:reproducer | 2048  | 0          | 32                  |
| predator:scout      | 4096  | 0          | 0 (tight)           |
| predator:defender   | 1024  | 0          | 39                  |

The predator's `heatBand` (5) and `burn` (0.2) are closed in those reads. `--genes worst-vs-best`, which keeps them open, reads
`predator:scout` `ok` (see 185, turn 77, bite 146) and the earlier `best-vs-worst` and `worst-vs-best` reads of the other rows are `ok` with the
predator `size` at 0.1. `predator:average` and `predator:best` (a performer corner against the default pressure, 128 pairs) are `ok`
at every corner at the `size` 0.1 span (least slack: see 108, turn 8 for `average`; see 144, turn 13 for `best`). `defender:predator`
is `impossible` at every corner including the centre (`repel: off`), so it is no span result. The scout row's least slack of 0 ticks is
the one tight corner: a scout at its slowest corner against a hunter at its fastest.
