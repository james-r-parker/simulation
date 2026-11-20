# Ladder screen (reference: base)

## base

```
offset  reached  best progress  score  cpu h
128     3        0.000          3.000  1.56
136     3        0.001          3.001  1.60
144     0        0.259          0.259  1.30
152     3        0.000          3.000  1.37
160     3        1.000          4.000  1.14
168     3        1.000          4.000  1.25
176     2        0.017          2.017  1.18
184     0        0.631          0.631  0.88
192     2        0.046          2.046  1.18
200     2        0.008          2.008  1.48
208     3        1.000          4.000  0.66
216     2        0.008          2.008  1.14
224     3        1.000          4.000  0.83
232     0        0.503          0.503  1.45
240     3        1.000          4.000  1.48
248     3        0.004          3.004  1.59

stage         passed  median gens  cpu h / pass
nursery       81%     10           0.87
hunt-contact  81%     10           0.14
hunt-weak     56%     10           0.48
hunt-mid      31%     10           0.53
runs 16, mean score 2.59, passed last 5, cpu 20.1 h
```

## nursery-scatter

```
offset  reached  best progress  score  cpu h
128     2        0.008          2.008  1.04
136     2        0.001          2.001  1.00
144     0        0.930          0.930  0.72
152     0        0.668          0.668  0.86
160     2        0.022          2.022  1.18
168     3        1.000          4.000  0.83
176     3        1.000          4.000  0.84
184     3        0.008          3.008  1.77
192     3        1.000          4.000  1.50
200     2        0.000          2.000  1.31
208     2        0.000          2.000  2.33
216     2        0.019          2.019  1.07
224     2        0.019          2.019  1.13
232     3        1.000          4.000  0.91
240     2        0.004          2.004  1.23
248     2        0.002          2.002  1.71

stage         passed  median gens  cpu h / pass
nursery       88%     10           0.72
hunt-contact  88%     10           0.14
hunt-weak     31%     15           1.22
hunt-mid      25%     10           0.32
runs 16, mean score 2.42, passed last 4, cpu 19.5 h

offset  before  after  diff
128     3.000   2.008  -0.992
136     3.001   2.001  -1.001
144     0.259   0.930  +0.671
152     3.000   0.668  -2.332
160     4.000   2.022  -1.978
168     4.000   4.000  0.000
176     2.017   4.000  +1.983
184     0.631   3.008  +2.377
192     2.046   4.000  +1.954
200     2.008   2.000  -0.008
208     4.000   2.000  -2.000
216     2.008   2.019  +0.011
224     4.000   2.019  -1.981
232     0.503   4.000  +3.497
240     4.000   2.004  -1.996
248     3.004   2.002  -1.002

stage         passed      median gens  cpu h / pass
nursery       81% -> 88%  10 -> 10     0.87 -> 0.72
hunt-contact  81% -> 88%  10 -> 10     0.14 -> 0.14
hunt-weak     56% -> 31%  10 -> 15     0.48 -> 1.22
hunt-mid      31% -> 25%  10 -> 10     0.53 -> 0.32

passed last stage 5 -> 4
cpu hours 20.1 -> 19.5 (-3%)
matched 16: 6 up, 9 down, 1 tied
mean score difference -0.175 [-0.954, 0.788], sign test p 0.6072
verdict: no verdict
```

## turn-rung

```
offset  reached  best progress  score  cpu h
128     3        0.001          3.001  1.21
136     3        0.000          3.000  1.14
144     1        0.529          1.529  0.75
152     0        0.487          0.487  0.85
160     4        1.000          5.000  1.68
168     4        0.010          4.010  1.58
176     4        1.000          5.000  0.98
184     3        0.000          3.000  1.58
192     4        1.000          5.000  1.55
200     3        0.001          3.001  1.76
208     3        0.000          3.000  2.52
216     3        0.008          3.008  1.36
224     2        0.172          2.172  1.25
232     4        1.000          5.000  1.16
240     3        0.008          3.008  1.57
248     3        0.022          3.022  2.05

stage         passed  median gens  cpu h / pass
forage-turn   94%     10           0.65
nursery       88%     10           0.29
hunt-contact  81%     10           0.18
hunt-weak     31%     15           1.14
hunt-mid      25%     10           0.30
runs 16, mean score 3.26, passed last 4, cpu 23.0 h

stage         passed      median gens  cpu h / pass
nursery       81% -> 88%  10 -> 10     0.87 -> 0.29
hunt-contact  81% -> 81%  10 -> 10     0.14 -> 0.18
hunt-weak     56% -> 31%  10 -> 15     0.48 -> 1.14
hunt-mid      31% -> 25%  10 -> 10     0.53 -> 0.30
forage-turn   - -> 94%    - -> 10      - -> 0.65

passed last stage 5 -> 4
cpu hours 20.1 -> 23.0 (15%)
verdict: incomparable (the arms' ladders have different stages: before nursery, hunt-contact, hunt-weak, hunt-mid; after forage-turn, nursery, hunt-contact, hunt-weak, hunt-mid; a score counts stages, so it is not comparable)
```
