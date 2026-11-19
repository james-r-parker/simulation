# E-TS-1b - the ladder with `hunt-contact` gated on `prey-adrift` (training-stages Phase 6, T36, T39)

**Question.** Does `hunt-contact` pass once its gate reads contact (the `prey-adrift` drill, T35)? Does the ladder then pass
`hunt`?

**Prediction, written before the run (training-stages Experiments).** `hunt-contact` passes on at least 4 of 5 offsets (0, 64, 128,
192, 256) within its 60 generations; a stall on 2 of 5 makes the arena `evals/stages/hunt-contact.json` the next record. The
ladder ran on to `habitat`; no prediction was made for the later stages.

**Runs.** `npm run train -- --curriculum evals/train-ladder.json --until habitat --generations 380 --seed-offset <k> --workers 6`
from the `feat/training-stages-contact` tree (PR content: T33 to T35), `k` = 0, 64, 128, 192, 256; archives under
`.sim/train/ladder-1b-o<k>/` (not committed). Readings below are from each run's `curve.jsonl`.

## Offsets 0 and 256 are the same run

The episode seed of generation `g`, episode `e` is `seeds[(g x episodes + e + offset) mod 256]` and `evals/seeds.json` has 256
seeds, so offset 256 is offset 0: the two curves are identical to the digit (`prey-adrift` `edgeLow` 0.400 then 0.469, the same
`hunt` readings), and offsets 64, 128 and 192 are the same stream shifted by 2, 4 and 6 generations. This repeats in the plan:
T37's offsets 320, 384 and 448 repeat 64, 128 and 192. The five runs are **four** distinct runs; the prediction's "4 of 5" is
met as 4 of 5 runs and 3 of 4 distinct offsets (all of those that reach it). Offsets whose seeds differ are not independent
worlds either (same 256 worlds, other order), so a stage result on one offset is a lead, as in E-TS-1.

## Table

| Offset      | `nursery`                                                | `hunt-contact` (`prey-adrift` `edgeLow`, bar 0.001) | `hunt`                                                               |
| ----------- | -------------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| 0 (and 256) | pass at generation 20                                    | pass at 40 (0.400, 0.469)                           | stall at 60 gens: `winShareOverReference` 0.057, `kin-spared` -0.015 |
| 64          | regression, stall at 40 (`food-behind` 0.464 then 0.239) | not reached                                         | not reached                                                          |
| 128         | pass at 20                                               | pass at 40 (0.704, 0.756)                           | stall: `winShareOverReference` 0, `prey-crossing` -0.015, kin -0.015 |
| 192         | pass at 20                                               | pass at 40 (0.095, 0.007: bar 0.001)                | stall: same readings as 128                                          |

Offset 64's nursery readings are the E-TS-1 ones to the digit (same seeds, deterministic): T38's fix is still open. Offset 192
passes `hunt-contact` with 0.007 only (lost trials `bit-prey-lived` 68 of 113 against `never-in-jaws` 45): its hunters bite
the prey and do not kill it, a different shape from the other offsets (offset 128: `prey-died-unkilled` 16, `bit-prey-lived` 4).

`hunt` (every offset that reaches it, readings at 50 to 100 generations, constant after the first checkpoint because the champions
do not change): `prey-ahead` `winShareOverReference` 0 to 0.057 against 0.5, `winShareLow` 0 to 0.008; `prey-crossing` `edgeLow`
-0.007 to -0.015 (125 to 128 of 128 `never-in-jaws`); `kin-spared` `edgeLow` -0.015 (`bit-kin` 110 to 128 of 128).

## Verdict

- `hunt-contact` passes on 4 of 5 runs (3 of 4 distinct offsets that reach it): the **prediction holds**, with the 5th run
  `nursery`'s offset 64, which is a nursery stall, not a contact stall. The lever "the gate asks for contact" was the right
  diagnosis of E-TS-1 (theory 1).
- `hunt` stalls on all four runs that reach it: the next record, below.

## Outcome record 3 - `hunt` stalls (diagnosis for T39 and T40)

**Observation.** The hunters that pass contact never close on a prey that runs (`prey-ahead` 0 to 2 wins of 128) and bite their
siblings in the `kin-spared` staging (`bit-kin` 110 to 128 of 128).

**(a) `kin-spared`.** The elites of offsets 0 and 128 bite the sibling on 62 to 64 of 64 trials (`bit-kin`; the `memoryless`
reference 51 of 64), identically with `hunterBiteBias` -0.5 in the drill's `--config`
(`feat/honest-budgets-t41`, merged on a scratch branch): the key shapes the BITE bias of a newborn, and a drill stages the
trained adult weights, so it does nothing to a staged elite. Whether the lever changes selection is a training question and E-TS-1c
runs it (below). Not the open-jaw-at-birth reading of E192 for the elites as staged: they bite what is in the jaws.

**(b) `prey-ahead` and `prey-crossing` against fleers of graded strength** (`graded-fleer.mjs`, 64 trials, seed 1, the forager's
`sprintBoost` cut from 1 to 0.05; elites are the final predator elites of `ladder-1b-o0`, `o128` and `o192` at generation 99;
`graded-fleer.json`):

| `prey-ahead` wins of 64 at `sprintBoost` 1 / 0.6 / 0.4 / 0.2 / 0.05 | 1     | 0.6   | 0.4   | 0.2    | 0.05   |
| ------------------------------------------------------------------- | ----- | ----- | ----- | ------ | ------ |
| offset 0 elite, cell 57 (cell 3)                                    | 5 (0) | 8 (0) | 6 (0) | 16 (0) | 15 (0) |
| offset 128 elite, cell 5 (cell 56)                                  | 0 (0) | 0 (0) | 0 (0) | 3 (0)  | 4 (0)  |
| offset 192 elites, cell 7 and 88                                    | 0, 0  | 0, 0  | 0, 0  | 0, 0   | 0, 0   |
| `memoryless`                                                        | 14    | 18    | 19    | 20     | 21     |
| lesson oracle                                                       | 21    | 31    | 34    | 43     | 48     |

`prey-crossing` reads the same (elites 0 to 13, `memoryless` 10 to 28, oracle 31 to 53). The envelope is a part: the scripted
references climb as the prey's sprint falls (the oracle 21 to 48). The elites do not follow: even a prey that hardly sprints is
caught on 0 to 15 of 64, where an inert prey is caught on 32 to 54 (E-TS-1 record 1, T34). So the gap is between a prey that
does not run and a prey that runs at all: no rung. Nature-first: a young cheetah is given live, weakened prey, then healthy prey.

**Theory.** Two, each falsifiable. (1) `hunt` has no rung: the elites that pass contact cannot catch even a weak fleer, and
the hunt world offers them no weakened prey to learn it from (its prey are brain-driven foragers that do not flee). Falsified when
elites trained in a world whose prey sprint at `sprintBoost` 0.2 still win under 10 of 64 of `prey-weak`. (2) `kin-spared` is
a selection problem (the siblings stand in the jaws and BITE is held open by the birth bias): falsified when a `hunt` stage with
`hunterBiteBias` -0.5 still reads `kin-spared` `edgeLow` under 0.

**Principle check.** The rung `hunt-weak` is a world change (prey `sprintBoost` 0.2 for the four prey specialisations, the hunt
arena) and a drill and gate (`prey-weak`): no fitness term, no input, no script in the world (the fleer is a detector's
partner, as in `prey-ahead`), no bar lowered (`hunt` keeps its gate). Validity at 64 trials, seed 1: `memoryless` 16,
`input-reader` 57, oracle 50, random brains 0 of 64 (`node scripts/ladder-validity.mjs`: every reference passes, random fails).

**Prediction (E-TS-1c, T41).** Ladder `nursery`, `hunt-contact`, `hunt-weak`, `hunt` on offsets 0, 128, 192 and 16 (256 repeats 0;
64 waits for its nursery fix), `hunterBiteBias` -0.5 on the `hunt-weak` and `hunt` worlds only: `hunt-weak` passes on at least 3
of 4; `hunt` stalls on `prey-ahead` `winShareOverReference` on at least 3 of 4 (the lesson is one rung up, not solved by one
stage); `kin-spared` `edgeLow` at the `hunt` stage reads at least 0.001 on at least 2 of 4, else theory (2) is falsified and the
lever is not the cause.

**Task rows.** T36 (built), T39 (this record), T40 (the rung), T41 (E-TS-1c).
