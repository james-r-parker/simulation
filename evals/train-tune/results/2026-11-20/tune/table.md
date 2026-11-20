# Ladder screen (reference: base)

## base

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.34
8       0        0.670          0.670  1.11
16      3        0.000          3.000  1.65
24      0        0.093          0.093  1.17
32      0        0.723          0.723  0.82
40      0        0.723          0.723  1.26
48      2        0.008          2.008  1.45
56      0        0.763          0.763  0.69
64      3        1.000          4.000  0.90
72      0        0.831          0.831  0.99
80      2        0.007          2.007  0.89
88      3        1.000          4.000  1.16
96      0        0.763          0.763  1.30
104     2        0.000          2.000  1.19
112     2        0.000          2.000  1.19
120     2        0.015          2.015  1.16

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.39
hunt-contact  56%     10           0.13
hunt-weak     25%     10           0.81
hunt-mid      19%     10           0.45
runs 16, mean score 1.85, passed last 3, cpu 18.2 h
```

## plateauStop-nursery-10

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.35
8       0        0.670          0.670  1.10
16      3        0.000          3.000  1.64
24      0        0.093          0.093  1.28
32      0        0.723          0.723  0.90
40      0        0.723          0.723  1.25
48      2        0.008          2.008  1.53
56      0        0.763          0.763  0.76
64      3        1.000          4.000  0.89
72      0        0.831          0.831  0.96
80      2        0.007          2.007  0.95
88      3        1.000          4.000  1.15
96      0        0.763          0.763  1.33
104     2        0.000          2.000  1.22
112     2        0.000          2.000  1.20
120     2        0.015          2.015  1.15

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.43
hunt-contact  56%     10           0.13
hunt-weak     25%     10           0.82
hunt-mid      19%     10           0.45
runs 16, mean score 1.85, passed last 3, cpu 18.7 h

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
104     2.000   2.000  0.000
112     2.000   2.000  0.000
120     2.015   2.015  0.000

stage         passed      median gens  cpu h / pass
nursery       56% -> 56%  10 -> 10     1.39 -> 1.43
hunt-contact  56% -> 56%  10 -> 10     0.13 -> 0.13
hunt-weak     25% -> 25%  10 -> 10     0.81 -> 0.82
hunt-mid      19% -> 19%  10 -> 10     0.45 -> 0.45

passed last stage 3 -> 3
cpu hours 18.2 -> 18.7 (2%)
matched 16: 0 up, 0 down, 16 tied
mean score difference 0.000 [0.000, 0.000], sign test p 1.0000
verdict: no verdict
```

## preyShare-hunt-weak-1

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  2.29
8       0        0.670          0.670  1.04
16      2        0.001          2.001  4.28
24      0        0.093          0.093  1.13
32      0        0.723          0.723  0.81
40      0        0.723          0.723  1.24
48      2        0.004          2.004  4.53
56      0        0.763          0.763  0.69
64      2        0.010          2.010  4.35
72      0        0.831          0.831  0.97
80      2        0.003          2.003  3.26
88      3        1.000          4.000  2.27
96      0        0.763          0.763  1.26
104     2        0.000          2.000  4.40
112     2        0.000          2.000  4.01
120     3        0.020          3.020  2.36

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.38
hunt-contact  56%     10           0.13
hunt-weak     19%     10           8.03
hunt-mid      13%     18           0.56
runs 16, mean score 1.73, passed last 2, cpu 38.9 h

offset  before  after  diff
0       4.000   4.000  0.000
8       0.670   0.670  0.000
16      3.000   2.001  -0.999
24      0.093   0.093  0.000
32      0.723   0.723  0.000
40      0.723   0.723  0.000
48      2.008   2.004  -0.004
56      0.763   0.763  0.000
64      4.000   2.010  -1.990
72      0.831   0.831  0.000
80      2.007   2.003  -0.004
88      4.000   4.000  0.000
96      0.763   0.763  0.000
104     2.000   2.000  0.000
112     2.000   2.000  0.000
120     2.015   3.020  +1.005

stage         passed      median gens  cpu h / pass
nursery       56% -> 56%  10 -> 10     1.39 -> 1.38
hunt-contact  56% -> 56%  10 -> 10     0.13 -> 0.13
hunt-weak     25% -> 19%  10 -> 10     0.81 -> 8.03
hunt-mid      19% -> 13%  10 -> 18     0.45 -> 0.56

passed last stage 3 -> 2
cpu hours 18.2 -> 38.9 (113%)
matched 16: 1 up, 4 down, 11 tied
mean score difference -0.124 [-0.499, 0.125], sign test p 0.3750
verdict: no verdict
```

## Learnability

- base: unlearnable: hunt-weak, hunt-mid
- plateauStop-nursery-10: unlearnable: hunt-weak, hunt-mid
- preyShare-hunt-weak-1: unlearnable: hunt-weak, hunt-mid
