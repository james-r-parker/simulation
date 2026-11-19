# E205 - E-TL-1: plateauStop on the ladder (training-loop T8)

Status: done. Verdict `no verdict`; CPU hours down 18%.

Prediction (written before the run): equal pass shares per stage; `no verdict` on `train:compare` score; at least 30% fewer CPU hours in the `stop` arm.

Run: `npm run train:screen -- --grid evals/train-screens/plateau.grid.json` (2 arms x 16 offsets = 32 runs, offsets 0 to 120 by 8, until `hunt-mid`). Full outputs: `evals/train-screens/results/plateau/` (`table.md`, `yield.json`, `verdicts.json`).

## Reading

- Score: `no verdict`. 15 of 16 offsets tied, 1 down (offset 104), mean difference -0.063 [-0.378, 0], sign test p 1.0.
- CPU hours 26.7 to 21.9 (-18%).
- Pass shares by stage, nostop to stop: nursery 56% to 56%, hunt-contact 56% to 56%, hunt-weak 31% to 25% (offset 104: the stop cut hunt-weak, nostop passed it later), hunt-mid 19% to 19%.
- The median generations to pass is 10 at every stage, the `minGenerations`, so a stage that passes passes at once; the stop saves CPU only on stages that stall.
- Nursery stalls on 7 of 16 offsets (8, 24, 32, 40, 56, 72, 96 reached 0) with best progress 0.67 to 0.83: close to the bar, so the nursery bar and episode budget are the next ladder lever.

## Prediction against outcome

- Score `no verdict`: met.
- Pass shares equal: nearly (one hunt-weak run lost).
- At least 30% fewer CPU hours: falsified at 18%.

## Outcome to task

`plateauStop` 6 stays the default (18% saved at the cost of 1 of 16 runs). Training-loop T8a: `plateauStop` 10 against 6 as a `train:tune` arm, and the nursery stall as the next lever.

## Yield tables

# Ladder screen (reference: nostop)

## nostop

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.80
8       0        0.670          0.670  1.59
16      3        0.000          3.000  2.98
24      0        0.093          0.093  1.74
32      0        0.723          0.723  1.26
40      0        0.723          0.723  1.75
48      2        0.008          2.008  2.64
56      0        0.763          0.763  0.97
64      3        1.000          4.000  0.96
72      0        0.831          0.831  1.07
80      2        0.007          2.007  1.40
88      3        1.000          4.000  1.20
96      0        0.763          0.763  1.48
104     3        0.008          3.008  2.53
112     2        0.000          2.000  1.90
120     2        0.015          2.015  1.42

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.78
hunt-contact  56%     10           0.15
hunt-weak     31%     10           1.16
hunt-mid      19%     10           1.17
runs 16, mean score 1.91, cpu 26.7 h
```

## stop

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.79
8       0        0.670          0.670  1.59
16      3        0.000          3.000  2.27
24      0        0.093          0.093  1.56
32      0        0.723          0.723  1.10
40      0        0.723          0.723  1.73
48      2        0.008          2.008  1.95
56      0        0.763          0.763  0.81
64      3        1.000          4.000  0.95
72      0        0.831          0.831  1.04
80      2        0.007          2.007  0.94
88      3        1.000          4.000  1.21
96      0        0.763          0.763  1.34
104     2        0.000          2.000  1.31
112     2        0.000          2.000  1.29
120     2        0.015          2.015  1.02

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.70
hunt-contact  56%     10           0.15
hunt-weak     25%     10           0.88
hunt-mid      19%     10           0.57
runs 16, mean score 1.85, cpu 21.9 h

offset  before  after  diff
0       4.000   4.000  0.000
8       0.670   0.670  0.000
16      3.000   3.000  0.000
24      0.093   0.093  0.000
32      0.723   0.723  0.000
40      0.723   0.723  0.000
48      2.008   2.008  0.000
56      0.763   0.763  0.000
64      4.000   4.000  0.000
72      0.831   0.831  0.000
80      2.007   2.007  0.000
88      4.000   4.000  0.000
96      0.763   0.763  0.000
104     3.008   2.000  -1.008
112     2.000   2.000  0.000
120     2.015   2.015  0.000

stage         passed      median gens  cpu h / pass
nursery       56% -> 56%  10 -> 10     1.78 -> 1.70
hunt-contact  56% -> 56%  10 -> 10     0.15 -> 0.15
hunt-weak     31% -> 25%  10 -> 10     1.16 -> 0.88
hunt-mid      19% -> 19%  10 -> 10     1.17 -> 0.57

cpu hours 26.7 -> 21.9 (-18%)
matched 16: 0 up, 1 down, 15 tied
mean score difference -0.063 [-0.378, 0.000], sign test p 1.0000
verdict: no verdict
```
