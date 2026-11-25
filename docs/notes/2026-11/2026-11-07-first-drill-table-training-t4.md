### 2026-11-07 - First drill table (training T4)

`node scripts/drill.mjs --policy map-elites-v6 --trials 32 --workers 2` (seed 1, the 8 best elites of a fresh 20000-tick
world on seed 1, default config; win share, with the edge over four random brains in brackets; `-` is a skipped drill).
Only one of the 8 elites was a forager.

| Subject                | food-ahead   | food-behind  | two-foods    | prey-ahead   | prey-too-big | hunter-closing | rock-refuge  | mean edge |
| ---------------------- | ------------ | ------------ | ------------ | ------------ | ------------ | -------------- | ------------ | --------- |
| forager elite (cell 4) | 1.00 (+0.90) | 0.88 (+0.70) | 0.00 (-0.10) | -            | -            | 0.00 (+0.00)   | 0.00 (+0.00) | +0.30     |
| 7 predator elites      | -            | -            | -            | 0.00 (+0.00) | 1.00 (+0.00) | -              | -            | +0.00     |
| reference `memoryless` | 1.00 (+0.90) | 1.00 (+0.82) | 0.00 (-0.10) | 0.31 (+0.31) | 0.28 (-0.72) | 0.03 (+0.03)   | 0.00 (+0.00) | +0.18     |

Reading it:

- No genome passes `two-foods` (the evolved forager and the scripted reference both eat the nearer, toxic item first;
  random brains win 0.10 by wandering), `hunter-closing` or `rock-refuge`: no forager survives 600 ticks against a
  hunter that starts 500 px away, and none enters the ring.
- No evolved predator kills in `prey-ahead` (0.00 on all seven); the scripted chaser wins 0.31. A predator's 1.00 on
  `prey-too-big` is the abort drill won by not biting, which a predator that never bites also wins (edge 0.00, since
  random brains do not bite either). Read `prey-too-big` only beside `prey-ahead`.
- A fleeing prey can starve at a sprint before it is caught (it did at tick 342 against a still subject), so the
  `prey-ahead` win reads the sim's `deliberateKills` credit, not the prey's death.
- The drill world has no refuges, so `refugeSense` inputs read 0 in every drill.
