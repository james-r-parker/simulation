### 2026-10-17 - The worker host adds under 3% to a tick

`createSimHost` against `bench.step_ms@500` (500 agents, 500 warm-up ticks, 2000 measured, the noise policy so the
only differences are the host's; three alternating rounds on the dev machine, plain `step` mean 4.567 ms, median 4.50):
the host costs 4.696 ms per tick (+2.8%) when it posts a snapshot every tick (speed 1, the worst case) and 4.640 ms
(+1.6%) when it posts one per 8 ticks (speed 8), counting everything it does: the observer's phase and feed, generation
depth, effects, the snapshot, the inspect part, the ticker state and the 250 ms stats and field messages. Per stage, per
tick (means over the same 2000 ticks): `collectEffects` 0.0044 ms (0.1%), `writeSnapshot` with `writeEffects` 0.037 ms
(0.8%), the observer feed 0.053 ms (1.2%), `noteBirths` and `noteTick` under 0.001 ms each. The doc's budget (`collectEffects`
and `writeSnapshot` together under 3%) holds at 0.9%, so `collectEffects` is not optimised. Runs on this machine drift about 2%
between rounds, so the figures are good to about that.
