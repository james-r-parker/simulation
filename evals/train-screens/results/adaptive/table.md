# Ladder screen (reference: fixed)

## fixed

```
offset  reached  best progress  score  cpu h
0       4        0.006          4.006  1.76
8       0        0.670          0.670  1.17
16      3        0.000          3.000  1.62
24      0        0.093          0.093  1.18
32      0        0.723          0.723  0.82
40      0        0.723          0.723  1.31
48      2        0.008          2.008  1.48
56      0        0.763          0.763  0.66
64      4        0.015          4.015  1.37
72      0        0.831          0.831  1.05
80      2        0.007          2.007  0.90
88      4        0.008          4.008  1.66
96      0        0.763          0.763  1.33
104     2        0.000          2.000  1.21
112     2        0.000          2.000  1.17
120     2        0.015          2.015  1.18

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.41
hunt-contact  56%     10           0.13
hunt-weak     25%     10           0.81
hunt-mid      19%     10           0.43
hunt          0%      -            -
runs 16, mean score 1.85, passed last 0, cpu 19.9 h
```

## adaptive

```
offset  reached  best progress  score  cpu h
0       2        0.013          2.013  3.70
8       0        0.670          0.670  1.14
16      2        0.000          2.000  3.86
24      0        0.093          0.093  1.15
32      0        0.723          0.723  0.83
40      0        0.723          0.723  1.28
48      2        0.003          2.003  4.39
56      0        0.763          0.763  0.73
64      2        0.024          2.024  3.58
72      0        0.831          0.831  1.04
80      2        0.010          2.010  3.63
88      2        0.001          2.001  4.13
96      0        0.763          0.763  1.31
104     2        0.000          2.000  4.12
112     2        0.000          2.000  4.17
120     2        0.003          2.003  3.54

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.42
hunt-contact  56%     10           0.13
hunt          0%      -            -
runs 16, mean score 1.41, passed last 0, cpu 42.6 h

stage         passed      median gens  cpu h / pass
nursery       56% -> 56%  10 -> 10     1.41 -> 1.42
hunt-contact  56% -> 56%  10 -> 10     0.13 -> 0.13
hunt-weak     25% -> -    10 -> -      0.81 -> -
hunt-mid      19% -> -    10 -> -      0.43 -> -
hunt          0% -> 0%    - -> -       - -> -

passed last stage 0 -> 0
cpu hours 19.9 -> 42.6 (114%)
verdict: incomparable (the arms' ladders have different stages: before nursery, hunt-contact, hunt-weak, hunt-mid, hunt; after nursery, hunt-contact, hunt; a score counts stages, so it is not comparable)
```
