### 2026-11-05 - E98 hunter levers on the fed world: the chase is not the bottleneck, replacement is

`E98` (`evals/screens/results/hunter-fed/`): the E88 arms again, 7 arms x 8 seeds x 200000 ticks, `live` policy, on the defaults after #254 raised the food cap. Means over 8 seeds; predators is seeds with a hunter alive at the last tick (total hunters).

| Arm               | predators | catch rate | population | fed life | floor episodes | families eff. | mating | dominance |
| ----------------- | --------- | ---------- | ---------- | -------- | -------------- | ------------- | ------ | --------- |
| defaults          | 1/8 (2)   | 0.069      | 126        | 4622     | 9.0            | 1.43          | 0.56   | 0.35      |
| shark300          | 0/8       | 0.144      | 145        | 4724     | 7.9            | 1.38          | 0.56   | 0.35      |
| shark1200         | 0/8       | 0.094      | 92         | 5090     | 6.1            | 1.21          | 0.47   | 0.25      |
| sprint22          | 2/8 (6)   | 0.088      | 134        | 4165     | 9.5            | 1.45          | 0.51   | 0.28      |
| vision500         | 0/8       | 0.164      | 146        | 4867     | 6.8            | 1.32          | 0.54   | 0.35      |
| agile             | 0/8       | 0.188      | 109        | 4486     | 8.0            | 1.46          | 0.45   | 0.30      |
| shark300-sprint22 | 0/8       | 0.142      | 146        | 4130     | 5.9            | 1.12          | 0.54   | 0.32      |

Every arm fails the screen verdict. Four arms double the catch rate and none keeps hunters: the failure gate (no arm at 4/8) is met, and no arm is a candidate (`sprint22` is 2/8 on 6 hunters, under the 3/8 bar, with two seeds under a mean of 80). With prey plentiful the population is 92-146 instead of 41-88 (E88), floor episodes fell from 13-17 to 6-10, and hunters still go extinct, so the cause is how a hunter gets replaced, not how it catches. In `js/sim/` a hunter pays `huntUpkeep` (0.002 a tick) on top of its standing loss (0.3x), holds a 3x store (6000), splits at 0.6 x `splitMinEnergy` (540) only after `splitMateScarceTicks` (600) without a mate in view and at most `splitClonalMax` (3) times in a row, and a mating child waits `maturityTicks` (600) and `pregnancyTicks` (480). A rare role has few mates in view, so it relies on splits that the clonal cap then limits, and a child is a hunter only by inheritance or by `specMutationRate` (0.002). Next: E100 (`evals/screens/hunter-life.grid.json`), one hunter life-history lever per arm (H7).
