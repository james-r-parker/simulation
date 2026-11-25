### 2026-11-04 - E88 shark wait and hunter chase screen on the post-feature defaults

`E88` (`evals/screens/results/shark-hunter/`): 7 arms x 8 seeds x 200000 ticks, `map-elites-v6`, seeds 1-8, against the defaults with flora, megafauna, disease, `splitMateScarceTicks` 600 and `splitClonalMax` 3. Means over 8 seeds; predators is alive at the last tick (seeds with one or more, total).

| Arm               | predators | catch rate | families eff. | mating | prey types | population | fed life | floor episodes |
| ----------------- | --------- | ---------- | ------------- | ------ | ---------- | ---------- | -------- | -------------- |
| defaults          | 0/8 (0)   | 0.052      | 1.33          | 0.45   | 1.75       | 67         | 4296     | 12.8           |
| shark300          | 1/8 (5)   | 0.117      | 1.42          | 0.39   | 2.38       | 88         | 3978     | 16.4           |
| shark1200         | 1/8 (2)   | 0.051      | 1.68          | 0.37   | 2.13       | 41         | 4229     | 15.4           |
| sprint22          | 0/8       | 0.138      | 1.43          | 0.41   | 2.00       | 59         | 4231     | 14.0           |
| vision500         | 0/8       | 0.089      | 1.61          | 0.42   | 2.63       | 59         | 4111     | 14.3           |
| agile             | 0/8       | 0.078      | 2.23          | 0.37   | 2.50       | 55         | 4025     | 17.3           |
| shark300-sprint22 | 0/8       | 0.094      | 1.74          | 0.43   | 2.63       | 84         | 4119     | 16.1           |

Every arm fails the screen verdict (`pop > min` 0/8 everywhere, including the defaults): on these defaults the population mean is 41-88 against about 400 in the E85 screen, so the world is thin before any arm acts. Predators survive on 0-1 of 8 seeds in every arm (the one survivor of `shark300` is a single seed with 5); a faster sprint lifts the catch rate (0.05 to 0.14) and `shark300` more than doubles it, yet neither keeps hunters. Families reach 3 on 0 seeds at defaults, 2 of 8 at `agile` and 1 of 8 at `shark300-sprint22`. No arm is a candidate. The chase is not the only bottleneck: hunter numbers and the thin population are the next questions for the predator balance (natural-selection T50).
