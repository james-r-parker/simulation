# Ladder screen (reference: fixed)

## fixed

```
offset  reached  best progress  score  cpu h
0       4        0.006          4.006  1.96
8       0        0.670          0.670  1.30
16      3        0.000          3.000  1.85
24      0        0.093          0.093  1.32
32      0        0.723          0.723  0.87
40      0        0.723          0.723  1.38
48      2        0.008          2.008  1.63
56      0        0.763          0.763  0.76
64      4        0.015          4.015  1.41
72      0        0.831          0.831  1.10
80      2        0.007          2.007  0.94
88      4        0.008          4.008  1.78
96      0        0.763          0.763  1.41
104     2        0.000          2.000  1.33
112     2        0.000          2.000  1.31
120     2        0.015          2.015  1.16

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.54
hunt-contact  56%     10           0.14
hunt-weak     25%     10           0.86
hunt-mid      19%     10           0.47
hunt          0%      -            -
runs 16, mean score 1.85, passed last 0, cpu 21.5 h
```

## adaptive

```
offset  reached  best progress  score  cpu h
8       0        0.670          0.670  1.31
24      0        0.093          0.093  1.24
32      0        0.723          0.723  0.86
40      0        0.723          0.723  1.38
56      0        0.763          0.763  0.75
72      0        0.831          0.831  1.09
96      0        0.763          0.763  1.40

stage         passed  median gens  cpu h / pass
nursery       0%      -            -
hunt-contact  0%      -            -
hunt          0%      -            -
runs 7, mean score 0.65, passed last 0, cpu 8.0 h
9 run(s) failed and are left out

stage         passed     median gens  cpu h / pass
nursery       56% -> 0%  10 -> -      1.54 -> -
hunt-contact  56% -> 0%  10 -> -      0.14 -> -
hunt-weak     25% -> -   10 -> -      0.86 -> -
hunt-mid      19% -> -   10 -> -      0.47 -> -
hunt          0% -> 0%   - -> -       - -> -

passed last stage 0 -> 0
cpu hours 21.5 -> 8.0 (-63%)
verdict: incomparable (the arms' ladders have different stages: before nursery, hunt-contact, hunt-weak, hunt-mid, hunt; after nursery, hunt-contact, hunt; a score counts stages, so it is not comparable)
```
