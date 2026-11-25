### 2026-11-20 - Where a 20-generation ladder run spends its wall time (training-loop T26)

`npm run train:profile -- --curriculum evals/train-ladder.json --generations 20 --workers 4` (32 episodes of 4000 ticks, checkpoints every 10 generations) trained 20 generations, all in `nursery`, in 1066.8 s of wall time. The trainer now logs `TrainTiming` per generation; the shares are of that wall time.

| Reading                                                        | Value                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| World episodes and the merge                                   | 97.5% (52.0 s a generation)                           |
| Checkpoints (drills, gate, cross-play)                         | 2.1% (9.5 s at generation 9, 12.5 s at generation 19) |
| Archive, manifest and curve writes                             | 0.4% (at most 0.31 s a generation)                    |
| Worker busy share while episodes ran; over the whole wall time | 88.1%; 86.0%                                          |

At 4 workers the pool is 86 to 88% busy, matching the 0.85 to 0.91 the 3-worker generations read in the Phase 5 table, so the idle share the plan targets appears with more workers (0.35 to 0.45 at 12), not here. Twenty generations never leave `nursery`, so the hunt-stage generation and its larger checkpoints are not in this read; T33 re-runs it after T29 to T32. A seed offset also wraps later now: `evals/train-seeds.json` holds 512 seeds, so a run of 8 or more generations at 32 episodes no longer revisits the same seeds at index 256 (the first 256 indices replay unchanged).
