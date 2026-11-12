# E163 - the graze-hold re-read (eat-choice T19)

**Prediction (recorded before the run):** on seeds 65 to 128 at 400000 ticks, the head with the graze hold (eat-choice
T18) reads `eval.deliberate_food_share` not worse than `evals/decisions/E162/main.report.json` (0.43), and the keep rule
still reads no guard `WORSE`. Falsified when `deliberate_food_share` reads worse against main.

**Run:** `npm run eval -- --seeds 64 --seed-offset 64 --ticks 400000 --policy live --out evals/decisions/E163/head.report.json`

Results follow when the run ends.

## Results

The head with the graze hold, seeds 65 to 128 at 400000 ticks, against main (`evals/decisions/E162/main.report.json`)
and against the switched world without the hold (`evals/decisions/E162/head.report.json`), which isolates the hold.

| Reading                               | Main   | Switch, no hold (E162) | Switch with hold (E163) | Hold vs no hold        |
| ------------------------------------- | ------ | ---------------------- | ----------------------- | ---------------------- |
| `eval.deliberate_food_share`          | 0.426  | 0.309                  | 0.351                   | better (+0.042)        |
| `eval.deliberate_food_energy_per_1k`  | -      | 117                    | 141                     | +21%, interval above 0 |
| `eval.food_energy_per_1k`             | 530    | 378                    | 400                     | no-difference          |
| `eval.population_mean`                | -      | 189                    | 253                     | +34%, interval above 0 |
| `eval.diversity`                      | 0.0766 | 0.0631                 | 0.0674                  | better (+7%)           |
| `eval.lineages_alive`                 | 4.40   | 3.63                   | 3.25                    | worse (-10%)           |
| `eval.toxic_avoidance`                | 0.937  | 0.885                  | 0.920                   | +4%, interval above 0  |
| keep rule alive (harmed vs recovered) | -      | 13 vs 14 against main  | 7 vs 21 against main    | 5 vs 18, better        |
| keep rule under80                     | -      | 8 vs 17 against main   | 8 vs 33 against main    | 7 vs 23, better        |

**Verdict: the prediction is falsified.** `eval.deliberate_food_share` still reads worse than main (0.43 to 0.35, -18%):
the hold sees grazing, and about a quarter of the gap closes, but most of the drop is real - foragers on the eat choice
take more of their food without a closing approach. The hold itself is a clear gain: in-world merit now credits a
deliberate forager's grazing, so the alive and under-80 guards read better against both main and the unheld switch,
the population mean rises 34%, and diversity and toxic avoidance recover part of E162's loss. `eval.lineages_alive`
falls again (-10%). The hold stays; the gap to main reopens G1b (eat-choice.md, Decisions).
