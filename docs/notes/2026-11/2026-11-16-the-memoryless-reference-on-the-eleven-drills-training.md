### 2026-11-16 - The memoryless reference on the eleven drills (training-stages Phase 4, T21)

`node scripts/drill.mjs --archive <empty archive> --trials 64 --seed 1 --workers 8` (an archive with no elite, so the table
is the `memoryless` reference's row alone; seed 1, 64 trials per drill, the default config; 3.4 s on 8 workers). Win share
with its Wilson low bound, then the edge over four random brains and its low bound (`edgeLow`), then the first-match
lost-trial reasons. The gate seed is the validation partition's, so a gate reads other trials of the same drills; this is the
shape, not a gate reading.

| Drill            | Win share [low] | Edge (edge low) | Lost-trial reasons                             |
| ---------------- | --------------- | --------------- | ---------------------------------------------- |
| `food-ahead`     | 0.94 [0.85]     | +0.78 (+0.64)   |                                                |
| `food-behind`    | 1.00 [0.94]     | +0.88 (+0.77)   |                                                |
| `two-foods`      | 0.00 [0.00]     | -0.04 (-0.07)   |                                                |
| `prey-ahead`     | 0.22 [0.14]     | +0.22 (+0.12)   | `never-in-jaws` 41, `never-bit` 9              |
| `prey-too-big`   | 0.45 [0.34]     | -0.55 (-0.66)   |                                                |
| `hunter-closing` | 0.02 [0.00]     | +0.02 (-0.01)   |                                                |
| `rock-refuge`    | 0.00 [0.00]     | +0.00 (-0.01)   |                                                |
| `prey-crossing`  | 0.16 [0.09]     | +0.16 (+0.07)   | `never-in-jaws` 48, `never-bit` 6              |
| `hunter-flank`   | 0.00 [0.00]     | +0.00 (-0.01)   |                                                |
| `kin-spared`     | 0.00 [0.00]     | +0.00 (-0.01)   | `bit-kin` 51, `never-in-jaws` 8, `never-bit` 5 |
| `pack-converge`  | 0.98 [0.92]     | +0.98 (+0.90)   | solo 0.98, kin-blind 0.98, gain 0 (low -0.1)   |

Reading it:

- The seven original drills read as they did on 2026-11-07 (the sample differs: 64 trials, other worlds since). The four new
  ones: the reference wins `prey-crossing` at about `prey-ahead`'s rate (0.16 against 0.22; the loss is the chase, never in
  the jaws), loses `hunter-flank` as it loses `hunter-closing` (a forager that runs straight is caught), loses `kin-spared`
  by biting whenever prey is in view (51 of 64 lost trials are `bit-kin`: the sim refuses the bite, the drill reads the
  wish), and wins `pack-converge`.
- `pack-converge` is not a pack test for a scripted hunter. A lone hunter wins as often as the trio (63 of 64 against
  63 of 64) and the kin-blind trio the same, so the gain and the gap to kin-blind are 0 with a low bound under 0. The 2000
  energy prey takes more than one bite but a sprinting hunter that keeps biting kills it inside the 600 ticks. The `pack`
  gate of the ladder reads `drill.pack-converge.gainLow` and `.blindGapLow`: the Validity rule (the reference passes each
  condition) fails both, so T25 must rewrite or drop them, or stage a prey a lone hunter cannot kill (a larger body, not
  more energy), with a Decisions row. The scripted oracle that sends all three hunters at the prey wins 0.5 as a trio
  and 1.0 alone: three bodies crowd one prey.
- The same reference has no `winShareOverReference` on `two-foods`, `hunter-flank`, `rock-refuge` and `kin-spared` (it wins
  none, so that reading is null): a gate cannot use it on those four.
- Random brains win none of the four new drills at 8 trials of the validity tests (`test/evo/drill-scenarios-social.slow.test.js`);
  a chaser that bites everything wins `kin-spared` on none (every loss `bit-kin`), and the oracle that bites only a touching
  prey wins 0.375 of 32.
