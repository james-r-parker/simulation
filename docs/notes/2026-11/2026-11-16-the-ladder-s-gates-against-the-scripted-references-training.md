### 2026-11-16 - The ladder's gates against the scripted references (training-stages Phase 6, T25)

`node scripts/ladder-validity.mjs --seed 1000000` (the gate seed, 64 trials, about 30 s): each drill condition of `evals/train-ladder.json` against `memoryless`, `input-reader`, `kin-sparing` and the oracle, and the random brains.

- `drill.pack-converge.gainLow` and `.blindGapLow`: nothing passes. A lone scripted hunter kills the 2000-energy prey in 600 ticks as often as the trio, so a gain of 0 is the ceiling, and a prey made harder for one hunter (forager `sprintBoost` 1.3 to 3) leaves the scripted trio at or below its solo and `kin-blind` arms. A scripted pack that steps away from a clone it sees did worse than solo, not better: separation costs the hunters the pursuit.
- `drill.rock-refuge.edgeLow`: nothing passes, the oracle included (it wins 0; the scripted hunter reaches an agent inside the ring).
- `drill.prey-ahead.lossShare.never-in-jaws` at most 0.5: only the oracle passes. A hunter that wins most trials has few losses and most of them are misses (0.82 for `memoryless`, 0.94 for `input-reader`), so the share of lost trials rises with skill.
- `drill.hunter-flank.edgeLow` is seed-fragile for the senses: `input-reader` wins 3 of 64 on the gate seed and the oracle 48 of 64; on seed 77 only the oracle passes.
- A bite wish on kin is the whole `kin-spared` lesson: `kin-sparing` (the input reader with its bite held while a clone is nearer than the prey on the rays) wins 43 of 64 with no `bit-kin` loss.
- Training a whole ladder for 2 generations of 4 episodes of 3000 ticks takes 19 s without checkpoints and 80 s with a checkpoint every generation (drills at 64 trials, the 4-seed eval and cross-play), 16 workers.
