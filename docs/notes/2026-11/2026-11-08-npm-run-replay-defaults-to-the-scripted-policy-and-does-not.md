### 2026-11-08 - `npm run replay` defaults to the scripted policy, and does not take `live`

- `scripts/replay.mjs` runs `baseline-v5` unless `--policy` is given, and its policy list is `baseline-v5` and `map-elites-v6` only: `--policy live` (the alias `npm run screen` and `npm run eval` accept, `LIVE_POLICY` in `js/evo/policies/index.js`) is refused. A replay meant to read the live world needs `--policy map-elites-v6`. Under `baseline-v5` the floor-off-looking collapse is the scripted policy's (seed 1 ends at 8 agents, 858 floor births in 200000 ticks).
