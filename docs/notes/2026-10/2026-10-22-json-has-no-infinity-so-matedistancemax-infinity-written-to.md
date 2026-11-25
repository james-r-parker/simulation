### 2026-10-22 - JSON has no Infinity, so `mateDistanceMax: Infinity` written to a config file reads back as null

`FEATURES_OFF` holds `mateDistanceMax: Infinity` (mate distance off). `JSON.stringify` writes it as `null`, and a config file
with `null` fails `validateConfig` ("mateDistanceMax is null; expected a number > 0"). Tests that write a config or a grid to disk
use 1e9 instead, which is off for any genetic distance. The golden hashes are re-pinned by running `runGolden` and `driveGolden`
(test/sim/golden-run.js, test/worker/helpers/golden-drive.js) and copying the printed values into test/sim/golden.json and the
busy effect constants in test/worker/sim-host.slow.test.js; there is no regeneration script.
