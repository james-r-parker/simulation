### 2026-11-07 - Arm d replication (training T22)

- Arm d (`evals/train-curriculum-iter2-d.json`, 60 generations, 32 episodes) on `--seed-offset` 0, 64 and 128 gives predator `prey-ahead` 0.16, 0.00 and 0.00 (memoryless reference 0.31): the +0.16 edge does not replicate (1 of 3 offsets above 0). Treat one archive's edge as a lead, not an effect.
- The bite varies by offset: all three bite prey (share 1.00); offset 0 bites kin, offset 128 bites the too-big prey, offset 64 passes `bite-discrimination` at 1.00. Prey into BITE is +1.97 to +2.19 on all three, so the bite exists in the cell and the failure is in the chase and the discrimination, not in a missing output.
- A full arm d run took about 9 minutes at 14 workers with the machine otherwise idle, not 25 to 30.
