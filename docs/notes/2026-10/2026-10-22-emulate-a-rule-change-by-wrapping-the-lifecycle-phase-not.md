### 2026-10-22 - Emulate a rule change by wrapping the `lifecycle` phase, not by editing the sim

`step(world, policy, overrides)` takes replacement `run` functions by phase name. A harness can replace `lifecycle` with the
same calls (`feed`, `mate`, `applyCosts`, `advancePregnancies`, `splitAll`, `reap`, `fillFloor`, `invade`) plus a tweak between
them, and `world.config` can be swapped for a spread copy around one call (`sexesEnabled: false` around `splitAll` gives
asexual splitting with sexual mating). With no tweak the run reproduces the unwrapped world's counts exactly, which is the check
to make first. Run independent arms as separate processes: they are single-threaded and 1000000 ticks at 100 agents takes about 15 minutes.
