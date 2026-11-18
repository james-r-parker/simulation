# E189 - recruitment levers without `specFlipNoHunt` (honest-budgets Phase 6, T39)

**Detector check (step 0).** The metrics are the E179 set, read as E179 read them: `eval.hunter_juvenile_death_share`
(a share of hunter-born juveniles that die before maturity), `eval.hunter_catches_per_1k` (a speed, so it rises with prey
density, never read alone), `eval.hunter_income_share.carcass`, and the recruit and carcass-loss detectors, which are
context at 16 seeds except the matured and lineage shares. The shared baseline is `evals/power/defaults-floor-on-E188.json`
(128 seeds, 200000 ticks, `baseline:status` current at 390acd9a, `rulesHash` 38be2908ad820c86).

**Baseline (E188, floor on, 128 seeds, 200000 ticks; the screen runs 400000 ticks, so these are context, the control arm is
the bar).** `eval.hunter_juvenile_death_share` 0.857; `eval.hunter_catches_per_1k` 1.29;
`eval.hunter_income_share.carcass` 0.150; `eval.boom_bust_count` 2.02; `eval.recruit_matured_share` 0.671;
`eval.recruit_lineage_share` 0.321; `eval.hunter_global_extinctions` 12.3 (`npm run baseline:table -- --plan
docs/designs/honest-budgets.md`).

**Prediction (recorded before the run).** E179 falsified `recruit`, `cub-plant` and `cub-size` because all three carried
`specFlipNoHunt`, which left no hunter alive on any of 16 seeds. Without it, one lever per arm on today's defaults
(`killGorgeShare` 0.4) reads alone, and at least one arm, or `recruit-all`, is the finalist: it lowers
`eval.hunter_juvenile_death_share` below 0.55 (the control sits near 0.86), keeps hunters alive at the end on at least 48
of 64 seeds (the control reads 41 of 64) when T36a runs it, and on 64 matched seeds `keepRule` reads no guard `WORSE`.
Theory: a juvenile hunter dies because it cannot yet kill (zero kills, 0.86 of juveniles die) and its parents are too
poor or too crowded out to feed it; relaxing the territory (`territoryMax` 4, `territoryRadius` 250), a larger split
reserve (`splitMinEnergyMultiplier` 0.85), a plant income while young (`juvenilePlantShare` 0.25) and a lower size
barrier (`huntSizeRatio` 0.9) each give a cub more time to learn. The most likely mover is `cub-plant` (it pays the
cub directly); `territory` is expected to raise `eval.recruit_lineage_share`; `split` is expected to cost catches
(fewer, richer splits). **Falsified (Stop-when)** when every arm reads `eval.hunter_catches_per_1k` or `held` `WORSE`
against the control. Screen verdicts at 16 seeds are only the metrics whose detectable change is 0.10 or less
(`eval.recruit_matured_share`, `eval.recruit_lineage_share`, `eval.hunter_juvenile_death_share` is judged by its mean and
the 0.55 bar, not a verdict); everything else is context.

**Principle check.** The levers change the world a run happens in (a config), not who breeds; no reward term pays for an
act; the hunt chain stays fail-closed (a cub still has to bite); no input is added.

**Arms** (`evals/screens/honest-recruit-2.grid.json`, 16 seeds, seed offset 0, 400000 ticks, policy live, floor on,
`specFlipNoHunt` unset everywhere): `control` is today's defaults. `territory` is `territoryMax` 4 and `territoryRadius` 250. `split` is `specialisations.predator.splitMinEnergyMultiplier` 0.85. `cub-plant` is `juvenilePlantShare` 0.25.
`cub-size` is `huntSizeRatio` 0.9. `recruit-all` is the four levers together.

**Run:** `scripts/run-detached.sh T39-screen --frozen -- npm run screen -- --grid
evals/screens/honest-recruit-2.grid.json` on branch `feat/honest-budgets-t39` (reports in
`evals/screens/results/honest-recruit-2/`). A finalist then runs T36a (the control and the finalist on seeds 65 to 128,
`--keep-rule`), which waits for the user's go-ahead.
