# E160 - the eat-choice second pass (E-EC-2 and the keep rule at 64 seeds)

Seeds 1 to 64 x 400000 ticks, floor on, policy live. Grid `evals/screens/eat-choice-64.grid.json`;
`main-defaults.report.json` is the defaults on origin/main 4faea422 on the same seeds.

| arm                   | lowest pop p50 | floor eps | floor birth share | food-contact bite | full-contact bite | fat speed ratio | bite idle | pop mean |
| --------------------- | -------------- | --------- | ----------------- | ----------------- | ----------------- | --------------- | --------- | -------- |
| E160-main-defaults-64 | 8.00           | 4.64      | 0.02              | 0.50              | 0.51              | 1.32            | 0.73      | 194      |
| bite                  | 8.00           | 10        | 0.08              | 0.18              | 0.26              | 1.30            | 0.68      | 98       |
| bite-graze-5          | 8.00           | 5.44      | 0.04              | 0.20              | 0.27              | 1.20            | 0.74      | 133      |
| bite-fat-5            | 8.00           | 8.00      | 0.06              | 0.16              | 0.22              | 1.01            | 0.73      | 129      |
| bite-graze-fat        | 8.00           | 5.97      | 0.05              | 0.11              | 0.15              | 0.97            | 0.72      | 143      |
| bite-strike-2         | 8.00           | 5.41      | 0.03              | 0.20              | 0.28              | 1.29            | 0.68      | 186      |

Keep rule against main's defaults (`npm run eval:compare -- main-defaults.report.json <arm> --keep-rule`):

| Arm            | Verdict | Guard that fails                                                   | Hunters alive | Seeds under 80 | Population mean |
| -------------- | ------- | ------------------------------------------------------------------ | ------------- | -------------- | --------------- |
| main defaults  | -       | -                                                                  | 47/64         | 38/64          | 194             |
| bite (G1, G3)  | WORSE   | under80: 18 harmed vs 6 recovered, p 0.023                         | 47/64         | 50/64          | 98              |
| bite-graze-5   | WORSE   | held: 6 vs 0, p 0.031                                              | 53/64         | 38/64          | 133             |
| bite-fat-5     | WORSE   | held 6 vs 0, p 0.031; hunter catches -32%                          | 46/64         | 46/64          | 129             |
| bite-graze-fat | WORSE   | hunter catches -14% [-0.042, -0.010]; held, alive, under80 no harm | 52/64         | 34/64          | 143             |
| bite-strike-2  | WORSE   | alive: 27 vs 6, p 0.0003; hunter median life 3683 to 1146          | 23/64         | 26/64          | 186             |

Predictions:

- E-EC-1 (E159) is falsified at 64 seeds: `bite-graze-5` reads `eval.food_contact_bite_share` 0.201 against `bite`'s
  0.183 (interval [-0.029, 0.065]). The 16-seed fall did not replicate.
- E-EC-2 holds: `bite-graze-fat` reads `eval.full_contact_bite_share` 0.153 against `bite-graze-5`'s 0.274 (difference
  -0.121, interval [-0.169, -0.078]). Near a full store, foragers stop biting once fat costs speed.
- G4 at 2 does not land: hunters die out on more seeds, and `eval.bite_idle` is not lower than `bite`'s.

Reading: G1 costs the world foragers (population mean halves, more seeds under 80). Of the levers, graze plus fat comes
closest: it clears held, alive and under80, and fails only on hunter catches, by 14%. A strike cost raises catches
(+166% at 2) and forager numbers, but at 2 it kills hunters. Next (E161): graze plus fat with a gentler strike cost.
