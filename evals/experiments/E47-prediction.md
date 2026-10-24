# E47 prediction (written 2026-10-24 before the run)

T15o: predator biteMultiplier 8 and 10 against the T15d default 12, on main f047245, seeds 1-32, 200000 ticks, policy live; each compared with E36's reference per seed set.

- catch_rate falls roughly in proportion to bite size (more bites per kill): bite 10 ~0.08, bite 8 ~0.06, both still `better` than the reference (~0.005).
- predator_births fall: bite 10 ~60, bite 8 ~45 per seed, both `better`.
- fed_median_lifespan on seeds 17-32: bite 10 recovers to about -5% (no-difference likely), bite 8 to about -3% (no-difference).
- Expected pick: bite 10 if it clears fed lifespan on both sets, else bite 8.
