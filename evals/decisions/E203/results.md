# E203 - champions-v1 with the E-TS-1h offset 144 champions against live, 64 seeds (training.md Phase 3 trial)

An experiment only: `LIVE_POLICY` is unchanged and nothing is published, pending the user's watch.

**Prediction.** Not a new one: it is the done line of training.md Phase 3, written in that doc before the run (better on
`eval.food_energy_per_1k` and `eval.food_energy_per_1k@20k`, not worse on `eval.floor_episodes`).

**Runs.** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 200000` with `--policy live` and with `--policy champions-v1
--policy-options {championsDir: .sim/champions/keep/ets-1h-o144}` (the champions exported from the E-TS-1h offset 144
`archive-159.json`), then `eval:compare --keep-rule`. The full text is `compare.txt`.

## Reading

| Metric                         | live  | champions-v1 | Change | Verdict    |
| ------------------------------ | ----- | ------------ | ------ | ---------- |
| `eval.food_energy_per_1k`      | 411.5 | 447.1        | +8.7%  | better     |
| `eval.food_energy_per_1k@20k`  | 378.8 | 436.3        | +15.2% | unverified |
| `eval.floor_episodes`          | 0.34  | 0.25         | -27%   | unverified |
| `eval.hunter_catches_per_1k`   | 1.265 | 1.523        | +20.4% | better     |
| `eval.median_lifespan`         | 3783  | 3403         | -10.0% | worse      |
| `eval.diversity`               | 0.074 | 0.062        | -16.8% | worse      |
| `eval.collision_death_share`   | 0.247 | 0.294        | +19.0% | worse      |
| `eval.mean_fitness.defender`   | 1598  | 1498         | -6.3%  | worse      |
| `eval.mean_fitness.reproducer` | 1621  | 1535         | -5.3%  | worse      |

**Keep rule:** every guard reads no harm (alive, under-80, held, `hunter_catches_per_1k`). The adoption bar is not met (hunters
alive 46/64 against the 0.75 needed).

## Verdict

The done line is not met as written: `food_energy_per_1k` is better, but `@20k` and `floor_episodes` are `unverified`. The keep
rule shows no harm and hunters catch 20% more. The costs are shorter lives, less diversity and more collision deaths. No adoption;
the user watches before any change to `LIVE_POLICY`.
