### 2026-11-25 - bench-compare --self noise on hosted runners

Five `bench-compare --self` dispatches of `check.yml` (`-f noise=true`) on GitHub's `ubuntu-latest` runners, 500
agents, three alternating runs each. Above the 0.005 ms floor (`MIN_MS_DELTA`) the largest change was 4.8%
(`bench.step_ms@500merit`), then 4.5% (`brain@500merit`) and 3.7% (`lifecycle@500`); the plain `step_ms@500` moved
at most 2.6%. The tiny phases (`effects`, `invariants`, around 0.0002 ms) swing by 50% on a rounding step and are
passed by the floor, so they say nothing about noise. The perf job's threshold is max(0.05, 3 x 0.048) = 0.15
(quality-gates-and-test-tiers.md T18).

The noise job shares the `check-<ref>` concurrency group with pushes to `main`, which cancels all but the newest
pending run: dispatch one run at a time.
