# E-RB-2 - the defender budget on the defaults and the shove arms

`npm run role:budget -- --rows defender:predator --search --check` on the default config and on three arms that turn the
defender's shove on (`arms/shove-cost0.json`, `shove-cost2.json`, `shove-cost4.json`: `defenderRepelEnergy` 40,
`defenderRepelImpulse` 4, `defenderRepelCost` 0, 2 and 4, the first arm of prey-guilds.md Phase 2). The reports are `<arm>.txt`
(the matrix, the detail, the search and the cross-check, which exits 0 on every arm: no reading outside its tolerance) and
`<arm>.json`; the override files the search wrote are in `evals/role-budget/` (`<arm>-defender-predator-<goal>-<k>.json`, the
smallest change first, read by `npm run audit:chase -- --config <file>`).

The scene is the one of `defenceTimeline`: a perfect hunter creeps up on a standing forager from its awareness gap (345 px) at
cruise speed, the forager calls alarm 2 ticks after it sees the hunter, and the defender, 150 px from the forager (the
model's `defenderGap`) and facing it, hears the call 1 tick later, moves 2 ticks after that, and runs at the hunter holding
`BITE` (which the shove needs, so it moves at the grazing gait). Cells are slack in ticks (`X` impossible, `-` not read).

| Arm          | hear | turn | run | intercept | smoke | Status     | Binding    | Touches the hunter | Caller dies (no defender / with) | Search: the defence | Search: the smoke |
| ------------ | ---- | ---- | --- | --------- | ----- | ---------- | ---------- | ------------------ | -------------------------------- | ------------------- | ----------------- |
| defaults     | 48   | -    | X   | X         | X     | impossible | repel: off | never              | tick 27 / tick 27                | none                | none              |
| shove cost 0 | 48   | -    | X   | X         | X     | impossible | run        | never              | tick 27 / tick 27                | 2 settings          | none              |
| shove cost 2 | 48   | -    | X   | X         | X     | impossible | run        | never              | tick 27 / tick 27                | 2 settings          | none              |
| shove cost 4 | 48   | -    | X   | X         | X     | impossible | run        | never              | tick 27 / tick 27                | 2 settings          | none              |

Re-run on 2026-11-21 after the Phase 1 review fixes (the size gate read on each bite by `mayBite`, `strikeMissCost` charged to a
hunter with nothing in its jaws, the hunter's start read through `frameOptions` for the `perfect` tier): no verdict changes. Every
row, cell, binding and kill tick above is as before; the one number that moved is the search's `damping` x0.75 setting, whose hear
and run slack read 24 and 68 ticks where they read 25 and 69 (its intercept slack is still 13).

## Reading

- **The prediction held:** every cell the defender needs is red at the defaults, and with the shove on the row is still red.
  At the defaults the binding is `repel: off` (the defender has no power on arrival, `defenderRepelEnergy` and
  `defenderRepelImpulse` are 0). With the shove on the binding is `run`.
- **The defender is too late by arithmetic, not by the shove.** The hunter is seen at tick 0, reaches the caller at tick 23 and
  kills it at tick 27 (5 bites at 100 energy, 500 to the kill line). The caller's alarm fires at tick 2, the defender hears at
  tick 3 and moves at tick 5, which leaves it 22 ticks to cover about 150 px, turn through more than 90 degrees and meet a hunter
  that is already past it. It never touches the hunter, so the shove never fires and its cost (0, 2 or 4) cannot show.
- **Hearing is not the problem:** the hear slack is 48 ticks, the 49 audible ticks of a call at 150 px less the first.
- **The search** names two single settings for the defence with the shove on: `damping` x0.75 (0.7125) and `maxThrust` x0.5
  (0.35), both a slower world (a slower hunter) rather than a stronger shove; with them the intercept slack is 13 and 8 ticks.
  It names nothing for the smoke, and nothing for the defaults (no scaling turns a shove of 0 on; `--set` the shove first).
- **The smoke cell is red everywhere:** the defender can release at tick 41 (22 ticks to walk onto the line, 14 to turn its
  back to the hunter) and the latest release that still puts the cloud ahead of the hunter is tick 7; the slack is -34 ticks
  for the defender and -2 for the caller. The prey's smoke is also short: a prey that drops a cloud at 240 px hides for 15 ticks
  and needs 31 to leave a hunter's view (the `smoke:prey` reading of the cross-check).

## What the numbers do not say

- The scene puts the defender 150 px from the caller, `defenderGap` of the model. A defender closer than the 58 px sum of the
  two sizes is pushed off by the caller; at any gap tried (0.1 to 150) the defaults are red.
- The defender's smoke geometry assumes it stands on the line when it releases. A body at its sprint cap coasts about 228 px
  when it stops pushing (`coast` in the report's source), so the defender cannot stop on the spot it walks to: the smoke cell
  flatters the defender, and the cross-check plays the release from a defender already standing there.
- The defender's cloud, blind ticks and the caller's escape are cross-checked only for a release before the hunter reaches the
  cloud; after that the hunter bumps the defender, which the formula does not model.
