# E-TS-1f - the ladder with a prey share in the hunt worlds (training-stages Phase 6, T45 to T47; record E196)

**Question.** The census (E-TS-1d record, T45) showed the hunt worlds seed 41 of 60 agents as predators and the prey are gone by tick
500 whatever the food or head count. Does a `preyShare` of 0.9 on `hunt-weak` and `hunt` (T46) let `hunt-weak` select on its lesson and
stay passed?

**Prediction, written before the run (training-stages Phase 6, `E-TS-1f` row, commit ab521c07).** Without `hunterBiteBias`, with
`preyShare` 0.9, `--ticks 4000 --offer-from 100`, offsets 0, 128, 192, 16: the census reads at least 8 prey alive at tick 500 of
`hunt-weak`; `hunt-weak` passes on at least 3 of the 3 offsets that reach it and none returns to it from `hunt`; `nursery` stalls on
offset 16 again (a determinism check). Falsified when the census reads under 2 prey at tick 500 or `hunt-weak` passes on 2 or fewer
of the 3.

**Runs.** `E-TS-1f-o<k>`, `npm run train -- --curriculum evals/train-ladder.json --until habitat --generations 380 --ticks 4000
--offer-from 100 --seed-offset <k> --workers 8` from `feat/training-stages-hunt` at ab521c07 (no `hunterBiteBias`); archives under
`.sim/train/ladder-1f-o<k>/`.

## Table

| Offset | `nursery`                                   | `hunt-contact` | `hunt-weak` (`prey-weak` `edgeLow`, bar 0.001)            | `hunt`                                                                                                                                           |
| ------ | ------------------------------------------- | -------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0      | passed at 20                                | passed at 40   | **passed at 100** (0.007; -0.013 to -0.003 from 50 to 80) | stall at 60 generations: `prey-ahead` `winShareOverReference` 0.010 to 0.119 (0.119 at 150 and 160), `prey-crossing` -0.015, `kin-spared` -0.015 |
| 128    | passed at 30                                | passed at 50   | **stall** (-0.015 at 60, -0.010 to -0.007 to 110)         | not reached                                                                                                                                      |
| 192    | passed at 30, regressed at 50, passed again | passed at 70   | **passed at 90** (0.007)                                  | stall: 0.010, -0.013, -0.015 at every checkpoint from 100 to 150; no return to `hunt-weak`                                                       |
| 16     | **stall** (0.523, then 0.099, 0.207, 0.207) | not reached    | not reached                                               | not reached                                                                                                                                      |

## Verdict

- The census clause holds: at tick 500 of `hunt-weak` the world holds 22 prey on the E-TS-1d offset 128 archive at `preyShare` 0.9
  (3 at 0.6, 8 at 0.8; 0 to 1 without it), seed 1.
- `hunt-weak` passes on 2 of the 3 offsets that reach it (0 and 192; 128 stalls): the prediction (3 of 3) is **falsified**. By the
  rule written with it, a 2 or fewer of 3 falsifies.
- No pass returns to `hunt-weak` from `hunt` (0 of 2 cycle): the clause holds on the two runs that reach `hunt`. In E-TS-1d offset 128
  cycled four times; here it never reached `hunt`.
- `nursery` on offset 16 stalls with the same digits as E-TS-1d at every checkpoint: the determinism check holds.
- The prey share moved which offsets pass, not how many: offset 0 now passes (stalled in E-TS-1d at -0.0026) and offset 128 now stalls
  (passed in E-TS-1d). Offset 128's digits through generation 50 are those of E-TS-1d, so the runs part at `hunt-weak`, where the prey
  share first acts. Offset 192 passes 40 generations earlier than in E-TS-1d (generation 90 against 130), at a thinner margin (0.007
  against 0.082).
- `hunt` reaches its best `prey-ahead` `winShareOverReference` yet on offset 0 (0.119, bar 0.5; E-TS-1d at most 0.031), still far from
  the bar. `kin-spared` reads -0.015 on both runs that reach `hunt`; `prey-crossing` -0.015 and -0.013.

## The two checks behind the next run (E-TS-1g)

**(a) Is a middle rung the clear next step? Yes, on the numbers.** The graded-sprint table (`graded-sprint.mjs`,
`graded-sprint.json`: `prey-ahead` with the forager's `sprintBoost` cut, 64 trials of seed 1, wins; the elites of offset 0 generation
159 and offset 192 generation 149, offset 0 generation 99 as the `hunt-weak` passer; `memoryless` and the oracle for reference):

| sprintBoost (default 1)                    | 1   | 0.8 | 0.6 | 0.5 | 0.4 | 0.3 | 0.2 | 0.05 |
| ------------------------------------------ | --- | --- | --- | --- | --- | --- | --- | ---- |
| o0 gen 159 elite, cell 9                   | 1   | 2   | 6   | 3   | 8   | 8   | 10  | 11   |
| o0 gen 159 elite, cell 66                  | 0   | 2   | 5   | 7   | 9   | 11  | 11  | 10   |
| o192 gen 149 elite, cell 42                | 1   | 4   | 4   | 6   | 5   | 9   | 8   | 8    |
| o192 gen 149 elite, cell 54                | 0   | 0   | 0   | 0   | 0   | 0   | 0   | 0    |
| o0 gen 99 elite (hunt-weak passer), cell 7 | 1   | 2   | 1   | 1   | 5   | 6   | 6   | 11   |
| `memoryless`                               | 14  | 14  | 18  | 19  | 19  | 21  | 20  | 21   |
| oracle                                     | 21  | 28  | 31  | 33  | 34  | 39  | 43  | 48   |

The elite's win share climbs smoothly as the prey's sprint falls (0 to 1 of 64 at the full sprint, 3 to 7 at 0.5, 6 to 11 at 0.2),
with no cliff: a hunter that passes the 0.2 rung (cell 7: 6 of 64 at 0.2) wins 1 at 0.5 and 1 at the full sprint, so the
0.2 rung does not carry it to 0.5, and the gap from 0.2 to 1 is five times the sprint with nothing between. The `hunt-mid` rung is
sprintBoost 0.5 in the hunt world (`evals/stages/hunt-mid.json`) gated on `drill.prey-mid.edgeLow` 0.001 (the `prey-ahead` staging,
the fleer in an arena with the forager's `sprintBoost` 0.5), the bar unchanged. Gate validity at 64 trials, seed 1
(`ladder-validity.txt`): `memoryless`, `input-reader`, `kin-sparing` and the oracle pass it and the random brains fail it, level
`memoryless` (memoryless 19 of 64, oracle 33). Elite cell 54 (offset 192) wins 0 at every sprint: a hunter with no strike, a reading
of that run's elite and not of the lever.

**(b) Are kin rare in the hunt worlds? No: the premise does not hold.** `kin-census.mjs` (one 4000-tick episode, offset 0 generation 159
elites in `hunt.json` at `preyShare` 0.9, seed 1; `hunt-weak.json` from the generation 99 archive for comparison), per hunter-tick:

| World       | Kin within 1.5 sizes of touching | Wants BITE of those | Wants BITE with no kin close | Recoil energy per hunter-tick | Recoil beside kin |
| ----------- | -------------------------------- | ------------------- | ---------------------------- | ----------------------------- | ----------------- |
| `hunt`      | 0.339 (kin in 200 units: 0.444)  | 0.804               | 0.659                        | 1.74 (40760 over 23474)       | 40680 of 40760    |
| `hunt-weak` | 0.100 (kin in 200 units: 0.138)  | 0.562               | 0.565                        | 0.23 (2800 over 11978)        | 2800 of 2800      |

The births that make kin (83 in `hunt`) come from the hunters themselves, so a third of hunter-ticks have kin touching in `hunt` and a
tenth in `hunt-weak`. Biting kin is refused by the bite rule (`couldBite`, `js/sim/bite-rule.js`) and costs only the recoil
(`recoilEnergy` 20 once a tick, `js/sim/feeding.js`), and all but 80 of the recoil energy is paid beside kin: 1.74 energy per
hunter-tick in `hunt`, the whole refused-bite cost there. So the stage can teach sparing and charges for failing; what it lacks is
discrimination: the elite wants the bite on 0.80 of kin-close ticks and on 0.66 of ticks with none (`hunt`), 0.56 against 0.57 in
`hunt-weak`. The hunters bite on sight of anything (the blind biting of E192; the closed bias for it, E193, cost 49% of catches), and
the kin lesson sits under that general habit: the extra 14 points beside kin are the whole kin signal. That is the finding; the
coordinator's proposal (siblings seeded together, as littermates are) would raise kin contact in the first ticks (kin come from births,
after tick 0), but kin are already common, so it is not a clear lever and is left a proposal (T51).

## What this run does and does not show

It shows a prey share moves which offsets pass `hunt-weak` without raising the count, that the nursery stall is deterministic, and that
`hunt` is closer than before on `prey-ahead` (0.119). Four offsets and one archive each are leads; the nursery stall (offsets 64 and 16)
is unchanged. No eval ran, so there is no `eval:compare` verdict.

## Next

`E-TS-1g` (training-stages Phase 6, T48 to T50): the ladder with `hunt-mid`, offsets 0, 128, 192 and 48.
