# Simulation notes

**Status:** Reference - verified platform and library facts, and learnings from each phase.

Facts here are verified against the running code or the library source, not recalled. Design docs link here rather
than repeating them.

## Platform

| Fact                                                                                                       | Where it matters           |
| ---------------------------------------------------------------------------------------------------------- | -------------------------- |
| Node 24 runs the headless sim, the eval runner, the trainer and every test                                 | `package.json` `engines`   |
| npm 11 does not run dependency install scripts unless approved; Vite, Vitest and esbuild work without them | `npm ci` in CI and locally |
| Vite serves `public/` at the site root; `public/database-worker.js` is loaded as `/database-worker.js`     | Workers                    |
| The production site is Cloudflare Pages (`wrangler.toml`, `npm run deploy`)                                | Deployment                 |

## Learned while building

Entries are `### YYYY-MM-DD - <topic>`, newest last, one finding each.

### 2026-10-11 - WebGPU in WSL Chromium is SwiftShader only

Playwright's Chromium under WSL2 (Ubuntu 26.04) gets only the SwiftShader fallback adapter, headless or headed,
whatever the Vulkan and ANGLE flags: Ubuntu's `mesa-vulkan-drivers` ships no Dozen (`dzn`) driver, so there is no
Vulkan device for the GPU. `GPUAdapterInfo` also does not survive `page.evaluate` - copy its fields into a plain
object in the page. Real-GPU browser numbers come from Windows Chrome over CDP (`--cdp=<url>`), which needs WSL
`networkingMode=mirrored` so WSL can reach Windows `127.0.0.1:9222`; Chrome only opens that port with a
non-default `--user-data-dir`.

### 2026-10-11 - Git hooks export GIT_DIR and GIT_INDEX_FILE

Git runs hooks with `GIT_DIR`, `GIT_INDEX_FILE` and other `GIT_*` variables set. A test that the pre-commit hook
runs (through `vitest related`) and that spawns `git` in a temporary repository inherits them, so its `git add` and
`git commit` act on the real repository: one wiped the index and committed onto the branch. Tests that spawn `git` or
`scripts/check.sh` pass an environment with every `GIT_*` key removed (`test/check-tiers.test.js`).

### 2026-10-11 - jscpd 5 has no exitCode option

jscpd 5.4.1 has no `exitCode` config key; `threshold: 0` already makes any clone exit 1. Scan paths are passed on
the command line, not in `.jscpd.json`.

### 2026-10-15 - Chromium reproduces the Node golden hashes

Playwright's Chromium 156.0.8078.4 (headless, under WSL2, in a module Web Worker) reproduces both Node 24.21.0 golden
world hashes bit for bit (`default` `9d12e1fdb23244c4`, `busy` `bc456558116b7ed5`, 5000 ticks each, about 3 s per
case), so V8 in Node and in Chromium agree on the sim core's `det-math.js`, `+ - * /` and `Math.sqrt` arithmetic.
`npm run browser:hash` (`scripts/browser-hash.mjs`) re-checks it; hashing needs no GPU, so SwiftShader does not matter.

### 2026-10-15 - Aspire CLI 13.5.4 and the standalone dashboard

Aspire CLI 13.5.4 (`aspire --version`, a dotnet tool, so a login shell) runs the dashboard without Docker:
`aspire dashboard run --frontend-url http://127.0.0.1:18888 --otlp-grpc-url http://127.0.0.1:4317 --otlp-http-url
http://127.0.0.1:4318 --allow-anonymous` (`npm run aspire:dashboard`). Machines with Docker use `docker-compose.yml`:
`mcr.microsoft.com/dotnet/aspire-dashboard:13.5.2` (the newest 13.5 tag on MCR; the image has no 13.5.4), with the
container ports 18889 (gRPC) and 18890 (HTTP) published as 4317 and 4318; the image leaves the HTTP endpoint off until
`DOTNET_DASHBOARD_OTLP_HTTP_ENDPOINT_URL` is set (not tried here - Docker is not installed in this WSL).
`scripts/lib/otel.mjs` posted its gauges to the CLI dashboard over OTLP HTTP, and
`GET http://127.0.0.1:18888/api/telemetry/resources` then listed `blob-evolution` with `hasMetrics: true`.

The MCP server is `aspire agent mcp --dashboard-url http://localhost:18888` (registered in `.mcp.json`); it needs no
AppHost. Limitation: its tools are `list_structured_logs`, `list_traces` and `list_trace_structured_logs` only, and
`aspire otel` has `logs`, `spans` and `traces` only, so metrics are viewable in the dashboard UI but not through MCP or
the CLI. Against an unreachable collector `MeterProvider.shutdown` retries past a 5 s test timeout, so `createMetrics`
races it against a 3 s deadline.

### 2026-10-15 - Stryker 10 and Vitest 5

`@stryker-mutator/vitest-runner` 10.0.0 runs under Vitest 5.0.3 but kills no mutant: the active-mutant id reaches the
setup file, yet every mutant is reported `Survived` (a 6.5% score). Under Vitest 4.1.5 the same config works: `js/sim`
scored 87.15% (3136 mutants: 2645 killed, 88 timeout, 398 survived, 5 no coverage) in 2 min wall time on the
7950X3D with 31 runners. The project keeps Vitest 5, so the `mutation` gate skips while `STRYKER_MAX_VITEST` in
`scripts/check.sh` is at or below the installed Vitest major; raise it once a Stryker release supports Vitest 5, then
record the baseline with `scripts/check.sh --tier 3 --fix`. Most survivors were equality and arithmetic operator
changes in `physics.js`, `spawn.js` and `ray-march.js`.

Stryker's TypeScript-config preprocessor calls `ts.parseConfigFileTextToJson`, which TypeScript 7 removed;
`stryker.config.json` points `tsconfigFile` at a file that does not exist to skip that step.

### 2026-10-15 - js/sim mutation score raised to 96.36%

Measured under Vitest 4.1.5 (the gate skips under Vitest 5): new boundary and exact-value tests took `js/sim` from
87.15% to 96.36% (2935 killed, 87 timeout, 114 survived, 0 no coverage). The survivors left are judged equivalent:
most are `i <= length` loop bounds where the extra read is `undefined` and rejected; others are comparisons whose
equality case cannot occur (a float32 angle sum equal to the double PI, a speed exactly at the cap scaling by 1) or
writes a later pass overwrites (the spatial hash count pass, DDA setup with an infinite `tMax`). Redundant but
harmless code they exposed: the `entries < maxAgents` guards in `resolveCell` (physics.js), the same-kind index
tie-break in `consider` (ray-march.js, unreachable because circles are tested in ascending index), and
`Math.max(minSize, ...)` in `spawnAgent` (validation already requires `minSize <= baseSize`). `toThrow('message')`
also passes when `undefined` is thrown, so error tests pair it with `toThrow(Error)`.

### 2026-10-16 - Parallel headless throughput on the 7950X3D

`npm run bench:parallel` (500-agent bench world, 2000 ticks per worker, two runs within 3% of each other), in total
ticks per second across workers:

| Workers | Ticks/s     | Gain over 1    | Efficiency |
| ------- | ----------- | -------------- | ---------- |
| 1       | 240         | 1.00x          | 100%       |
| 8       | 1658 - 1663 | 6.92x          | 86%        |
| 16      | 2875 - 2880 | 11.98 - 12.00x | 75%        |
| 24      | 3367 - 3392 | 14.00 - 14.16x | 58%        |
| 32      | 3536 - 3636 | 14.71 - 15.17x | 46%        |

32 workers beat 16 by 23 - 26%, so SMT is worth having and the eval default stays `os.availableParallelism()` (32).
Per-worker speed falls from 240 to about 110 ticks/s at 32: shared cache and memory bandwidth, not idle cores (CPU
use 95%). The run-to-run gap is under 10%, so workers are not pinned to cores.

The eval observer reads `lastLoss` for collisions right after the physics phase (`observerPhases`): `applyCosts`
later in the same tick sets `lastLoss` to `cost` whenever it removes energy, so a reading after `step` never sees
`collision`.

### 2026-10-16 - baseline-v5 lives on the population floor

`evals/baselines/baseline-v5.json` (8 seeds x 200000 ticks, 77 s on 8 workers) shows the default config does not
sustain unevolved brains: mean population 21.5 against `minAgents` 20, 557 floor episodes per seed, 0.005 births per
1000 agent-ticks and almost no predation. Agents eat about 47 energy per 1000 agent-ticks against a cost near
twice that, so most die at a median age of about 4100 ticks and the floor refills with fresh random genomes. Diversity
sits at 0.1416, which is `sqrt(2) x 0.1`, the expected distance between two unrelated `N(0, 0.1)` rows - nothing is
inherited. `cloneWithNoisePolicy` collapses to the floor the same way (seed 1, 20000 ticks), so this is the default
world, not the policy. The evolution rework has to get agents past the floor before inheritance can show up in the
metrics.

### 2026-10-16 - Full thrust costs about 30 times standing still

`applyCosts` charges `movementCost x speed^2` (0.03 x 8^2 = 1.92 per tick at `maxVelocity`) on top of `passiveLoss`
0.06. In the anti-exploit micro-world a `foodSeeker` at full thrust eats about 500 energy and still dies at about 450
ticks, while a `sitter` lives about 3900 ticks on its starting 800. Under `fitnessV5` that makes sitting, spinning and
bumping outscore seeking food ([legacy-audit.md](legacy-audit.md) FIT-8). It also caps what any agent eats in a life,
so `explorerAfterMeal` switches after 140 food energy rather than 500.

### 2026-10-16 - The population floor raised to 100

The 20-agent population was the `minAgents` floor, not a carrying capacity: over 20000 ticks about 760 of the 800
food items sat uneaten while unevolved brains starved around them. The floor is now 100 (`initialAgents`), so the
archive in [evolution-rework.md](evolution-rework.md) Phase 2 gets five times as many floor and immigrant trials.
`baseline-v5` at 8 seeds x 200000 ticks now takes about 245 s on 8 workers. The population sits at exactly the floor
(100.0), births stay near zero (0.0006 per 1000 agent-ticks: random brains do not mate however many there are),
food energy per 1000 agent-ticks falls from 47 to 37 and lineage turnover to almost 0 (100 random lineages rarely
lead by 2). Calibration `E2` passes. The floor-20 reports are kept as `evals/experiments/E0-*-floor20.json` for `E0`
and `E1`; the default golden hash moved to `6d2d987ab3306c5c` and Chromium reproduces it.

### 2026-10-16 - The default world's food supply

On the old defaults even a scripted `foodSeeker` population died out within about 5000 ticks with no births at any
thrust. `spawnFood` adds food fast only while the stock is below `max(foodTargetMin, foodTargetPerAgent x
population)`. With about 760 items lying around and a target of 150 it ran at `foodSurplusRate`: about 0.1 items (7
energy) per tick for the whole world.

Sweep on `map-elites-v1`, 2 seeds x 60000 ticks:

- The births levers alone (`mateRange`, `childEnergyShare`, `childEnergyMin`, `splitMinEnergy`) raised births from
  0.0005 to 0.013 per 1000 agent-ticks, with the population pinned at the floor.
- Adding `foodTargetPerAgent` 8, `movementCost` 0.015 and `foodEnergy` 100 took births to 0.057 per 1000 agent-ticks.
  Floor episodes fell from about 1300 to 720, food per 1000 agent-ticks rose from 45 to 102, median lifespan from
  about 3300 to about 4200 ticks, and lineages per 100 agents fell to 87 as families formed.
- The mean population stayed at the floor (100.9). While the floor replaces every death, the mean is no measure of
  births, so `eval.born_share` and `eval.births_per_1k` are the measures.
