# Step 5 candidates (E263) - the full role budget before the numbers are chosen

Lane B step 5 of [fair-chase.md](../../../docs/designs/fair-chase.md) ("The numbers": [body-genes.md](../../../docs/designs/body-genes.md)
Phase 3 with [status-effects.md](../../../docs/designs/status-effects.md) Phase 3) chooses spans, costs, effect strengths, birth energy
and the cold stack with the calculator, then runs one 16-seed screen and one 64-seed keep-rule pair. This record is the calculator
part only: no training, no eval, no default changed. It reads `npm run role:budget` (every row) on the defaults and each arm of
`evals/fair-chase/`, with `--check` and `--search`, and proposes candidate configs for the screen.

Every row is read with every effect off (the user's rule of 2026-11-21, in the Decisions tables of role-budget.md, body-genes.md and
status-effects.md): a role's job must work at the defaults for a good performer, and buffs only amplify teamwork.

Built on `feat/role-budget-p5` (Phases 1 to 5) merged with `origin/main`; the merge reads the temperature through `effectFactor`, as
e2ac2b72 resolved it. **Every `predator:living` and `predator:first-meal` reading is pre-fix:** the p4 cost model (catch-share
weighted, a failed chase ending at the sim's give-up rule) is being fixed, and both rows will move.

Cells: status, binding step, margin of the binding cell (ticks unless marked px; `+` capped). `red` is `impossible`.

## The matrix before

`--check` exits 0 on the defaults, `control`, `courser` and `long`, and 1 on `even` and `stalker`. The one drift on each is the known
effort-1 sign check of `scout:predator` (E-RB-3: formula "escapes", scene "caught"), not a new one.

| row                   | defaults         | control          | courser          | even             | long             | stalker          |
| --------------------- | ---------------- | ---------------- | ---------------- | ---------------- | ---------------- | ---------------- |
| predator:forager      | red run -102 px  | red run -102 px  | ok turn 73       | ok turn 17       | ok turn 36       | red run -34 px   |
| predator:reproducer   | red run -52 px   | red run -52 px   | ok turn 81       | ok turn 28       | ok turn 35       | tight turn 0     |
| predator:scout        | red run -187 px  | red run -187 px  | ok turn 56       | tight turn 2     | ok turn 25       | red run -125 px  |
| predator:defender     | red run -285 px  | red run -285 px  | ok turn 81       | ok turn 12       | ok turn 35       | red run -6.5 px  |
| predator:average      | red see          | red see          | ok turn 72.8     | ok turn 14.8     | ok turn 32.8     | tight turn 0     |
| predator:best         | red run -102 px  | red run -102 px  | ok turn 81       | ok turn 28       | ok turn 36       | red run -34 px   |
| defender:predator     | red repel: off   | red repel: off   | red repel: off   | red repel: off   | red repel: off   | red repel: off   |
| scout:predator        | tight turn 3     | tight turn 3     | red run -664 px  | red run -192 px  | red run -344 px  | red run -31 px   |
| forager:predator      | ok run 14        | ok run 14        | red run 592 px   | red run 120 px   | red run 272 px   | ok run 6         |
| reproducer:predator   | ok run 8         | ok run 8         | red run 641 px   | red run 169 px   | red run 249 px   | red run 3.3 px   |
| predator:living (pre) | red eat          | red eat          | red breed        | red breed        | red eat          | red breed        |
| forager:first-meal    | red find         | red find         | red find         | red find         | red find         | red find         |
| predator:first-meal   | red eat (pre)    | red eat (pre)    | red eat (pre)    | red eat (pre)    | red eat (pre)    | red eat (pre)    |
| reproducer:first-meal | red find         | red find         | red find         | red find         | red find         | red find         |
| scout:first-meal      | red find         | red find         | red find         | red find         | red find         | red find         |
| defender:first-meal   | red find         | red find         | red find         | red find         | red find         | red find         |
| forager:idle          | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  |
| predator:idle         | tight sit -16299 | tight sit -16299 | tight sit -16299 | tight sit -16299 | tight sit -16299 | tight sit -16299 |
| reproducer:idle       | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  |
| scout:idle            | tight sit -1043  | tight sit -1043  | tight sit -1043  | tight sit -1043  | tight sit -1043  | tight sit -1043  |
| defender:idle         | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  | tight sit -1237  |
| forager:herd          | tight survive 3  | tight survive 3  | tight survive 3  | tight survive 3  | tight survive 3  | tight survive 3  |
| predator:herd         | n/a (herd turns) | n/a              | n/a              | n/a              | n/a              | n/a              |
| reproducer:herd       | red run          | red run          | red run          | red run          | red run          | red run          |
| scout:herd            | tight survive 3  | tight survive 3  | tight survive 3  | tight survive 3  | tight survive 3  | tight survive 3  |
| defender:herd         | red run          | red run          | red run          | red run          | red run          | red run          |
| **ok / tight / red**  | **2 / 8 / 15**   | **2 / 8 / 15**   | **6 / 7 / 12**   | **5 / 8 / 12**   | **6 / 7 / 12**   | **1 / 9 / 15**   |

## What the search names, grouped by setting

`--search` covers the `predator:<prey>` rows, the defender row and the first-meal rows. The idle, herd, scout and living rows have
no search, so they were probed by hand with `--set` (seconds each).

| Setting                                                                                      | Rows it moves                          | Reading                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specialisations.predator.sprintBoost` 1.6                                                   | the six hunter rows                    | x1.25 (2.0) makes forager, reproducer and scout catchable (slope naive), not the defender (-25 px); x1.5 (2.4) makes all four `fit`. Top sprint 14.4 -> 17.6 px a tick against the prey's 12                                                         |
| prey `sprintBoost` 1 (x0.5 or x0.75)                                                         | one hunter row each                    | a slower prey sprint; turns every prey row red on `run` (below), and cheapens the prey's escape rather than the hunter's job                                                                                                                         |
| the sprint store (`courser` arm)                                                             | the six hunter rows                    | all ok with the prey's sprint limited to 100 ticks and the hunter's to 200 (E253's fair band)                                                                                                                                                        |
| `maxVelocity`, `damping`, `maxThrust`                                                        | hunter rows, the defender's intercept  | refused: movement physics, kept as is (user, 2026-11-21)                                                                                                                                                                                             |
| `entrantEnergy` 200                                                                          | the four plant eaters' first-meal rows | 400 (x2) turns all four `ok` (entrant find share 0.41-0.46 -> 0.65-0.70); every sitter's largest ratio falls (scout 1.90 -> 1.67, forager 1.82 -> 1.59); the predator's entrant line rises 1.52 -> 1.54, its row's largest stays 1.55                |
| `temperatureLossPassive`, `temperaturePassiveLossFactor`, `temperatureStart`                 | the idle rows, the first-meal rows     | every value tried (loss to 0.06, factor to 6, start to 30) leaves the idle rows `tight` (best ratio about 1.13); the colder world shortens the searcher's range too, so `forager`, `reproducer` and `defender` first-meal go back to red (`step5-c`) |
| `temperatureGainMove` 0.01                                                                   | the idle rows, the hunter's chase heat | 0.035 to 0.06 keeps the searcher warm and brings the founder's ratio to 0.86, but the entrant's stays 1.37 and the chase's heat reaches 15 of 15 headroom at 0.06; not taken                                                                         |
| `herdRunSpeed` 6.5                                                                           | the four non-hunter herd rows          | 5.5 turns reproducer and defender from red to tight (run 3.5 for the defender), forager and scout survive 4 tramples, not 3                                                                                                                          |
| `specialisations.reproducer.visionRange` 250, `specialisations.defender.rearVisionShare` 0.8 | one herd row each                      | 300 and 1.0 make each `tight` (run 8): the body-number route for the herd, at the cost of two spec traits                                                                                                                                            |
| `trampleDamage`                                                                              | `survive` on the herd rows             | 200 makes `survive` ok (6 or 7 tramples) but leaves `run` red; a trample is lethal to a small body in nature, so not taken                                                                                                                           |
| shove on, predator `biteMultiplier` 20 -> 6 or 4                                             | `defender:predator`                    | the defender touches the hunter at tick 37 and breaks the bite, but the row stays red on `smoke` and `predator:defender` turns red; not taken                                                                                                        |

## The candidates

Each is a config file under `evals/role-budget/`, read with `--config`.

| Setting                                          | Old  | `step5-b` (recommended) | `step5-a` (body only, no store) | Why (nature first)                                                                                                                                                                                              |
| ------------------------------------------------ | ---- | ----------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sprintStoreEnabled`                             | off  | on                      | off                             | A prey's sprint is anaerobic and short (a gazelle tires in under a minute); a cursorial hunter (wolves, wild dogs) wins by outlasting it. The `courser` arm of E253, the only fair band, unchanged              |
| `sprintDrain`                                    | 0.01 | 0.01                    | -                               | As `courser`: 100 ticks of sprint from a full store                                                                                                                                                             |
| `specialisations.predator.sprintDrainMultiplier` | 1    | 0.5                     | -                               | As `courser`: the hunter's store lasts twice the prey's                                                                                                                                                         |
| `specialisations.predator.sprintBoost`           | 1.6  | 1.6                     | 2.4                             | `step5-a` only: the hunter's top sprint becomes 1.47 times the prey's (17.6 against 12); real pursuit predators run about 1.2 to 1.3 times their prey, so this is the less realistic route                      |
| `entrantEnergy`                                  | 200  | 400                     | 400                             | An entrant arrives as a body in the condition of a weaned child (the gift is 450), still below a founder's 800; at 200 more than half walk blind past every patch. The sitter's ratio falls, so the gate holds  |
| `herdRunSpeed`                                   | 6.5  | 5.5                     | 5.5                             | A stampede of large grazers runs below a small body's cruise (8 px a tick); 5.5 is 69% of it. A body that sees the herd 211 to 221 px off can now clear it; the herd still tramples the one that does not react |

`step5-c` is `step5-b` with `temperatureLossPassive` 0.015 and `temperaturePassiveLossFactor` 3: rejected, kept for the record (it
turns three first-meal rows red and leaves every idle row tight).

## The matrix after

| row                   | `step5-b` (recommended) | `step5-a`        | `step5-c`       |
| --------------------- | ----------------------- | ---------------- | --------------- |
| predator:forager      | ok turn 73              | ok turn 91       | ok turn 73      |
| predator:reproducer   | ok turn 81              | ok turn 95       | ok turn 81      |
| predator:scout        | ok turn 56              | ok turn 83       | ok turn 56      |
| predator:defender     | ok turn 81              | ok turn 96       | ok turn 81      |
| predator:average      | ok turn 72.8            | ok turn 91.3     | ok turn 72.8    |
| predator:best         | ok turn 81              | ok turn 96       | ok turn 81      |
| defender:predator     | red repel: off          | red repel: off   | red repel: off  |
| scout:predator        | red run -664 px         | red run -1241 px | red run -664 px |
| forager:predator      | red run 592 px          | red run 1158 px  | red run 592 px  |
| reproducer:predator   | red run 641 px          | red run 1207 px  | red run 641 px  |
| predator:living (pre) | red breed               | red breed        | red breed       |
| forager:first-meal    | ok reach 200+           | ok reach 200+    | red find        |
| predator:first-meal   | red eat (pre)           | red eat (pre)    | red eat (pre)   |
| reproducer:first-meal | ok reach 200+           | ok reach 200+    | red find        |
| scout:first-meal      | ok reach 200+           | ok reach 200+    | ok find 113     |
| defender:first-meal   | ok find 110             | ok find 110      | red find        |
| forager:idle          | tight sit -1737         | tight sit -1737  | tight sit -724  |
| predator:idle         | tight sit -16299        | tight sit -16299 | tight sit -8813 |
| reproducer:idle       | tight sit -1737         | tight sit -1737  | tight sit -724  |
| scout:idle            | tight sit -1547         | tight sit -1547  | tight sit -688  |
| defender:idle         | tight sit -1745         | tight sit -1745  | tight sit -733  |
| forager:herd          | tight survive 4         | tight survive 4  | tight survive 4 |
| predator:herd         | n/a                     | n/a              | n/a             |
| reproducer:herd       | tight survive 4         | tight survive 4  | tight survive 4 |
| scout:herd            | tight survive 4         | tight survive 4  | tight survive 4 |
| defender:herd         | tight run 3.5           | tight run 3.5    | tight run 3.5   |
| **ok / tight / red**  | **10 / 9 / 6**          | **10 / 9 / 6**   | **7 / 9 / 9**   |

The predator's living under `step5-b`, pre-fix: a kill returns 715, the budgeted chase costs 692 over 216 ticks; net -477 a chase at
`catchShare` 0.3 and +23.5 at 1. Under `step5-a`: 255 over 56 ticks; net -41 at 0.3 and +460 at 1.

## Check

`npm run role:budget -- --config evals/role-budget/step5-<a|b>.json --check` exits 0 on both: every scene agrees with its formula
inside its tolerance, no `RoleBudgetDrift` (the effort-1 scout drift of `even` and `stalker` does not appear on either). `step5-c` was read without `--check`, being rejected on the formulas alone.

## Rows still red, and why

1. **`forager:predator`, `reproducer:predator`, `scout:predator` against the six hunter rows.** In every config read, the prey's
   `run` cell is green exactly where the hunter's rows are red, and red where they are green: a cell is `impossible` when a life
   meets at least one hunter (138 at `hunterShare` 0.1) and the perfect hunter's catch margin beats the prey's 16 px of flight slack.
   The two can both be non-red only in a window of 0 to 16 px of catch margin (`stalker` sits near it: forager ok 6, reproducer red
   by 3.3 px). No single number turns both green; it is the definition of the prey row, not a number (open question 1).
2. **`predator:living` and `predator:first-meal`: pre-fix.** The current model charges every chase its full cost, a failed chase
   running to the 250-tick limit; the p4 fix weights by catch share and ends a failed chase at the give-up rule. Not tuned here: a
   number chosen on the pre-fix row would cheapen or overpay the hunt on a model that is about to change.
3. **`defender:predator`.** Red on `repel: off` at the defaults (the shove keys are 0). With the shove on it is red on `run`: the
   caller dies at tick 27, five bites after contact, before the defender (moving at tick 5, 150 px away) can touch the hunter. The
   search names only `damping` and `maxThrust` (movement physics, refused). A slower kill (predator `biteMultiplier` 6 or 4) lets
   the defender arrive and break the bite, but the row stays red on `smoke` (the defender's cloud lands at tick 53 against a latest
   useful tick of 8, in every config of E-RB-2) and `predator:defender` turns red. Open question 3.
4. **Idle rows: tight, not red.** `idleRatio` stays 1.4 to 1.7 under every global cold setting. The reason is structural: the
   searcher walks at `bestRangeSpeed`, where its cost is twice the standing cost, and the cold multiplies the standing cost of both
   bodies, so the ratio tends to `1 + 1/heat` and never reaches 1; the colder world also shortens the searcher's range and turns
   the first-meal rows red. The `chilled` stack is the planned lever, and its keys (`coldStackRate`, `coldStackMax`,
   `coldStackTicks`, `coldRecoverTicks`) are not in the config yet (status-effects.md Phase 2, T9): `--set coldStackRate=0.1` is
   refused by the validator, so the search skips them.
5. **Herd rows: tight.** `survive` reads 4 tramples under `herdRunSpeed` 5.5; the defender's `run` has 3.5 ticks. Left tight: a
   trample is meant to hurt.

## Open questions for the coordinator

1. **The prey row's hunter.** Should `<prey>:predator` read the hunter at a good performer's catch share, or count the encounters
   before the first split rather than in a whole life? A forager splits 144 ticks after birth and meets 138 hunters in 71400 ticks,
   so it meets 0.28 hunters before it first breeds. As built, no config can make the hunter rows and the prey rows green together.
2. **The sprint store is a fair-chase decision.** `step5-b` adopts the `courser` arm as part of the defaults. If the store is
   still open in fair-chase.md (T7b and T8 run on the arm role-budget T7 names), step 5's screen should carry `step5-b` and
   `step5-a` as two arms rather than one finalist.
3. **The defender.** Is a defence that cannot win by arithmetic (the smoke cell red on every config) recorded as a role that cannot
   work, per fair-chase.md gate 1, or does the plan take the slower kill (a predator bite of 6 or 4 of today's 20) into the screen?
4. **The cold stack.** Step 5 cannot choose it until status-effects.md T9 adds its keys; until then `--search` cannot gate a
   birth-energy rise with it. `step5-b` raises `entrantEnergy` only, and the sitter's ratio falls (largest 1.90 -> 1.67), so the gate
   holds without it.
5. **Trait spans.** `role:budget --genes corners` is on `feat/body-genes-p2` (PR 610), not on this branch, so the candidate spans of
   body-genes.md T17 are not read here. The candidates above are spec and world numbers only.
6. **`predator:living`** is re-read on these configs once the p4 fix lands, before the screen is written.

## Reproduce

```sh
npm run role:budget -- --check                                          # the defaults
npm run role:budget -- --config evals/fair-chase/<arm>.json --check     # each arm
npm run role:budget -- --search                                         # the search on the defaults
npm run role:budget -- --config evals/role-budget/step5-b.json --check  # a candidate
```
