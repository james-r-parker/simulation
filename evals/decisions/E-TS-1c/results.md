# E-TS-1c - the ladder with `hunt-weak`, and a closed birth bias on the hunt worlds (training-stages Phase 6, T41, T42)

**Question.** Does a weakened-prey rung (`hunt-weak`, gate `prey-weak`) let the ladder pass, and does `hunterBiteBias` -0.5
on the `hunt-weak` and `hunt` worlds cure the `kin-spared` reading?

**Prediction, written before the run (E-TS-1b record 3).** `hunt-weak` passes on at least 3 of 4 offsets (0, 128, 192, 16);
`hunt` still stalls on `prey-ahead` `winShareOverReference` on at least 3 of 4; `kin-spared` `edgeLow` at the `hunt` stage reads at
least 0.001 on at least 2 of 4, else the birth bias is not the cause.

**Runs.** `npm run train -- --curriculum evals/train-ladder.json --until habitat --generations 380 --seed-offset <k> --workers 6`
from a scratch branch (the `feat/training-stages-hunt` tree, `feat/honest-budgets-t41` merged for `hunterBiteBias`, and the key
-0.5 added to `evals/stages/hunt-weak.json` and `hunt.json` there only), `k` = 0, 128, 192, 16; archives under
`.sim/train/ladder-1c-o<k>/`.

## Table

| Offset | `nursery` | `hunt-contact` (`prey-adrift`) | `hunt-weak` (`prey-weak` `edgeLow`, bar 0.001)             | `hunt` (to generation 120)                                                                |
| ------ | --------- | ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 0      | pass      | pass (0.400, 0.469)            | pass at 60 (0.012, 0.028)                                  | stall: `winShareOverReference` 0.031, `prey-crossing` 0.012 (passes), `kin-spared` -0.015 |
| 128    | pass      | pass (0.704, 0.756)            | stall at 60 gens (-0.013; 127 of 128 lost `never-in-jaws`) | not reached                                                                               |
| 192    | pass      | pass (0.095, 0.007)            | stall (-0.015)                                             | not reached                                                                               |
| 16     | pass      | pass (0.370, 0.370)            | stall (-0.010, -0.007)                                     | not reached                                                                               |

## Verdict

- `hunt-weak` passes on 1 of 4: **falsified** (at least 3 of 4). `kin-spared` reads -0.015 on the one run that reaches `hunt`
  (at least 2 of 4 predicted): **falsified**, so the closed birth bias is not what keeps the siblings bitten.
- `hunt` stalls on `prey-ahead` on the 1 run that reaches it; the clause is undecided on the others.

## Outcome record 4 - the hunt worlds run out of prey, and only deaths after tick 10000 are offered

**Observation.**

1. Stage-world census (`stage-prey.mjs`, offset 128's generation 99 archive, `hunt-weak.json`, seed 1): tick 0 forager 8,
   predator 26, reproducer 14, scout 6, defender 6; tick 100 forager 4, predator 20; tick 500 forager 0, predator 13, no prey
   left; tick 2000 predator 6. `hunt.json` the same shape (4000 ticks: 23668 predator agent-ticks, 1083 forager). The prey are
   gone after about 500 ticks of a 60000-tick episode.
2. Kills are the same shape (E-TS-1 record 1, T34): 20 to 29 of 27 to 39 in the first 400 ticks, at most 1 after tick 5000.
3. The trainer offers only deaths from `OFFER_FROM_TICK` 10000 (`js/evo/trainer.js`; `--offer-from`), after the prey are gone. The
   stage's selection reads the hunters that lived through 9500 ticks without prey, not the ones that caught it.
4. The champions do not improve: on offsets 128, 192 and 16 the `prey-weak` `edgeLow` is the same at every checkpoint from 50 to
   100 (-0.013, -0.015, -0.010 to -0.007), and the elites' `prey-weak` wins stay at 0 to 2 of 64 from the end of `hunt-contact`
   (generation 39: 1 and 0, 1 and 0, 0 and 0) to generation 99 (offset 128: the same cells 5 and 56; offsets 192 and 16: one
   cell replaced each, still 0 to 2 wins; `elite-profile.json`).
5. The one pass (offset 0) is an inherited elite: its `hunt-contact` elite cell 57 already won 13 of 64 `prey-weak` at generation
   39 (thrust above 0.5 on 0.54 of the in-view ticks, median closest approach 3.0 summed radii, SPRINT 0.26) where the other
   offsets' elites thrust on 0.02 to 0.26, never close (median closest 4.04, the start) and win 0 to 2 of 64
   (`elite-profile.json`). `hunt-weak` selected nothing; offset 0 started past the bar.
6. The sprint lever does act where prey sprint: foragers' mean speed 3.42 (`hunt`) against 2.76 (`hunt-weak`) over the same
   ticks. It matters little, with so few prey.

**(b) kin biting survives the closed birth bias, and training does not reopen it.** The elites' BITE output bias is -0.5 on
offset 0's `hunt`-stage elite (the ceiling the key sets, not moved by 20 generations) and 0 on the elites that came from stages
without the key (the offset 128, 192 and 16 elites predate it): the bias is not what bites the sibling. Every elite bites on sight
of prey: the prey-strength skip weight into BITE is +1.9 to +4.0, the kin-strength weight -0.27 to +0.31 and the exported champions'
kin to BITE cell +0.13 to +0.22 (`skip-cells-o0.json`), where the `kin-sparing` reference needs the kin channel to beat the prey one
(`spareKin` in `js/evo/lesson-reference.js` reads the nearest kin ray and the nearest prey ray). The information is there (the
`kin` pooled channel); nothing in the world pays for biting kin enough to move a weight from 0 to about -2. `bit-kin` is 110 to 128
of 128 on every run.

**Theory.** (1) The stage worlds' prey vanish before the offered window opens, so the hunt family has no selection on the lesson.
Falsified when a run that offers the first seconds (`--offer-from 100`, short episodes) still stalls `hunt-weak` on 2 of 4 offsets.
(2) `kin-spared` needs a kin inhibition on BITE the world does not select for in the time a hunter lives with kin around (the
innate prior, `applyHunterReflex`, pulls kin in (`kinPullWeight`) and never inhibits the bite on it); falsified when the elites of
the run in (1) read `kin-spared` `edgeLow` at least 0.001 without any new rule.

**Natural analogue.** Lion and wolf pups learn to hunt during a window when prey and a kin that tolerates mistakes are both
present; the young inhibit aggression toward pack mates innately and learn who is a mate (kin recognition and bite inhibition in
canids and felids, play-biting that is stopped by the playmate's yelp). Selection here sees neither window.

**Principle check.** Offering the first ticks of an episode is a training schedule, not a fitness term: no reward, no input, no
script. A kin bite inhibition prior (an innate ceiling on the kin-to-BITE weight, as `hunterBiteBias` caps the BITE bias) is a
sim rule behind a new config key (it moves `rulesHash`) and needs the keep rule and a scene metric before it is built: proposed,
not built.

**Exam of the offset 0 run (T42).** `npm run train:export` on `archive-119.json` wrote 6 champion files to
`.sim/champions/ets-1c-o0` (index `champions-index-o0.json`, skip cells `skip-cells-o0.json`); `npm run train:exam -- --run
.sim/train/ladder-1c-o0` (`exam-o0.txt`): row 1 Valid pass, row 2 Reflex reported, row 3 Drill pass, row 8 Diverse **fail** (the
high band has no edge over random brains on matched trials), rows 4, 5, 6, 7, 9, 10 not run (no cross-play, league, world reports,
descendants, replicates or watch). "Not good yet: rows 4, 6, 7, 8, 9, 10 are open." A bug found on the way: `reflexScores` read
`row.score` of a champion with no reflex case (a reproducer, scout or defender) and crashed the exam; fixed with a test.

**Prediction (E-TS-1d, T43).** The same ladder and scratch branch, `--ticks 4000 --offer-from 100` added, on offsets 0, 128, 192
and 16: `nursery` passes on at least 3 of 4 (the lesson is not harmed by the short episode); `hunt-weak` passes on at least 3 of
4 (offsets 128, 192 and 16 stalled at 60 generations before); `kin-spared` is not predicted to move (no kin lever): reads under
0.001 on at least 3 of 4 runs that reach `hunt`. A stall of `hunt-weak` on 2 of 4 falsifies theory (1).

**Task rows.** T42 (this record, the exam run and the fix), T43 (E-TS-1d), T44 (the kin bite inhibition, proposed: needs the
keep rule on 64 seeds and a scene metric before any code).
