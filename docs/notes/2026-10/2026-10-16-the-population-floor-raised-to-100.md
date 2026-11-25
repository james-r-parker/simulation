### 2026-10-16 - The population floor raised to 100

The 20-agent population was the `minAgents` floor, not a carrying capacity: over 20000 ticks about 760 of the 800
food items sat uneaten while unevolved brains starved around them. The floor is now 100 (`initialAgents`), so the
archive in [evolution-rework.md](../../designs/evolution-rework.md) Phase 2 gets five times as many floor and immigrant trials.
`baseline-v5` at 8 seeds x 200000 ticks now takes about 245 s on 8 workers. The population sits at exactly the floor
(100.0), births stay near zero (0.0006 per 1000 agent-ticks: random brains do not mate however many there are),
food energy per 1000 agent-ticks falls from 47 to 37 and lineage turnover to almost 0 (100 random lineages rarely
lead by 2). Calibration `E2` passes. The floor-20 reports are kept as `evals/experiments/E0-*-floor20.json` for `E0`
and `E1`; the default golden hash moved to `6d2d987ab3306c5c` and Chromium reproduces it.
