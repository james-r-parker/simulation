# E159 - E-EC-1: the eat-choice first pass (recorded before the run)

Prediction (docs/designs/eat-choice.md, Labels): with `grazeThrust` below 1, `eval.food_contact_bite_share` falls below
`bite`'s, with no keep-rule guard worse. Falsified when the share does not fall below `bite`'s, or a guard reads `WORSE`.

The grid: `evals/screens/eat-choice.grid.json`, 8 arms (adds `bite-grazemiss-1`, G4b) x 16 seeds x 400000 ticks, floor on, policy live, reference
`bite` (the defaults with G1 and G3 on). Metrics are read after tick 200000 with `eval.floor_episodes` listed; an arm over
twice the reference's floor episodes is reported and not ranked.

The comparison with the parent of G1 is one separate eval, `defaults` on `origin/main` at 400000 ticks and seeds 1 to 16,
read against the grid's `bite` arm; the `bite-fat-*` arms are read against `bite` (no `fat-*` arms run on main). Results and the screen's `table.md` and `verdicts.json` are committed here after the run.
