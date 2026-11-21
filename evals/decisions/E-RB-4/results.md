# E-RB-4 - the forager and reproducer budget on the defaults and the five fair-chase arms

`npm run role:budget -- --rows <the thirteen Phase 4 rows> --check --search` on the default config and on each arm of
`evals/fair-chase/` (`control`, `courser`, `even`, `long`, `stalker`). The reports are `<arm>.txt` (the matrix, the detail of
each row, the searches and the cross-check, which exits 0 on every arm: no reading outside its tolerance) and `<arm>.json`.
The override files the search wrote are `evals/role-budget/<arm>-<spec>-birth-<k>.json`. Every row is read with every effect
off (the user's rule of 2026-11-21). The rows read the default world (14400 by 8100, 16 patches of radius 400, `maxFood` 3600
at the cap, 500 agents), not the arena of Phases 1 to 3. `hunterShare` is the default 0.1: the 16-seed 200000-tick run that
would set it from the observer's `predatorShare` is an eval, which AGENTS.md keeps out of a code chunk.

## The forager and the reproducer (`<spec>:predator`: eat, breed, run)

`eat` and `breed` do not depend on the arm: a forager nets 4.87 energy a tick in a patch (a meal of 100 every 20.2 ticks: the
body walks the 25 px of new food a meal takes at the handling gait, 1.2 px a tick, then the cost of the cycle comes off) and
climbs from the entrant's 200 to the split gate of 900 in 144 ticks of an adult life of 71400. `run` is the arm's: a life meets
138 hunters (`encountersPerLife` at `hunterShare` 0.1) and the flight slack is 16 px (`reactionTicks` of the hunter's creep).

| Arm      | forager run | reproducer run | Reading                                                       |
| -------- | ----------- | -------------- | ------------------------------------------------------------- |
| defaults | 14          | 8              | ok: the hunter does not close on a body that sees it          |
| control  | 14          | 8              | as the defaults                                               |
| courser  | X           | X              | impossible: the hunter closes and a life meets 138            |
| even     | X           | X              | impossible                                                    |
| long     | X           | X              | impossible                                                    |
| stalker  | 6           | X              | the forager escapes by 6 ticks, the reproducer (view 250) not |

## The hunter's living (`predator:living`)

A kill returns 715 on average over the four prey (700, 700, 760, 700) and costs the `reactive` tier's chase 979 (defaults),
692 (courser), 638 (even), 899 (long) and 578 (stalker) energy a chase, a failed chase included: the chase runs to the
250-tick limit when the prey is not caught.

| Arm      | eat (net at 0.3 / at 1) | breed | Status     | Binding |
| -------- | ----------------------- | ----- | ---------- | ------- |
| defaults | X (-765 / -264)         | X     | impossible | eat     |
| control  | X (-765 / -264)         | X     | impossible | eat     |
| courser  | 0! (-477 / +24)         | X     | impossible | breed   |
| even     | 0! (-424 / +77)         | X     | impossible | breed   |
| long     | X (-684 / -184)         | X     | impossible | eat     |
| stalker  | 0! (-364 / +137)        | X     | impossible | breed   |

## The first meal and the sitter

`<spec>:first-meal` (reach, find, eat) and `<spec>:idle` (sit) do not depend on the arm: the arms change the sprint and the
senses of the hunter, not the world's food or the cost of standing. The plan's two predictions held.

| Row                   | reach | find | eat  | Status     | Binding |
| --------------------- | ----- | ---- | ---- | ---------- | ------- |
| forager:first-meal    | >200  | X    | >200 | impossible | find    |
| reproducer:first-meal | >200  | X    | >200 | impossible | find    |
| scout:first-meal      | >200  | X    | >200 | impossible | find    |
| defender:first-meal   | >200  | X    | >200 | impossible | find    |
| predator:first-meal   | >200  | >200 | X    | impossible | eat     |

- **A newborn walks 3172 px (an entrant, 200 energy) at the gait that goes furthest per unit of energy, 2.10 px a tick; a founder
  (800) walks 11527 px; a child (450, born in a patch) has nothing to find.** The nearest patch edge is 959 px away on average
  (90th percentile 1912), so an entrant that knows the way reaches it (reach share 1.00), but a straight walk with no knowledge
  meets a patch after 5207 px on average: the entrant's find share is 0.46, a founder's 0.89, a child's 1. The `find` cell is
  the red one. The sim reads the entrant's 0.43 and a founder's 0.52 (the formula is a walk on a free plane; rocks and walls only
  lower it).
- **The hunter's first meal is red on `eat`, not on `find`:** a blind walk meets prey after 419 px (a view of 400), so it
  finds one at once, and a chase costs more than a kill returns (the living row), so it never climbs back.
- **The search for a birth-energy fix:** `entrantEnergy` x2 (200 to 400) turns the forager's first meal `ok` and lowers the
  sitter's largest ratio from 1.82 to 1.59 (the entrant is the poorest, so a richer entrant helps the searcher more than the
  sitter, since the sitter's cold stack saturates). x3 and x4 turn it `ok` at 1.55. Pairing it with `temperaturePassiveLossFactor`
  x1.25 (2 to 2.5) or `temperatureStart` x0.75 gives 1.49 and 1.51. The three smallest per spec are the override files.
- **The sitter is `tight`, not red:** a sitter lives 1.42 to 1.90 times as long as a searcher (the entrant, the poorest, the
  worst: 2744 ticks against 1507). The first season cools a still body 0.0086 a tick (the plan's 0.0075 less the season's
  1.15), so it leaves the optimal band after about 1160 ticks, not 1330. The plan's prediction that a sitter may outlive a
  searcher held; it did not reach the red of twice as long.

## What the numbers do not say

- **The plan's meal was not the sim's.** The sim's plants are a mixture (grass 60 energy and 16 px, berry 150 and 22, nut 180
  and 26, and others; a patch bears fruit only in its species' season, so 9 of 16 patches carry food at tick 0), not one item of
  `foodEnergy x plantFoodValue` (100 energy, 20 px). The formulas are the grass-only world of `foodEnergy`, and the first-meal
  scene is run in that world (`uniformFlora`); the real world has fewer food-bearing patches than 16 and a different mean
  item, so the `find` and `reach` shares of a real newborn are lower than these. This is a finding for the plan, not a tuned
  number.
- **The meal cycle is not search plus handle plus digest.** One `ateTimer` holds the handling and the digest windows, so a meal
  is `digestTicks` (10) apart at the soonest; the body lives on the items its path newly covers (3 are under it at the start,
  eaten in the first meals). The forager's settled rate in a grid of food is 5.7 a tick in the sim against the formula's 4.9
  (14% above), the formula being conservative.
- **A failed chase costs the whole limit.** The living row charges the `reactive` tier's chase, which runs 250 ticks when the
  prey is not caught; a hunter that gives up when the prey leaves its view would pay less. On `courser` and `even` the net at a
  catch share of 1 is +24 and +77, so every chase must succeed for a hunter to gain at all; with `catchShare` 0.3, red on
  every arm. This is the budget's reading, to be checked against a measured catch share before it is acted on.
- **`hunterShare` is 0.1, not measured.** `encountersPerLife` is 138 for a forager, so the `run` cell's rule (impossible when
  the hunter closes) is the same at any share above 0.07%.
