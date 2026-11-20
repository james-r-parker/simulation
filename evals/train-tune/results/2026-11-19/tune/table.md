# Ladder screen (reference: base)

## base

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.35
8       0        0.670          0.670  1.09
16      3        0.000          3.000  1.55
24      0        0.093          0.093  1.08
32      0        0.723          0.723  0.78
40      0        0.723          0.723  1.30
48      2        0.008          2.008  1.59
56      0        0.763          0.763  0.72
64      3        1.000          4.000  0.88
72      0        0.831          0.831  0.94
80      2        0.007          2.007  0.92
88      3        1.000          4.000  1.15
96      0        0.763          0.763  1.29
104     2        0.000          2.000  1.18
112     2        0.000          2.000  1.19
120     2        0.015          2.015  1.20

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.39
hunt-contact  56%     10           0.13
hunt-weak     25%     10           0.81
hunt-mid      19%     10           0.43
runs 16, mean score 1.85, cpu 18.2 h
```

## maxGenerations-nursery-80

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.36
8       0        0.670          0.670  1.39
16      3        0.000          3.000  1.59
24      0        0.093          0.093  1.08
32      0        0.723          0.723  0.78
40      0        0.723          0.723  1.43
48      2        0.008          2.008  1.62
56      0        0.763          0.763  0.70
64      3        1.000          4.000  0.91
72      0        0.831          0.831  1.10
80      2        0.007          2.007  0.95
88      3        1.000          4.000  1.16
96      0        0.763          0.763  1.25
104     2        0.000          2.000  1.18
112     2        0.000          2.000  1.23
120     2        0.015          2.015  1.19

stage         passed  median gens  cpu h / pass
nursery       56%     10           1.46
hunt-contact  56%     10           0.14
hunt-weak     25%     10           0.82
hunt-mid      19%     10           0.41
runs 16, mean score 1.85, cpu 18.9 h

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
nursery       56% -> 56%  10 -> 10     1.39 -> 1.46
hunt-contact  56% -> 56%  10 -> 10     0.13 -> 0.14
hunt-weak     25% -> 25%  10 -> 10     0.81 -> 0.82
hunt-mid      19% -> 19%  10 -> 10     0.43 -> 0.41

cpu hours 18.2 -> 18.9 (4%)
matched 16: 0 up, 0 down, 16 tied
mean score difference 0.000 [0.000, 0.000], sign test p 1.0000
verdict: no verdict
```

## episodes-48

```
offset  reached  best progress  score  cpu h
0       3        1.000          4.000  1.81
8       0        0.779          0.779  1.52
16      0        0.612          0.612  1.99
24      0        0.562          0.562  1.23
32      2        0.001          2.001  1.51
40      3        1.000          4.000  1.18
48      3        1.000          4.000  1.66
56      3        0.003          3.003  1.91
64      0        0.763          0.763  1.07
72      3        1.000          4.000  1.27
80      3        1.000          4.000  1.41
88      2        0.007          2.007  1.52
96      3        1.000          4.000  1.99
104     2        0.015          2.015  2.11
112     2        0.006          2.006  1.72
120     0        0.943          0.943  1.02

stage         passed  median gens  cpu h / pass
nursery       69%     10           1.40
hunt-contact  69%     10           0.19
hunt-weak     44%     10           0.73
hunt-mid      38%     10           0.37
runs 16, mean score 2.42, cpu 24.9 h

offset  before  after  diff
0       4.000   4.000  0.000
8       0.670   0.779  +0.110
16      3.000   0.612  -2.388
24      0.093   0.562  +0.469
32      0.723   2.001  +1.278
40      0.723   4.000  +3.277
48      2.008   4.000  +1.992
56      0.763   3.003  +2.240
64      4.000   0.763  -3.237
72      0.831   4.000  +3.169
80      2.007   4.000  +1.993
88      4.000   2.007  -1.993
96      0.763   4.000  +3.237
104     2.000   2.015  +0.015
112     2.000   2.006  +0.006
120     2.015   0.943  -1.071

stage         passed      median gens  cpu h / pass
nursery       56% -> 69%  10 -> 10     1.39 -> 1.40
hunt-contact  56% -> 69%  10 -> 10     0.13 -> 0.19
hunt-weak     25% -> 44%  10 -> 10     0.81 -> 0.73
hunt-mid      19% -> 38%  10 -> 10     0.43 -> 0.37

cpu hours 18.2 -> 24.9 (37%)
matched 16: 11 up, 4 down, 1 tied
mean score difference 0.569 [-0.472, 1.486], sign test p 0.1185
verdict: no verdict
```

## Learnability

- base: unlearnable: hunt-weak, hunt-mid
- maxGenerations-nursery-80: unlearnable: hunt-weak, hunt-mid
- episodes-48: unlearnable: hunt-weak, hunt-mid
