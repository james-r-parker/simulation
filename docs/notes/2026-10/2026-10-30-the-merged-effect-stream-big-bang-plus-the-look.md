### 2026-10-30 - The merged effect stream (big bang plus the Look)

The Look added a `MATED` worker effect and the big bang changed the sim, so the busy golden's effect-stream pin moved from `27108f937e31a6e4` (2359 records) to `f709be33928e72f4` (2400). Counted by kind (born, died, bite, alarm, pack call, smoke, mated): 86, 157, 608, 962, 336, 210, 41. The 2359 non-mated records are the same count as before the merge; the 41 mated records are the whole difference. `worldHash` did not move: the Look changes only the snapshot and worker, not the sim.
