# Ladder screen (reference: base)

## base

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.24
8       0        0.670          0.670  1.11
16      3        0.000          3.000  1.54
24      0        0.093          0.093  1.06
32      0        0.723          0.723  0.78
40      0        0.723          0.723  1.27
48      2        0.008          2.008  1.51
56      0        0.763          0.763  0.67
64      3        1.000          4.000  0.86
72      0        0.831          0.831  0.97
80      2        0.007          2.007  0.86
88      3        1.000          4.000  1.09
96      0        0.763          0.763  1.25
104     2        0.000          2.000  1.14
112     2        0.000          2.000  1.13
120     2        0.015          2.015  1.17

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.35
hunt-contact  56%     10           0.13
hunt-weak     25%     10           0.79
hunt-mid      19%     10           0.41
runs 16, mean score 1.85, passed last 3, cpu 17.6 h
```

## nursery-scatter

```
offset  reached  best progress  score  cpu h
0       2        0.008          2.008  1.57
8       2        0.000          2.000  1.75
16      3        0.008          3.008  2.54
24      2        0.000          2.000  1.11
32      3        1.000          4.000  0.78
40      3        1.000          4.000  1.06
48      3        0.000          3.000  1.52
56      3        0.004          3.004  1.08
64      3        0.015          3.015  1.72
72      3        1.000          4.000  0.81
80      0        0.470          0.470  1.16
88      0        0.771          0.771  1.54
96      3        0.001          3.001  1.21
104     3        1.000          4.000  0.84
112     3        1.000          4.000  0.82
120     2        0.022          2.022  1.21

stage         passed  median gens  cpu h / pass
nursery       88%     10           0.82
hunt-contact  88%     10           0.13
hunt-weak     63%     10           0.42
hunt-mid      31%     10           0.63
runs 16, mean score 2.77, passed last 5, cpu 20.7 h

offset  before  after  diff
0       4.000   2.008  -1.992
8       0.670   2.000  +1.330
16      3.000   3.008  +0.008
24      0.093   2.000  +1.907
32      0.723   4.000  +3.277
40      0.723   4.000  +3.277
48      2.008   3.000  +0.992
56      0.763   3.004  +2.241
64      4.000   3.015  -0.985
72      0.831   4.000  +3.169
80      2.007   0.470  -1.537
88      4.000   0.771  -3.229
96      0.763   3.001  +2.238
104     2.000   4.000  +2.000
112     2.000   4.000  +2.000
120     2.015   2.022  +0.007

stage         passed      median gens  cpu h / pass
nursery       56% -> 88%  10 -> 10     1.35 -> 0.82
hunt-contact  56% -> 88%  10 -> 10     0.13 -> 0.13
hunt-weak     25% -> 63%  10 -> 10     0.79 -> 0.42
hunt-mid      19% -> 31%  10 -> 10     0.41 -> 0.63

passed last stage 3 -> 5
cpu hours 17.6 -> 20.7 (18%)
matched 16: 12 up, 4 down, 0 tied
mean score difference 0.919 [-0.135, 1.792], sign test p 0.0768
verdict: no verdict
```

## turn-rung

```
offset  reached  best progress  score  cpu h
0       4        1.000          5.000  1.73
8       3        0.000          3.000  1.95
16      4        1.000          5.000  2.68
24      3        0.000          3.000  1.34
32      4        1.000          5.000  0.93
40      4        1.000          5.000  1.30
48      3        0.004          3.004  1.42
56      4        0.032          4.032  1.60
64      3        0.006          3.006  1.79
72      1        0.779          1.779  0.88
80      0        0.700          0.700  1.14
88      1        0.533          1.533  1.31
96      4        0.006          4.006  1.69
104     4        1.000          5.000  1.26
112     3        0.001          3.001  1.13
120     4        0.001          4.001  1.35

stage         passed  median gens  cpu h / pass
forage-turn   94%     10           0.70
nursery       81%     10           0.34
hunt-contact  81%     10           0.14
hunt-weak     50%     10           0.53
hunt-mid      31%     10           0.52
runs 16, mean score 3.50, passed last 5, cpu 23.5 h

stage         passed      median gens  cpu h / pass
nursery       56% -> 81%  10 -> 10     1.35 -> 0.34
hunt-contact  56% -> 81%  10 -> 10     0.13 -> 0.14
hunt-weak     25% -> 50%  10 -> 10     0.79 -> 0.53
hunt-mid      19% -> 31%  10 -> 10     0.41 -> 0.52
forage-turn   - -> 94%    - -> 10      - -> 0.70

passed last stage 3 -> 5
cpu hours 17.6 -> 23.5 (33%)
verdict: incomparable (the arms' ladders have different stages: before nursery, hunt-contact, hunt-weak, hunt-mid; after forage-turn, nursery, hunt-contact, hunt-weak, hunt-mid; a score counts stages, so it is not comparable)
```
