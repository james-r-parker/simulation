### 2026-11-19 - Trained predator brains keep thrust and bite high, but their chase paths differ (brain-inspection T9)

On `prey-ahead`, seed 1, 128 matched trials, `archive-159-predator-cell27` wins 1/128 and `archive-159-predator-cell94` wins 6/128. In the first four traced trials, cell27's `THRUST` output is positive on every tick and `BITE` on 93 to 100%; its positive `TURN` output is 0.8 to 15.9% and `SPRINT` is 1.4 to 19.3%. Cell94 also keeps `THRUST` positive on every tick and `BITE` on 87.6 to 100%, but `TURN` is 0 to 33.6% and `SPRINT` is 68.2 to 99.7%. Positive `SPRINT` activates sprint in `physics.js`; these are four traces per genome, not population estimates. The failure is consistent with chase and steering more than a lack of bite intent.

Both genomes put their largest prey-ahead skip weights on direct ray-to-output paths: cell27 has `prey.hit0.strength` -> `THRUST` 1.133 and -> `BITE` 2.027, plus `prey.hit0.sin` -> `TURN` 1.255; cell94 has 1.028, 2.014 and 1.011 on those paths. Zeroing each path tests the effect on the same 128 trials:

| Champion | Edit                                             | Intact | Edited |    Change | Before only         | After only | McNemar p |
| -------- | ------------------------------------------------ | -----: | -----: | --------: | ------------------- | ---------- | --------: |
| cell27   | `wSkip[12,0]` (`prey.hit0.strength` -> `THRUST`) |  1/128 |  0/128 | -0.007813 | 41                  | -          |  1.000000 |
| cell27   | `wSkip[14,1]` (`prey.hit0.sin` -> `TURN`)        |  1/128 |  0/128 | -0.007813 | 41                  | -          |  1.000000 |
| cell27   | `wSkip[12,4]` (`prey.hit0.strength` -> `BITE`)   |  1/128 |  1/128 |  0.000000 | -                   | -          |  1.000000 |
| cell94   | `wSkip[12,0]` (`prey.hit0.strength` -> `THRUST`) |  6/128 |  1/128 | -0.039063 | 11,63,86,90,113,116 | 80         |  0.125000 |
| cell94   | `wSkip[14,1]` (`prey.hit0.sin` -> `TURN`)        |  6/128 |  0/128 | -0.046875 | 11,63,86,90,113,116 | -          |  0.031250 |
| cell94   | `wSkip[12,4]` (`prey.hit0.strength` -> `BITE`)   |  6/128 |  5/128 | -0.007813 | 86                  | -          |  1.000000 |

The turn skip path is the clearest direct-path result on this drill: removing it erases all six cell94 catches (`p=0.031250`, suggestive). The thrust edit loses five catches but also gains trial 80 (`p=0.125000`); the bite edit loses only trial 86 (`p=1`). Cell27's single baseline catch makes its direct skip rows too sparse to support those individual claims. Its h30 ablation raises wins from 1/128 to 11/128 (`beforeOnly=[41]`, `afterOnly=[2,22,28,38,39,47,65,76,89,90,111]`, `p=0.006348`). h30's `wOut` coefficient to `SPRINT` is +0.361876 while its hidden activation is negative in the first four traces; setting only `wOut[30,2]` to zero raises wins from 1/128 to 10/128 (`beforeOnly=[41]`, `afterOnly=[39,61,65,69,76,78,89,90,107,111]`, `p=0.011719`). Setting h30's `TURN` weight to zero leaves the win share at 1/128 (`beforeOnly=[]`, `afterOnly=[]`, `p=1`). This suggests a suppressive hidden-to-sprint path in cell27's failed chase (suggestive: `p=0.006348` and `p=0.011719` are above the Bonferroni line of 0.0016).

Cell94's h1 ablation drops 6/128 to 0/128 (`beforeOnly=[11,63,86,90,113,116]`, `afterOnly=[]`, `p=0.031250`); h1 has positive outgoing weights to `THRUST` (0.198), `TURN` (0.186) and `BITE` (0.390) and ranks among the largest active hidden contributions to all three (suggestive: `p=0.031250`). Other units also remove all six catches, so this is a distributed path, not a unique unit.

Multiple-comparison caveat: about 32 hidden units were screened on each of 3 drills and the p values in these entries are uncorrected. Over 32 units the Bonferroni line is p < 0.05/32 = 0.0016; findings under it are marked firm and the rest suggestive. Cell94 has several consequential units. Silencing h13 raises wins from 6/128 to 24/128 (`beforeOnly=[113]`, `afterOnly=[1,2,21,22,39,47,48,61,69,76,78,79,88,89,100,111,117,119,123]`, `p=0.000040`; firm). Silencing h14 raises them to 25/128 (`beforeOnly=[11,86,113]`, `afterOnly=[4,7,9,12,15,18,22,27,32,39,46,67,68,79,80,85,92,102,104,107,114,125]`, `p=0.000157`; firm). A narrower edit setting h14's outgoing `mate` weight to zero leaves the result at 6/128 (`beforeOnly=[]`, `afterOnly=[]`, `p=1`), so that ablation's benefit does not identify a single output edge. h14 has a large `mate` weight and negative `TURN` weight, but the responsible recurrent path remains unknown. Silencing h31 raises cell94 from 6/128 to 18/128 (`beforeOnly=[90,113]`, `afterOnly=[4,6,12,25,46,54,67,74,79,92,97,107,115,125]`, `p=0.004181`; suggestive); setting only its `TURN` weight to zero gives 6/128 to 10/128 (`beforeOnly=[11,90,113,116]`, `afterOnly=[4,6,79,92,93,97,107,115]`, `p=0.387695`). The h31 effect suggests a unit-level contribution on these paired trials, but the turn edge alone does not explain it.

#### Across registered prey speeds

After the training ladder registered `prey-weak` (`sprintBoost=0.2`) and `prey-mid` (`sprintBoost=0.3`), both predators were inspected on all three prey drills at seed 1, 128 trials and four traced trials. Intact wins were cell27: 1/128 on `prey-ahead`, 16/128 on `prey-mid`, 12/128 on `prey-weak`; cell94: 6/128, 14/128 and 17/128 respectively. The slower variants improve catches, but both remain below the 0.5 bar.

Across the four traced trials, `THRUST` fired on every alive tick for both genomes at every speed. Mean positive-output firing shares (`TURN`, `SPRINT`, `BITE`) were:

| Champion | `prey-ahead`        | `prey-mid` (0.3)    | `prey-weak` (0.2)   |
| -------- | ------------------- | ------------------- | ------------------- |
| cell27   | 0.058, 0.069, 0.960 | 0.215, 0.162, 0.883 | 0.258, 0.191, 0.848 |
| cell94   | 0.093, 0.898, 0.965 | 0.407, 0.716, 0.808 | 0.282, 0.824, 0.876 |

The easier prey produce more `TURN` output in both brains, while `BITE` fires less often in these four traces. Cell94 also fires `SPRINT` less often on both reduced-speed variants. These are trace summaries, not population estimates; the matched win outcomes show the same direction overall but still leave most trials lost to `never-in-jaws`.

Each direct prey-ray skip path was zeroed separately against the same 128-trial intact run on each drill. Rows report the full paired comparison; `wSkip[12,0]` is `prey.hit0.strength` to `THRUST`, `wSkip[14,1]` is `prey.hit0.sin` to `TURN`, and `wSkip[12,4]` is `prey.hit0.strength` to `BITE`.

| Champion | Drill        | Edit          | Intact | Edited |    Change | Before only                                          | After only | McNemar p |
| -------- | ------------ | ------------- | -----: | -----: | --------: | ---------------------------------------------------- | ---------- | --------: |
| cell27   | `prey-ahead` | `wSkip[12,0]` |  1/128 |  0/128 | -0.007813 | 41                                                   | -          |  1.000000 |
| cell27   | `prey-ahead` | `wSkip[14,1]` |  1/128 |  0/128 | -0.007813 | 41                                                   | -          |  1.000000 |
| cell27   | `prey-ahead` | `wSkip[12,4]` |  1/128 |  1/128 |  0.000000 | -                                                    | -          |  1.000000 |
| cell27   | `prey-mid`   | `wSkip[12,0]` | 16/128 |  0/128 | -0.125000 | 9,13,18,21,23,33,38,44,55,59,68,69,82,101,103,116    | -          |  0.000031 |
| cell27   | `prey-mid`   | `wSkip[14,1]` | 16/128 |  0/128 | -0.125000 | 9,13,18,21,23,33,38,44,55,59,68,69,82,101,103,116    | -          |  0.000031 |
| cell27   | `prey-mid`   | `wSkip[12,4]` | 16/128 | 11/128 | -0.039063 | 18,23,55,68,69                                       | -          |  0.062500 |
| cell27   | `prey-weak`  | `wSkip[12,0]` | 12/128 |  0/128 | -0.093750 | 2,28,40,42,44,51,95,101,105,107,120,123              | -          |  0.000488 |
| cell27   | `prey-weak`  | `wSkip[14,1]` | 12/128 |  0/128 | -0.093750 | 2,28,40,42,44,51,95,101,105,107,120,123              | -          |  0.000488 |
| cell27   | `prey-weak`  | `wSkip[12,4]` | 12/128 | 11/128 | -0.007813 | 40,42,44,101                                         | 85,99,103  |  1.000000 |
| cell94   | `prey-ahead` | `wSkip[12,0]` |  6/128 |  1/128 | -0.039063 | 11,63,86,90,113,116                                  | 80         |  0.125000 |
| cell94   | `prey-ahead` | `wSkip[14,1]` |  6/128 |  0/128 | -0.046875 | 11,63,86,90,113,116                                  | -          |  0.031250 |
| cell94   | `prey-ahead` | `wSkip[12,4]` |  6/128 |  5/128 | -0.007813 | 86                                                   | -          |  1.000000 |
| cell94   | `prey-mid`   | `wSkip[12,0]` | 14/128 |  0/128 | -0.109375 | 13,26,29,31,33,36,46,54,73,75,103,109,120,124        | -          |  0.000122 |
| cell94   | `prey-mid`   | `wSkip[14,1]` | 14/128 |  0/128 | -0.109375 | 13,26,29,31,33,36,46,54,73,75,103,109,120,124        | -          |  0.000122 |
| cell94   | `prey-mid`   | `wSkip[12,4]` | 14/128 | 13/128 | -0.007813 | 75                                                   | -          |  1.000000 |
| cell94   | `prey-weak`  | `wSkip[12,0]` | 17/128 |  2/128 | -0.117188 | 5,9,17,19,21,30,39,46,49,55,85,92,98,110,113,116,127 | 1,74       |  0.000729 |
| cell94   | `prey-weak`  | `wSkip[14,1]` | 17/128 |  0/128 | -0.132813 | 5,9,17,19,21,30,39,46,49,55,85,92,98,110,113,116,127 | -          |  0.000015 |
| cell94   | `prey-weak`  | `wSkip[12,4]` | 17/128 | 16/128 | -0.007813 | 19                                                   | -          |  1.000000 |

The skip ablations suggest that `THRUST` and `TURN` are both essential to the catches in the slower drills (the slower-drill p values of 0.000015 to 0.000729 are under 0.0016, so firm; the `prey-ahead` rows are suggestive), while directly zeroing `BITE` costs at most five catches for cell27 and one for cell94. This is consistent with a pursuit and steering bottleneck more than a lack of bite intent. `wSkip[12,0]` and `wSkip[14,1]` lose exactly the same trials on every drill (identical before-only sets for both champions; only cell94's `wSkip[12,0]` also gains trials 80, 1 and 74): either the two edges are redundant, or the brain stops chasing once either is cut; this is unresolved. It does not prove the entire failure mechanism: the `THRUST`/`TURN` ray paths are shared across all speeds and ablation changes can interact with recurrent activity.

Hidden-unit ablations add a speed-dependent result for cell27. Silencing h16 changes `prey-ahead` 1/128 to 0/128 (`beforeOnly=[41]`, `afterOnly=[]`, `p=1`), `prey-mid` 16/128 to 6/128 (`beforeOnly=[9,13,21,23,33,38,44,55,59,69,82,101,103,116]`, `afterOnly=[8,16,40,56]`, `p=0.030884`), and `prey-weak` 12/128 to 7/128 (`beforeOnly=[2,28,40,44,51,101,107,120,123]`, `afterOnly=[8,60,102,117]`, `p=0.266846`). Its mean activation in the first `prey-mid` trace is -0.450, and its outgoing weights are +0.144 to `TURN` and -0.053 to `SPRINT`; this suggests a matched-trial contribution on `prey-mid` (suggestive: `p=0.030884`), not a single isolated output mechanism.

Cell94 has no single speed-specific unit. Silencing h3 drops `prey-ahead` 6/128 to 0/128 (`beforeOnly=[11,63,86,90,113,116]`, `afterOnly=[]`, `p=0.031250`), `prey-mid` 14/128 to 0/128 (`beforeOnly=[13,26,29,31,33,36,46,54,73,75,103,109,120,124]`, `afterOnly=[]`, `p=0.000122`) and `prey-weak` 17/128 to 0/128 (`beforeOnly=[5,9,17,19,21,30,39,46,49,55,85,92,98,110,113,116,127]`, `afterOnly=[]`, `p=0.000015`). Other units produce the same all-catch loss on some drills, so this is a distributed pathway, not a unique-cell result.

All trial files live only in `.sim/inspect/ets-1h-o144/`; no champion, training code, sim rule or score was changed by these diagnostics. Training evidence added the two sprint settings after the first `prey-ahead` analysis; those settings are now explicit in `js/evo/drill-scenarios.js` and the training-stage docs.
