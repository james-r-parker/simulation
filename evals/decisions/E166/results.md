# E166 - flat and reach on seeds 65 to 128 (low-density-edge T15b)

**Prediction (recorded before the run).** On seeds 65 to 128, and on the 128 matched seeds with E165, `flat` and `reach`
each read no keep-rule guard worse against `defaults`, and each guard sees a loss of a quarter of the seeds or less.
Falsified when a guard reads worse.

**Runs:** `npm run screen -- --grid evals/screens/low-density-edge-t15b.grid.json` (`defaults`, `flat`) and `npm run eval --
--seeds 64 --seed-offset 64 --ticks 200000 --policy live` at the `reach` commit (`exp/ld-reach-t14`).

Results follow when the runs end.
