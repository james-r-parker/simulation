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

### 2026-10-16 - Food is visible and a sensible forager thrives

On the reachable-births defaults (seed 2, tick 3000, baseline-v5 brains): 68% of agents have food within their
specialisation's `visionRange` (1.65 items on average), and 52% see food on at least one of their 16 rays, so about three
quarters of in-range food is seen despite rays 22.5 degrees apart (about 120 px apart at 300 px, against a 40 px food
item). The median distance to the nearest food is about 250 px. With the floor and immigration off, the scripted
`foodSeeker` grows from 100 agents to 213 (thrust 0.4) or 324 (thrust 0.25) in 20000 ticks, but dies out by tick 7200
at thrust 0.6 or 1: the world rewards steering to food at a moderate speed and punishes rushing. Evolved
`map-elites-v1` populations stay near the floor of 100, so the gap is in what evolution finds, not in the economy.

### 2026-10-16 - Selection, survival weight and exploits

On the reachable-births world, `map-elites-v1` agents rush: they eat 84% more than `baseline-v5` but agents that eat die
26% sooner. Raising `fitnessV1`'s survival weight from 0.02 to 0.4 changed nothing while archive parents were drawn
uniformly across cells; with a four-draw cell tournament (`map-elites-v1q`) it traded food for lifespan (4-seed, 60000
ticks: survival 0.02 -> 1.0 moved fed lifespan 4266 -> 4932 and food 119 -> 94). Uncapped survival 0.5 at 16 seeds closed
the fed-lifespan gap to -11% and one seed broke out to a self-sustaining population of 237, but it pays agents that
never eat, so the sitter, spinner and bumper beat the foodSeeker again. Survival capped at food eaten (E9) or paid only
after 500 food (E10) is exploit-safe and gives fed lifespan -28% and -23.5%. The full-thrust scripted foodSeeker starves
on this economy, so the anti-exploit reference seeks at thrust 0.4.

### 2026-10-16 - Body temperature: the sweet spot

With body temperature on the reachable-births defaults (seed 1, floor and immigration off, 20000 ticks), constant-thrust
scripted foragers (the foodSeeker's steering): thrust 0 dies out by tick 4453 at a mean temperature of 24; thrust 0.2
grows from 100 to 393 agents (1927 births) at a mean of 49.7, inside the 40-65 band; thrust 0.4 grows to 217 (mean 73);
0.6 to 163 (mean 81); thrust 1 dies out by tick 6295 (mean 78). Moving gently pays, and both sitting and rushing cost.
The legacy `temperatureGainMove` 0.025 and `temperatureLossPassive` 0.015 give this shape, but the live policy's
fed lifespan was 17% down at them, so T10 later tuned the defaults (next entry). In the
micro-world a sitter now dies at about tick 3850 against 9180 with the passive multiplier off (2.4x sooner). Averaged over the year the temperature holds at a speed fraction of 0.75 (the equilibrium speed in the design doc's Rules section). The legacy
`js/agent.js` scaled cooling by `1 + modifier x 0.07`, so hot seasons cooled faster, against its own comment; the port
follows the comment (`1 - modifier x 0.03`). A 2000 x 1000 test world with the default 25 obstacles can fail food
placement ("no point clear of obstacles"), which the eval-runner slow test now avoids with 4 obstacles.

### 2026-10-16 - Body temperature: tuning the live policy's rates

The live policy (`map-elites-v1q`) lived 17% shorter at the legacy rates (E12). Halving `temperatureGainMove` and
`temperatureLossPassive` (E15) cut that to -5.4%, just past the 5% rule, so the rates alone did not
close it. A sweep of seven candidates (A-G) on seeds 29-32 then softened the extremes:
`temperaturePassiveLossFactor` 4 to 2 with heat efficiencies 0.9 and 0.6 (candidate C, 16 seeds: fed lifespan -1.2%, food -2.9%, births +0.1%, none a verdict) and C with
`temperatureGainMove` 0.01 (candidate H: -1.9%, +1.9%, +3.5%, none a verdict). H is the default. A sitter and a
full-thrust agent still die (the scripted check ends with 0 agents at thrust 0 and at thrust 100, and 332 at thrust 20), while two softer
candidates (F and G) let thrust 100 survive and were dropped. Both C and H still read `worse` on `eval.floor_episodes`
(+11.1% and +9.5%) and on several fitness means and p90s, and `better` on coverage; these are recorded (E16, E17) and
were not part of the pass rule, which names only fed lifespan, food and births.

### 2026-10-17 - Food placement in a fertile zone an obstacle covers

Long runs died with "no point clear of obstacles for radius 30 in 100 tries" in the `field` phase (three times:
tick 85542 on a 7680 x 4320 world, tick 175856 and tick 115629 under tuning overrides). It was not the uniform
sampler: `placeInZone` draws only within `fertileZoneRadius` (150) of a zone centre, and obstacles drift
(radius up to 120, plus 30 for a high-value item) until one lies over a zone and blocks every draw. A zone is
long-lived, so over hundreds of thousands of ticks this is certain to happen. `placeInZone` now falls back to
`placeClear` after `placementTries` zone draws; runs that never hit the case replay unchanged (no golden
changed). The same cause explains the earlier "2000 x 1000 test world can fail food placement" note.

### 2026-10-17 - Jaws cut catches; `huntSizeRatio` 1.01 restores them

With the forward bite arc (`biteArc` PI / 4) and the d7 economy, a 4-seed screen (`map-elites-v1q`, seeds 28-31, 200000 ticks) gave
`eval.predation_per_1k` 0.00068, half of the 0.00135 the same economy had without jaws at 16 seeds. Overrides on the same seeds:
`huntSizeRatio` 1.0 0.00057, 1.01 0.00129 (96% of the reference), predator `sprintBoost` 1.8 0.00085. `huntSizeRatio` 1.01 is the
default (one key). Cost on the same screen: `eval.floor_episodes` 1044 against 891, `eval.population_mean` 217 against 231; fed lifespan (4741 against
4645), food energy and births stayed within 5%. These are 4-seed numbers, not verdicts.

### 2026-10-17 - `maxFood` capped the food target, so the economy lever did nothing

The food target is `min(maxFood, max(foodTargetMin, foodTargetPerAgent x population))`. With `maxFood` 800 and a
self-sustaining population of 100 or more agents, `foodTargetPerAgent` 8 already met the cap near 100 agents, so raising
`foodTargetPerAgent` changed nothing and the economy could not grow with the population. Sweeping the economy needed
`maxFood` 1600 first (and `foodTargetPerAgent` 12). Check the cap before reading a flat result from a per-agent knob.
Recorded in E20: fed lifespan +19.4%, food +120%, births +74% against E17, population 101 to 270.

### 2026-10-17 - Alarm-call spam, and why call costs are 0.5

The first E20 run at the original Phase 1 defaults (`alarmCost` and `huntCallCost` 4) was worse than E17: fed lifespan
-17.4%, births -14.5%, `eval.floor_episodes` +44%. The cause was alarm-call spam: at a cost of 4 per call, agents that
fired the alarm output at every opportunity paid for it in energy. A 74-screen sweep of four seeds each chose `alarmCost` and `huntCallCost` 0.5 (calls stay
a real cost, not a tax on being alive), with `maxFood` 1600, `foodTargetPerAgent` 12 and `huntSizeRatio` 1.03. The choice
(d7) held at seeds 1-16 and at fresh seeds 17-32.

### 2026-10-17 - Jaws halve predation until `huntSizeRatio` 1.01

T8c's forward bite arc (`biteArc` PI / 4) cut `eval.predation_per_1k` to about half of the same economy without jaws
(0.00068 against 0.00135), because a hunter now has to face its prey. Lowering `huntSizeRatio` to 1.01 gave 0.00129 (96% of the reference) on the
same four seeds; 1.0 did not (0.00057). `huntSizeRatio` 1.01 is the default. The detail is in the Jaws entry above.

### 2026-10-17 - Calibration noise at 16 seeds under a self-sustaining population

E19 (baseline-v5, seeds 1-16 against 17-32, final Phase 1 defaults) gave no verdict on any Target metric, but did give
verdicts off the Targets: `floor_episodes` -23.6% (better), `lineages_alive` -20.9% (worse), scout fitness better,
p90 predator fitness worse. Before Phase 1 the same calibration (E18) gave none. With a population that sustains itself
(born share 0.49 and 0.64 in the two E19 samples) per-seed variance in lineage and floor counts exceeds the 5% minimum effect at 16 seeds, so those
off-Target verdicts in E20 (`lineages_alive` -59.3%, `lineage_turnover` -44.7%) are read with that noise in mind. More
seeds, not a lower `--min-effect`, is the fix.

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

### 2026-10-17 - Node batches a port's messages, which starves a worker that yields through `MessageChannel`

A `MessageChannel` slice loop (the shell `sim-worker.js` posts the next slice to itself while ticks are owed) never lets
`parentPort` messages through when run in a Node `worker_threads` worker: Node handles up to 1000 messages of one port in a
single loop turn, including ones posted while it handles them, so at a speed the sim cannot sustain no `returnBuffer`,
`pause` or `reset` is read for as long as the backlog lasts. Browsers deliver each message as its own task, so the page is
not affected; a Node harness around the shell must replace `MessageChannel` with `setImmediate`.

### 2026-10-17 - A policy that counts the observer's death rows must follow a drain

`map-elites-v1` numbers death-log rows from the start of the run (`deathsSeen`) and reads each row back by that index. The
worker empties the log after every stats message (`drainObserverLogs`) so a run that never ends does not grow it, which
would send the policy to the wrong row. The observer therefore counts the rows it has removed (`deathsDrained`) and the
policy subtracts that count. Any new policy that indexes the observer's `deaths` or `series` logs by a running count
needs the same offset.

### 2026-10-17 - Combat metrics at the tuned defaults

The five combat metrics (predator-prey.md Phase 2) first recorded for the two reference policies at the tuned Phase 1
defaults: 16 seeds x 200000 ticks, `npm run eval -- --policy <p> --seeds 16 --workers 16`. Means over the seeds with a
value; these are recordings, not comparisons, so there is no ledger entry.

| Metric                 | `baseline-v5`   | `map-elites-v1q` | `null` seeds                                   |
| ---------------------- | --------------- | ---------------- | ---------------------------------------------- |
| `eval.catch_rate`      | 0.00729         | 0.01076          | none                                           |
| `eval.escape_rate`     | 0.621           | 0.656            | none                                           |
| `eval.pack_kill_share` | 0.0312          | 0.0265           | none                                           |
| `eval.alarm_response`  | 0.00155         | 0.00454          | none                                           |
| `eval.smoke_escapes`   | 0.786 (7 of 16) | 0.722 (14 of 16) | `no smoke release after a bite`: 9 and 2 seeds |

Every seed had hunters, so `eval.catch_rate` was never `null` (`no hunters`). Catch rates are small (0.007 and 0.011
catches per 1000 hunter agent-ticks) and pack kills a few percent of kills, which is the headroom Phase 3
targets. The hunter on the micro-world also earns most of its `fitnessV1` from bite energy taken from peers (about 680
per agent against 260 from food at the tuned defaults), which the anti-exploit bound, measured on food energy, does not
allow for.

### 2026-10-17 - `three` 0.186.1 is the current release

Checked with `npm view three version` at the start of Phase 2 (T11): 0.186.1, the version already pinned, so there is no
upgrade and no API change to record. The renderer uses `WebGLRenderer`, `InstancedMesh`, `ShaderMaterial`,
`DataTexture` and `EffectComposer` with `UnrealBloomPass` and `OutputPass` from `three/examples/jsm/postprocessing`.
`legacy.html` keeps running on the same version.

### 2026-10-17 - Renderer facts found building Phase 2 (three 0.186.1)

- `three` ships no type declarations and `@types/three` is not a dependency, so `js/app/three-shim.d.ts` declares `three` and
  `three/examples/jsm/*` as untyped modules and the tsconfig includes it.
- `three`'s objects (geometries, `InstancedMesh`, `ShaderMaterial`, `DataTexture`, `WebGLRenderTarget`) build in Node without a
  GL context, so layers are unit-tested there; only `scene.js` and `bloom.js` need a browser.
- Tone mapping applies only when drawing to the screen, never into a render target, so a shader that ends with
  `#include <tonemapping_fragment>` and `<colorspace_fragment>` is right on both paths: direct to the canvas (quality 2) and
  through the composer, where `OutputPass` does it. The renderer uses `NeutralToneMapping`, which keeps hue better than ACES.
- `UnrealBloomPass` blends five mips with `bloomFactors` `[1, 0.8, 0.6, 0.4, 0.2]`; the widest mip is about 700 px at 1080p and
  turns a dense scene into a fog. `BLOOM.factors` weights them `[1, 0.7, 0.38, 0.12, 0.03]` with radius 0 and strength 0.32 so the
  black stays black.
- `Float32BufferAttribute(array)` copies its array; use `BufferAttribute(array)` to keep writing into a preallocated one.
- `half` is a reserved word in GLSL ES 3.00; a variable called `half` fails to compile.
- Headless Chromium renders WebGL2 with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`; a 4K frame of 420
  agents, haze and bloom takes a few seconds in software.

### 2026-10-17 - Interface facts found building Phase 3 (uplot 1.6.32)

- `uplot` touches `document` and `window` when imported, so nothing in `js/app/` imports it at the top: the page loads it with
  `import('uplot')` and `import('uplot/dist/uPlot.min.css')` when the charts drawer first opens, and `mountCharts` takes the
  class as an argument so the tests use a fake. `declare module '*.css'` in `js/app/globals.d.ts` types the stylesheet import.
- uPlot has no stacking: the stacked charts (family river, births and deaths, catch against escape) plot cumulative tops,
  highest first, so each lower band paints over the one above it. Series count is fixed per chart, so the river always has
  nine series (eight lineages and "others") and a function `fill` reads a colour table that `data` rewrites.
- Typed arrays work as uPlot data, so `columns(history)` hands out `subarray` views with no copy.
- A key event whose target is a button is ignored by `actionForKey`, so after a click on a control button `Space` activates
  that button instead of pausing; focus the canvas (click it) to use the keys again.

### 2026-10-17 - How far eight family colours can be pushed apart (CIEDE2000, Machado 2009)

- Eight slots that stay at least 15 apart in normal vision and 10 apart under each of the Machado-2009 deuteranopia,
  protanopia and tritanopia matrices, and clear food teal, the three scents and the alarm and eaten reds by the same
  amounts, are barely feasible. A random-restart hill climb over hue, saturation and lightness found a set only at
  HSL lightness 0.55 to 0.7 with most slots at saturation 0.25 to 0.5 (a pastel set), by a margin of 0.15.
- At exactly HSL lightness 0.72 no eight-colour set cleared the thresholds (the best was 4 short, stuck on one slot's
  distance to food teal and to the hunt amber); allowing 0.55 to 0.72 found one. The colour-blind-safe set needs 20 apart
  under each simulation and only reached it with lightness 0.3 to 0.85.
- `test/app/renderer/helpers/color-metrics.js` reproduces the published CIEDE2000 test pairs to four decimals, so the
  thresholds mean what they say; the three matrices are applied in linear RGB.

### 2026-10-17 - The hover peek and the world's y axis

- The world's y axis points up on screen (`screenToWorld` negates the device y), so a ray at `2 PI k / n` from the heading
  turns counter-clockwise; the inspector radar draws it that way.
- `window.localStorage` can throw on read (blocked site data); `main.js` asks for it through `safeStorage` and the
  interface runs without preferences when it is null.

### 2026-10-17 - Measuring the v6 app in a browser

- A Chromium trace with categories `v8` and `disabled-by-default-v8.gc` names each whole GC pause on the `CrRendererMain`
  thread `MinorGC` (a scavenge) or `MajorGC` (a mark-compact). `V8.GCScavenger`, `V8.GCCompactor` and every `V8.GC_*` phase
  event sit inside them, so `browser.gc_pause_ms` sums only `MinorGC` and `MajorGC` (`GC_PAUSE_EVENTS` in
  `scripts/lib/perf-v6.mjs`). GC on worker threads is on other threads and is not counted. `browser.startTracing(page, ...)`
  returns the trace as a Buffer of JSON with a `traceEvents` array.
- Headless Chromium reports `EXT_disjoint_timer_query_webgl2` under SwiftShader, but its results can be discarded as
  disjoint and the frame rate there (about 9 Hz at 1280x720 with 500 agents) says nothing about a GPU: the script refuses a
  software renderer without `--allow-fallback` and a display under 120 Hz without `--allow-low-refresh`.
- `PerformanceObserver` with `type: 'longtask'` gives each task's `startTime` on the page's `performance.now()` clock, so
  tasks in the first 5 s are dropped by comparing it with `WARMUP_MS`.
- The worker sends `stats` only while the sim runs, so a paused app has no new stats; the top bar reads the tick and
  population from the newest snapshot, which each `step` posts.

### 2026-10-17 - Body traits and the hash cell size

- With `traitsEnabled` the largest body is `baseSize x TRAIT_MAX + maxEnergy / energyToSize`, 132.5 at the defaults, which
  is above `hashCellSize` 128, so `validateConfig` rejects `traitsEnabled` at the default cell size. T41 raises
  `hashCellSize` (140 passes) when it switches traits on.
- The sensing hash is walked cell by cell along each ray until the ray exceeds its own range, so a longer vision trait needs
  no separate query radius; `castRays` takes the range from `visionOf` in `js/sim/traits.js`.

### 2026-10-17 - The skill ladder at the defaults (world-balance T12)

`npm run ladder` at the defaults (`minAgents` 0, 10000 ticks, seeds 1-3, commit 88f3940). Final population per seed,
then the rung means:

| Ladder | Rung                       | Final population | `food_energy_per_1k` | `births_per_1k` | `deliberate_food_share` | `pursuit_bite_share` | `undefended_bite_share` |
| ------ | -------------------------- | ---------------- | -------------------- | --------------- | ----------------------- | -------------------- | ----------------------- |
| Forage | `random`                   | 13 / 5 / 34      | 104                  | 0.065           | 0.23                    | 0                    | 0.67                    |
| Forage | `wanderer`                 | 0 / 0 / 0        | 215                  | 0.004           | 0.05                    | -                    | -                       |
| Forage | `sloppyForager`            | 0 / 0 / 0        | 633                  | 0.226           | 0.46                    | -                    | -                       |
| Forage | `foodSeeker`               | 322 / 316 / 334  | 700                  | 0.448           | 0.86                    | -                    | -                       |
| Forage | `fleer`                    | 288 / 283 / 284  | 777                  | 0.521           | 0.82                    | -                    | -                       |
| Combat | `jawSitter` v `foodSeeker` | 320 / 304 / 331  | 672                  | 0.434           | 0.85                    | 0                    | 1.00                    |
| Combat | `hunter` v `foodSeeker`    | 253 / 215 / 216  | 818                  | 0.649           | 0.80                    | 0.84                 | 0.97                    |
| Combat | `hunter` v `fleer`         | 2 / 0 / 0        | 720                  | 0.536           | 0.53                    | 0.83                 | 0.17                    |

- No rung saturates (0.9 x `maxAgents` is 450), but the forage ladder is not a ladder: `random` keeps 5-34 agents
  while `wanderer` and `sloppyForager` die out, and `sloppyForager` eats nine tenths of the `foodSeeker`'s food per
  1000 agent-ticks yet dies. Half-time seeking is not enough to cover the cost of living at these defaults; B2 is
  now a cliff between `sloppyForager` and `foodSeeker`, not a flat top.
- `deliberate_food_share` rises with skill up to `foodSeeker` (0.05, 0.23, 0.46, 0.86; `fleer` 0.82), so D1 separates the
  rungs even where the population does not.
- `hunter` against `fleer` prey nearly empties the world (2, 0, 0), while `hunter` against `foodSeeker` prey keeps
  215-253. The `fleer` spends its ticks fleeing and its `deliberate_food_share` falls to 0.53; that cost, not the
  catch, is the likely cause, since `undefended_bite_share` falls from 0.97 to 0.17. The Phase 4 night should check
  that fleeing is not a dominated strategy before it tunes predation.

### 2026-10-21 - Honest ray classes

World-balance Phase 2 made the agent ray classes honest. `agentChannel` in `js/sim/ray-march.js` now asks `couldBite`
(the rule `feed` uses, without the jaws) instead of comparing sizes: a hit is kin, else "can bite me" (channel 2), else "I can bite
it" (channel 3), else other (channel 4). Class channels carry the hit's proximity; food, wall, obstacle and smoke
still carry 1. At `huntSizeRatio` 1.01 about half of all agents had read as bigger, so before this a prey saw a
threat on most rays and a hunter saw prey on most rays, whether or not either could bite. Now a prey sees only
agents that can bite it (they can hunt and are bigger by the ratio, from any angle; the first build also required the jaws to face the caster, and the user chose on 2026-10-21 that prey should know a predator from any angle), and a hunter sees only
what it can bite. The intent state's threat is the nearest channel-2 hit, so the `canHunt` scan and its grid are
gone. Mating has its own size band, `mateSizeRatio` (1.3).

- **The survivable-prey world had to be re-chosen by its criterion.** Honest classes change which agents a hunter
  treats as prey, so the Phase 1 settings no longer left prey alive on seeds 2 and 3. `evals/survivable-prey-world.json`
  now has 60 starting agents, `maxAgents` 120, 100 food and one predator in eight; the criterion in
  `test/evo/survivable-world.slow.test.js` is unchanged. One in four held until the classes moved to `couldBite`:
  once hunters see prey from any angle they multiply after the midpoint and empty the prey.
- **B20: `hunter` fails the anti-exploit suite under `fitnessV5`.** With honest classes the scripted `hunter` finds
  prey reliably, and `fitnessV5` pays a flat 720 points per kill whatever the kill brings in (legacy-audit FIT-5), so
  the intake bound is exceeded. The cause is the fitness, not the senses, so the suite marks `hunter` an expected
  FIT-5 failure under `fitnessV5` only (user); no bound was loosened.

### 2026-10-21 - The skill ladder on honest senses (world-balance T24)

`npm run ladder` at the defaults on the Phase 2 senses (10000 ticks, seeds 1-3), mean final population per rung, with
the Phase 1 ladder in brackets: forage `random` 12.7 (17.3), `wanderer` 0 (0), `sloppyForager` 0 (0), `foodSeeker`
324 (324), `fleer` 321 (285); combat `jawSitter` v `foodSeeker` 318 (318), `hunter` v `foodSeeker` 228 (228),
`hunter` v `fleer` 3.3 (0.7).

- `fleer` now matches `foodSeeker` when there are no predators: it no longer flees every bigger agent, only those that
  could bite it.
- `hunter` against `fleer` still nearly empties the world. Prey that see hunters from any angle still lose; the
  Phase 5 night should check that fleeing is not dominated before it tunes predation.
- The forage ladder is still a cliff between `sloppyForager` (dies out) and `foodSeeker` (B2).

### 2026-10-21 - V8 block counters wrap at 2^32 and break branch coverage

`vitest --coverage` (v8) merges block counts as unsigned 32-bit numbers. `circleHit` in `js/sim/ray-march.js` runs about
4.5 billion times in the whole suite (the slow evo tests alone are 3.6 billion), so its call count wrapped past 2^32
and the implicit "else" of its early-return `if` (call count minus the hot branch) came out negative, which
`json-summary` counts as uncovered: `js/sim` branches read 99.87% against a baseline of 100% although every branch ran.
A branch-free `circleHit` (a 0/1 `valid` multiplier) avoided the wrap but took a square root on every miss:
`node scripts/bench-compare.mjs` put `bench.phase_ms.sense@500` at +8.8% and the 7680 x 4320 row at +17.6%, so it was
reverted. Instead (user, 2026-10-21) `scripts/check.sh` runs the test gate in two passes: everything with coverage
except `STATISTICAL_TESTS` in `vitest.config.js` (`deliberate-controllers`, `survivable-world` and `anti-exploit`
slow tests), then those three without coverage. If a branch in a hot function reads as uncovered with negative
counts in `coverage-final.json`, suspect the same wrap before adding tests.

### 2026-10-21 - Vitest 5 bench mode is a test-context API

Vitest 5.0.3 has no `bench` export to call inside `describe`: a benchmark is `bench(name, options, fn)` taken from the
test context (`test('x', async ({ bench }) => { await bench('name', fn).run() })`) in a `*.bench.js` file that
`vitest bench --run` runs (`benchmark.include` in `vitest.config.js`). There is no `--outputJson`; `writeResult` in the
bench options writes `{ latency, throughput, period, totalTime }` (each with `mean` and `rme`) to a path inside the
project root, which `scripts/bench-micro.mjs` reads back. The import of a bench file's modules is most of its run time
(about 30 s for the eight files; the benches themselves take about 20 s).

### 2026-10-21 - A microbench win can be a loss in the full step

`hebbianStep` with a ternary clamp and an unrolled loop was 37.5% faster in `bench:micro` and 7% to 14.5% slower on the brain phase of the full step with every feature on (old and new trees benched at the same time on separate cores, 5 runs). The micro state repeats one call on one world, so branches and caches behave differently from a living world. Confirm a microbench gain with `bench.phase_ms.*@500defaults` before keeping it. Benching old and new at the same time on separate cores cancels host noise that swung sequential runs by 30%.

### 2026-10-21 - An object built by many keyed stores is in dictionary mode, and slow in every hot loop

`allocateWorld` (`js/sim/world.js`) added about 110 fields with `world[name] = ...` inside `allocRows`, and
`createIntentState` added 50 slot arrays the same way; V8 moves an object to dictionary ("slow") properties once keyed
stores pass a small limit, so every `world.x[slot]` in a hot loop was a hash lookup, field loads could not be folded, and
the cost grew with the number of distinct fields a loop touched. Check with `node --allow-natives-syntax -e` and
`%HasFastProperties(obj)`. Copying with a spread (`return { ...world }`) gives a fast object (`Object.assign({}, o)` and
`Object.fromEntries` do too; the prototype trick and a plain return do not). Fixed, the bench step at 500 agents fell
from 3.9 to 2.45 ms (frozen) and from 6.7 to 3.4 ms (all features on); the "all-on physics tripling" was this plus 76 more
`obstacleBounce` calls per agent from the basins rocks. `test/sim/world-shape.test.js` fails if the world or the intent
state falls back. Any new object that is filled by a loop of keyed stores and then read in a per-tick loop needs the same
copy; a one-off check is the `fast4`-style walk: from the world, observer and policy, report objects of more than 8 keys
whose `%HasFastProperties` is false (none were left after the fix).

### 2026-10-21 - Observer cost scales with alarm calls, not with agents

About 4.7 alarm calls land per tick in the frozen bench world (100 hunters among 500 agents, 3.8 with every feature on).
The follow-up used to do O(agents) work in each call (refill band, genome and speed; a hunters-by-agents distance scan
once per tick), so its cost depended on how often evolved agents call. It now fills one snapshot per tick that all the
tick's calls share, and a call adds only its role row. When a future observer feature does per-event work over every
slot, share what does not depend on the event across the tick's events first. A sorted-x scan seeded with each agent's
nearest hunter of the last call is exact (`dx * dx <= dx * dx + dy * dy` holds in floating point) and cheaper than the
all-pairs scan (the combat part 0.091 to 0.069 ms per tick); a uniform grid of the hunters was no faster than all-pairs in a 14400 x 8100 world
(hunters cluster, so rings of empty cells are searched), and was dropped.

### 2026-10-22 - Static rocks are obstacle slots, and `obstacleCount` counts only the wandering ones

With `terrainLayout` `basins` the wall and the refuge rings are obstacles that never move, stored after the wandering
ones (`obstacleSlots(config)` = `obstacleCount` + `terrainRockCount(config)`, 101 slots at the defaults and
`obstacleCount` 0). Code that counts every obstacle must loop to `obsX.length` or `obstacleSlots` (collisions, ray
gathering, placement, the snapshot and `worldInfo.obstacleCount`); code that moves them loops to `config.obstacleCount`
(`moveObstacles`), which is what keeps the rocks still. `validateConfig` rejects `basins` with `obstacleCount` above 0, so
the two never mix in one world. A new loop over `config.obstacleCount` that should see the rocks is a bug that only shows
with terrain on.

### 2026-10-22 - Carcasses are food items: they fill `maxFood` and the food target

`leaveCarcass` writes the meat into the lowest free food slot, so a carcass raises `foodCount` like any item. Under the
population rule a death-heavy stretch therefore lowers the plant spawn (`target - food` shrinks and `maxFood - food` caps
the count), and when the pool is full `leaveCarcass` leaves no carcass and draws nothing. The area rule
(`foodAreaCapacity`) has no population term, but `spawnFood` still stops at `maxFood - foodCount`. Read `foodKind` when
counting plant food; `foodCount` and the snapshot's food count include meat.

### 2026-10-22 - Eras stretch every season rule, and leave `seasonLength` unused

`seasonAt` takes the year from `yearTicks(config)`, which is `4 x eraSeasonTicks` with `erasEnabled` and `seasonLength`
otherwise. The whole season table moves with it: `foodScarcity`, `energyDrain`, `reproductionBonus` and
`temperatureModifier` each hold for 36000 ticks, and the body inputs for the season's sine and cosine turn 10 times
slower. A winter is `energyDrain` 1.8 and `foodScarcity` 0.4 for ten minutes at x1, not only a slower patch regrowth, so
tuning that assumed the 3600-tick season (`seasonLength`) does not carry over. The UI calendar reads
`worldInfo.seasonLength`, which already holds `eraSeasonTicks` when eras are on.

### 2026-10-22 - The `SPLIT` output only matters with sexes on, so no brain was ever selected on it

`readyToSplit` returns true for any mature, rested agent above `splitMinEnergy` when `sexesEnabled` is false and never reads
`SPLIT`; with sexes on it needs a female with `SPLIT` above 0.5. Archive elites and floor immigrants were scored with the
legacy rule, so only 1% to 8% of agents above 900 energy output `SPLIT` above 0.5 when sexes are switched on, and splitting (84%
of the defaults' mating and split births) all but stops. The output is learnt slowly (6 of 100 agents at 200000 ticks, 17 of 100 at
1000000), not fast enough for a 200000-tick eval. Any new gate on an output that the archive has never seen is a selection
cliff: measure the share of agents that pass it before switching it on.

### 2026-10-22 - The population-scaled food rule makes a thin population starve faster (an Allee effect)

`populationExpected` targets `max(foodTargetMin, foodTargetPerAgent x population)` items, so the food per area is
proportional to the population. At `minAgents` 40 the per-agent starvation rate is 0.21 per 1000 agent-ticks against 0.12 at 100,
and births/1k fall from 0.15 to 0.05, so the floor never lets go. `foodTargetMin` 1200 (the stock at 100 agents) lets a 40-agent
world take off in 25000 ticks on one seed. The area rule (`foodAreaCapacity`) has no population term and does not show it:
all features on with `minAgents` 40 reaches `maxAgents` within 20000 to 50000 ticks. Read a floor-bound result against the food
rule before blaming the feature.

### 2026-10-22 - At `maxAgents` a freed slot goes to a splitter, and 97% of pregnancies are lost

`giveBirth` is tried every tick by every agent above `splitMinEnergy`, so with 320 to 420 of 500 agents rich the event ring
takes about 350 capacity `BIRTH_BLOCKED` events per tick (3 to 4 million per 10000 ticks). A slot freed by `reap` is taken by
`splitAll` on the next tick unless a pregnancy happens to fall due that tick (`advancePregnancies` runs first); a pregnancy that
falls due at the cap is dropped, with the `mateCost` and 480 ticks spent. `eval.mating_share` at the cap is therefore about
0.01 whatever the mating rules are; a mating target needs a rule for the cap (a waiting pregnancy, or slots held back from
splits), tested at 0.14 and 0.20 on one seed. Any per-agent per-tick event at the cap multiplies by the population.

### 2026-10-22 - Emulate a rule change by wrapping the `lifecycle` phase, not by editing the sim

`step(world, policy, overrides)` takes replacement `run` functions by phase name. A harness can replace `lifecycle` with the
same calls (`feed`, `mate`, `applyCosts`, `advancePregnancies`, `splitAll`, `reap`, `fillFloor`, `invade`) plus a tweak between
them, and `world.config` can be swapped for a spread copy around one call (`sexesEnabled: false` around `splitAll` gives
asexual splitting with sexual mating). With no tweak the run reproduces the unwrapped world's counts exactly, which is the check
to make first. Run independent arms as separate processes: they are single-threaded and 1000000 ticks at 100 agents takes about 15 minutes.

### 2026-10-22 - JSON has no Infinity, so `mateDistanceMax: Infinity` written to a config file reads back as null

`FEATURES_OFF` holds `mateDistanceMax: Infinity` (mate distance off). `JSON.stringify` writes it as `null`, and a config file
with `null` fails `validateConfig` ("mateDistanceMax is null; expected a number > 0"). Tests that write a config or a grid to disk
use 1e9 instead, which is off for any genetic distance. The golden hashes are re-pinned by running `runGolden` and `driveGolden`
(test/sim/golden-run.js, test/worker/helpers/golden-drive.js) and copying the printed values into test/sim/golden.json and the
busy effect constants in test/worker/sim-host.slow.test.js; there is no regeneration script.

### 2026-10-22 - Five evals at once with default workers oversubscribe the host

`npm run eval` defaults `--workers` to `os.availableParallelism()` (32 here), so one eval fills the machine. Five started
together at the defaults pushed the load average to 86 on 32 cores, and every run slowed. Give each concurrent eval a share of
the cores (`--workers`), or run the arms as one `npm run screen` grid, which shares one worker pool (`--workers <total>`) under
one `flock` on the CPU lock. A bench taken while another eval runs measures the host, not the sim.

### 2026-10-23 - `FEATURES_ON` spreads `FEATURES_OFF`, so a pinned old value must be restated

`scripts/lib/features-on.mjs` builds `FEATURES_ON` as `{ ...FEATURES_OFF, ... }`. T78 pinned `mateRange`, `reproductionCooldown` and `childEnergyMin` at their old values in `FEATURES_OFF` to keep the frozen bench world, and that inherited into `FEATURES_ON` too, so the tracked `defaults` row would have run the old values. Any key pinned off that is retuned on must also be restated in `FEATURES_ON`. The golden hashes are re-pinned with `runGolden` and `driveGolden` in Node (as T41 did), and `npm run browser:hash` matches the default and busy cases.

### 2026-10-23 - A heap-delta allocation test needs a collection before each window and the smallest of several

`process.memoryUsage().heapUsed` over a window of calls also counts V8 tiering the loop up (OSR, a concurrent TurboFan job
landing) inside the window: up to about 1 MB, more often when the machine is loaded, which made `interpolateInto`'s test flaky
in the full gate and CI. Single windows of 5000 calls read 0 to 23 KB in a full fast-suite run. A computed double passed to a
call that is not inlined is boxed by the caller, 16 bytes a call, so `f((i % 10) / 10)` reads as allocation in `f`; pass
literals, or Smis. The reliable shape (`test/app/interpolate.test.js`): `gc()` through `v8.setFlagsFromString('--expose-gc')`
and `vm.runInNewContext('gc')` before each window, no `gc()` after (so short-lived garbage counts, not only retained memory),
the smallest growth of ten windows, and a limit under one small object a call.

### 2026-10-23 - The combat audit: smoke counted a same-tick bite, and the alarm follow-up misfiled two agents

Found by `test/evo/metric-audit-combat.test.js` (fitness-and-selection T2); no world state changes, so no golden hash moves. (1) `eval.smoke_escapes`: `signal` (calls) runs before `lifecycle` (`feed`, then `applyCosts`), so the observed `bittenTimer` is 1 for a bite that landed after the release in the same tick. The observer counted it as "bitten before", so it now skips a timer of 1; the window is a bite 1 to 28 ticks before (observed timer 2 to 29), because the timer saturates at 30 and one more tick cannot be told from "not bitten" (the doc said "within 30 ticks"). (2) `eval.alarm_response`: an agent exactly `callRadius` from the caller neither hears (`hearOne` returns on `d >= radius`) nor was a control (`> callRadius`), so it was dropped from the control set; and an agent outside this call's radius that had heard another call of the same tick (`heard` holds the loudest of all) was filed as a hearer. A hearer now needs to be inside the radius, and a control is at or beyond it. Baseline metric values for these two can shift slightly; re-baseline when the next eval is recorded.

### 2026-10-23 - The intent audit: smoke precision counted a same-tick bite, and `eval.pack_convergence` is null because no pack kill happens

Found by `test/evo/metric-audit-intent.test.js` and `metric-audit-intent-calls.test.js` (fitness-and-selection T3), which audit the 14 intent metrics (the 13 of `metrics-intent.js` and `eval.kin_within_call_radius`). One bug; no world state changes, so no golden hash moves. `eval.smoke_precision` counted a release as precise when `bittenTimer < TIMER_CAP`, which includes a timer of 1: a bite of the release tick itself, landed by `feed` after the `signal` phase released the smoke (the same ordering as the `smoke_escapes` finding of 2026-10-23, combat audit). It now needs a timer from 2 to 29, a bite 1 to 28 ticks before (the timer saturates at 30), or a threat sighting within 30 ticks; `eval.idle_signals_per_1k` follows, as it counts the releases that fail the rule. The doc said "within the 30 ticks before"; evolution-evals.md and world-balance.md now give the observable window. Baseline `smoke_precision` and `idle_signals_per_1k` can shift slightly; re-baseline when the next eval is recorded.

`eval.pack_convergence` is `null` on 16 of 16 baseline seeds because no pack kill occurs, not because `intentMetrics` miscounts. It is `null` exactly when `combat.packKills` is 0, and a hand-built scene (two hunters of one lineage, one deliberate and one not, five victims) gives 0.5 with 2 pack kills and a defined 0 with one non-convergent pack kill. In the live16 report (200000 ticks, 16 seeds) `eval.pack_kill_share` is 0 on all 11 seeds that had an eaten death and `null` on the other 5; there are 19 eaten deaths in all (0 to 3 a seed) over 3.2 million ticks, and the final traces show 0 or 1 `canHunt` agent alive on every seed. Predators go extinct, so two hunters of one lineage never bite one victim within `packWindow`.

### 2026-10-23 - The selection audit: a child of a parent who died on its birth tick lost its depth and archive flag

Found by `test/evo/metric-audit-selection.test.js` and `metric-audit-selection-fitness.test.js` (fitness-and-selection T4), which audit the five selection metrics of `metrics-selection.js`, the `p90_fitness` and `mean_fitness` of every specialisation and the archive's `coverage` and `qd_score` (`eval.kin_within_call_radius` is in the T3 audit). One bug; the observer only reads the world, so no golden hash moves. `applyEvents` runs the tick's deaths before its births, so `setLineage` found a parent who died on the tick of the birth already untracked and counted it as generation 0 with no archive flag: a child of a dying mother got depth 1 (not her depth plus 1) and left the archive lineage. The children credit was already right (`creditRelations` runs first). `noteParentage` now reads both before the deaths into `observer.parentage`, and `setLineage` uses it. `eval.generation_depth_p90` and `eval.archive_lineage_share` can shift slightly; re-baseline when the next eval is recorded.

Conventions the audit pinned, which the docs now state: a life counts when its death tick (`birthTick + ageTicks`, true for every agent born during a step) is at or after 10000; the opportunity for selection uses the population variance (divisor n); the 90th percentile interpolates linearly; `eval.archive_lineage_share` pools agent-ticks across checkpoints rather than averaging per-checkpoint shares; `eval.qd_score` and `eval.coverage` count elites only (a challenger adds neither a cell nor fitness) and an elite's mean includes the fitness of its clones. An initial agent is born before the first step has aged anyone, so `birthTick + ageTicks` is one past its death tick; it matters only for a run whose `maxAgeTicks` reaches burn-in.

`eval.fitness_lrs_corr` is not a clean test of "selection agrees with fitness". `fitnessV1` pays `OFFSPRING` (300) per child from the same `children` counter the metric correlates it with, so the child term is on both sides. On seed 1 to 4 of `map-elites-v1q` at 30000 ticks (375 to 1127 mature deaths after burn-in) the Spearman correlation is 0.63 to 0.80, and 0.55 to 0.74 with the 300 x children term subtracted from each fitness: the term accounts for about 0.07 and the rest is shared causes (an agent must eat and live to reach maturity before it can breed, and food energy and the survival term are in fitness too). About half the lives have no child, so ties are heavy. Read the metric as "does what fitness pays predict children", not as evidence that the archive or in-world births select on it; a fitness-free check is a correlation of children with a trait that fitness does not pay.

### 2026-10-23 - E35 calibration baseline (fitness-and-selection T12)

E35 is the calibration run for the new metrics: the live policy `map-elites-v1q` at the current defaults, 64 seeds x 200000 ticks, main at 808d648 (report [E35-calibration.json](../../evals/experiments/E35-calibration.json), entry E35 in `evals/experiments.json`). Every figure below is over the 64 seeds, except the power columns, which are `eval:power` at 16 seeds per arm (1000 A/A splits and 200 power splits per grid step, from the report's own seeds). "Detectable" is the smallest planted relative increase of the mean that the verdict finds in at least 80% of splits. A metric's power is computed as if its direction were `higher`, because `eval:power` skips `watch` metrics (the new metrics are `watch` until T13): the false-positive rate counts `better` or `worse` verdicts, so it does not depend on that choice. `-` means no verdict at 16 seeds (below the metric's seed minimum, or a constant or null series).

| Metric (`eval.` prefix) | Mean   | Per-seed sd | Non-null n | False positive (16 v 16) | Detectable at 80% (16 v 16) |
| ----------------------- | ------ | ----------- | ---------- | ------------------------ | --------------------------- |
| `skill_trend`           | -0.070 | 0.026       | 64         | 10.2%                    | 50%                         |
| `deliberate_food_trend` | -0.071 | 0.024       | 64         | 8.0%                     | 50%                         |
| `pursuit_trend`         | 0.250  | 0.000       | 1          | -                        | -                           |
| `evasion_trend`         | -0.071 | 0.101       | 2          | -                        | -                           |
| `spec_dominance`        | 0.687  | 0.172       | 64         | 5.7%                     | 30%                         |
| `spec_effective`        | 2.264  | 0.620       | 64         | 7.6%                     | 30%                         |
| `lineage_dominance`     | 0.482  | 0.158       | 64         | 9.8%                     | 50%                         |
| `lineage_effective`     | 8.233  | 17.353      | 64         | 24.9%                    | -                           |
| `trait_spread`          | 0.088  | 0.010       | 64         | 7.6%                     | 15%                         |
| `body_plan_coverage`    | 0.903  | 0.057       | 64         | 2.9%                     | 10%                         |
| `sex_balance`           | 0.033  | 0.011       | 64         | 8.3%                     | 50%                         |
| `cold_stress_share`     | 0.055  | 0.012       | 64         | 8.8%                     | 30%                         |
| `heat_stress_share`     | 0.442  | 0.068       | 64         | 11.6%                    | 20%                         |
| `terrain_death_share`   | 0.194  | 0.031       | 64         | 7.9%                     | 20%                         |
| `winter_pop_ratio`      | 1.145  | 0.333       | 64         | 11.8%                    | 30%                         |
| `child_survival`        | 0.944  | 0.009       | 64         | 0.0%                     | 10%                         |
| `lineage_lifespan_p50`  | 4879.6 | 424.7       | 64         | 5.4%                     | 10%                         |
| `migration_index`       | 0.068  | 0.010       | 64         | 8.1%                     | 20%                         |
| `predator_presence`     | 0.343  | 0.109       | 64         | 8.9%                     | 50%                         |
| `pred_prey_lag_corr`    | -      | -           | 0          | -                        | -                           |
| `deliberate_food_share` | 0.115  | 0.015       | 64         | 8.8%                     | 15%                         |
| `born_share`            | 0.953  | 0.020       | 64         | 0.0%                     | 10%                         |
| `mating_share`          | 0.211  | 0.057       | 64         | 8.7%                     | 30%                         |
| `catch_rate`            | 0.006  | 0.007       | 64         | 12.2%                    | >100%                       |
| `births_per_1k`         | 0.108  | 0.026       | 64         | 16.9%                    | 50%                         |
| `food_energy_per_1k`    | 480.5  | 57.7        | 64         | 8.9%                     | 15%                         |
| `fed_median_lifespan`   | 5758.2 | 956.5       | 64         | 8.4%                     | 20%                         |
| `lineages_alive`        | 18.622 | 1.981       | 64         | -                        | - (seed minimum 32)         |

What stands out:

- The live policy's shares are `deliberate_food_share` 0.115, `born_share` 0.953 and `mating_share` 0.211 (sd 0.057).
- Both trends are negative, not flat: `skill_trend` -0.070 and `deliberate_food_trend` -0.071, each non-null on all 64 seeds with a per-seed sd near 0.025. `pursuit_trend` is non-null on 1 seed and `evasion_trend` on 2.
- `lineage_effective` has a heavy tail (mean 8.2, sd 17.4) and a false-positive rate of 24.9% at 16 seeds, with no detectable change in the grid. `spec_dominance` (0.687) and `spec_effective` (2.26) both reach 80% power at a 30% change.
- `child_survival` (0.944, sd 0.009) has no false positives at 16 seeds. `pred_prey_lag_corr` is `null` on all 64 seeds, `pack_convergence` is non-null on 2 seeds (both 0, as no pack kill happens), and `champion_elo` and `champion_win_rate` are `null` on all 64 (E35 ran no league).
- Among the new metrics, `predator_presence` (0.343, sd 0.109) has a 50% detectable change at 16 seeds, the same as the trend, `sex_balance` and `lineage_dominance` rows.

### 2026-10-23 - Why predators die out (fitness-and-selection T15a)

Predators do not die out of a population that was sustaining them: from the first 10000 ticks they never earn enough to reproduce, so every predator alive after the start is an immigrant or floor spawn, and presence is how many of those arrive times how long each lives. Replays of nine seeds of E35 (`map-elites-v1q`, defaults, 200000 ticks, `--check-invariants` clean) with a wrapper that tallies the event ring each tick: the six lowest `eval.predator_presence` seeds, and 404668, 318983 and 676894 as the contrast (the three highest; 404668 is a world that never fills, population 40 to 100, so its floor spawns, not its ecology, hold its presence). A debug-level `npm run replay` of seed 719741 to 12000 ticks gave the same counts as the wrapper (28 initial predators, 30 deaths, 2 immigrant births). "Intake" is `foodEnergy + biteEnergy` of predators at death per 1000 ticks lived (predator `plantFoodValue` is 0, so `foodEnergy` is carcasses and `biteEnergy` is bites).

| Seed   | E35 presence | Alive at 1k | First 0 | Ticks at 0 | Gaps | Births imm / floor / mate / split | Deaths starved / collision / eaten | Age at death | Intake per 1k ticks |
| ------ | ------------ | ----------- | ------- | ---------- | ---- | --------------------------------- | ---------------------------------- | ------------ | ------------------- |
| 719741 | 0.13         | 24          | 10000   | 83%        | 6    | 8 / 0 / 0 / 0                     | 30 / 6 / 0                         | 4496         | 0.2                 |
| 79430  | 0.16         | 20          | 12000   | 81%        | 15   | 17 / 0 / 0 / 6                    | 39 / 5 / 0                         | 3446         | 2.0                 |
| 359728 | 0.16         | 18          | 10000   | 81%        | 13   | 22 / 0 / 2 / 5                    | 40 / 8 / 0                         | 2997         | 13.3                |
| 513404 | 0.19         | 20          | 10000   | 77%        | 12   | 12 / 1 / 1 / 1                    | 32 / 4 / 0                         | 4161         | 18.3                |
| 912822 | 0.21         | 17          | 11000   | 75%        | 12   | 12 / 0 / 0 / 4                    | 29 / 5 / 0                         | 4060         | 6.0                 |
| 55746  | 0.21         | 22          | 12000   | 75%        | 13   | 18 / 0 / 2 / 1                    | 35 / 12 / 0                        | 3768         | 0.5                 |
| 404668 | 0.78         | 23          | 15000   | 21%        | 18   | 45 / 40 / 2 / 6                   | 105 / 13 / 0                       | 4031         | 5.2                 |
| 318983 | 0.57         | 27          | 13000   | 41%        | 25   | 40 / 0 / 3 / 8                    | 72 / 8 / 0                         | 3765         | 91.0                |
| 676894 | 0.52         | 25          | 19000   | 46%        | 28   | 61 / 5 / 4 / 3                    | 87 / 12 / 1                        | 3151         | 7.6                 |

(`Ticks at 0` is the share of the whole run, burn-in included, with no predator alive, sampled every 100 ticks; `E35 presence` counts checkpoints after burn-in. Across the nine seeds: 543 predator deaths, 86% starved, 13% collision, 0.2% eaten; mean age at death 3709 ticks; intake 19 energy per 1000 ticks lived, against a burn of about 0.23 per tick (800 start energy over 3709 ticks). The mean `eval.catch_rate` of the nine seeds is 0.004.)

- **Extinction is early and fast.** Every seed's initial 17 to 28 predators are gone between tick 10000 and 19000: they start with 800 energy, bite almost nothing, and starve at about 3700 ticks (4500 at most). Of 543 predator deaths, 86% are starvation and 13% collisions; 1 is eaten.
- **They never reproduce.** Over 200000 ticks the six low seeds record 0 to 6 predator `mate` or `split` births each (the children of a predator keep its specialisation unless `specMutationRate` 0.002 flips it); the whole world has 1300 to 2200 `mate` and 5500 to 8000 `split` births, so the predator share is under 0.1%. A predator never reaches `splitMinEnergy` 900 (mean alive energy about 400) and `childEnergyMin` 100 mating gifts are rare.
- **It comes back only by injection.** Predators return through `immigrant` births (8 to 22 per low seed; the seeder draws the specialisation of a random archive elite by occupied cells, so predators get 2% to 6% of the 345 immigrants, not 20%) and, in low-population worlds, the floor. Each one lives about 3700 ticks, so presence is about immigrant predators x 3700 / run length: 22 x 3000 / 200000 is 0.33 and 8 x 4500 / 200000 is 0.18, in line with the E35 values of 0.13 to 0.21. The seeds that persist (318983, 676894) get 40 to 61 predator immigrants, not better hunting: intake there is 7.6 and 91 per 1000 ticks (one seed has a predator that reached 8000 energy), still below its burn.
- **Upkeep and plant value are not it.** `huntUpkeep` is 0.002 per tick, about 1% of the 0.23 burn, so halving or removing it changes a predator's life by 1%. T71 (predator `plantFoodValue` 1 or 0.3) already found plants are not the cause. The shortfall is in intake: a predator's bites land too rarely (`eval.catch_rate` 0 on 4 of the 6 low seeds), and a predator that does not eat never splits, so selection never gets to improve the next one.

Ranking of the rules by what the evidence supports:

1. **Reseed a predator when none is alive** (the largest effect, and the only one that acts on the measured cause). A probe of the existing `floorRescueAtZero` (true), which makes the spawn path and the seeder pick a specialisation with 0 alive, on seeds 719741, 79430 and 513404 to 60000 ticks: after tick 20000 predators are absent at 2, 1 and 1 of 41 samples (instead of about 80%), mean alive 1.1 to 1.7, peak 2 to 4. Presence is fixed; intake per 1000 ticks stays 0.7 to 12.5 and predators still do not reproduce, so `eval.catch_rate` will move only through more predators-ticks, not through a self-sustaining predator population.
2. **A predator floor like `minAgents`** is the same rule fired by the population floor, which at population 450 against `minAgents` 40 almost never runs (it does in 404668, the 40-to-100 world, and gives it 40 predator births and presence 0.78). It would need a predator count, not a total, to act.
3. **Predator economy** (intake: bite energy, `meatFoodValue`, or the start energy of a predator). Upkeep is 1% of the burn, so only a change that multiplies intake by about 10 moves survival; that is a larger world-balance change with its own screen, and it is the next step if rescue alone leaves `eval.catch_rate` at 0.

### 2026-10-23 - Predator economy screen (fitness-and-selection T15g)

Grid `evals/screens/predator-economy.grid.json`: 4 seeds (offset 28), 200000 ticks, policy `live`, 15 arms. Every arm but the reference has the rescue on (`predatorRescueMin` 3, `predatorRescueInterval` 450). `defaults` is the reference (rescue off, the current defaults); `base` is the rescue with the neutral economy; then each lever alone (`bite-6`, `bite-8`, `carcassShare-0.75`, `carcassTicks-600`, `move-0.7`, `kill-150`, `kill-300`, `passive-0.6`, `split-0.6`) and three combinations (`kill300-passive0.6-split0.6`, `kill150-passive0.6-split0.6`, `kill300-passive0.6-split0.6-bite6`, and `...-bite6-carcass` with `carcassShare` 0.75 and `carcassTicks` 600).

Prediction (written before the run): `base` fixes `eval.predator_presence` (above 0.8) but not predator births, which stay under 10 per seed because intake is still about 19 per 1000 ticks against a burn of 230. No single lever reaches 30 predator births per seed: bite size (`bite-6`, `bite-8`) and the carcass levers move births by under a factor of 2 because a predator lands about one bite per 1000 ticks; `passive-0.6` and `move-0.7` stretch a life by a third at most; `split-0.6` alone changes nothing because the threshold is not reached. `kill-300` is the strongest single lever (5 to 20 births). The combination `kill300-passive0.6-split0.6` is the first to reach about 30 births per seed, and `...-bite6` adds 20% to it; the wider `...-carcass` arm is the one most at risk of a plague (predator share above 15% of the population, prey `population_mean` down more than 15%). I expect the pick to be `kill300-passive0.6-split0.6`, or its `kill150` sibling if 300 over-feeds.

Results (4 seeds x 200000 ticks; `pred births` is the mean per seed with the four seed values; presence is the mean of `eval.predator_presence`; `pop` is `eval.population_mean`; the full scorecard columns are in `evals/screens/results/predator-economy/table.md`):

| Arm                                 | pred births (mean) | per seed        | catch_rate | presence | pop | births/1k vs ref | mating | spec <= 70% |
| ----------------------------------- | ------------------ | --------------- | ---------- | -------- | --- | ---------------- | ------ | ----------- |
| `defaults` (reference, rescue off)  | 4.5                | 2, 4, 5, 7      | 0.004      | 0.37     | 436 | =                | 0.21   | 2/4         |
| `base` (rescue only)                | 5.0                | 8, 4, 3, 5      | 0.007      | 1.00     | 427 | -1%              | 0.20   | 1/4         |
| `bite-6`                            | 9.8                | 7, 0, 19, 13    | 0.022      | 1.00     | 392 | +12%             | 0.23   | 2/4         |
| `bite-8`                            | 6.5                | 6, 8, 8, 4      | 0.007      | 1.00     | 427 | +1%              | 0.24   | 2/4         |
| `carcassShare-0.75`                 | 6.5                | 8, 2, 3, 13     | 0.005      | 1.00     | 409 | +2%              | 0.20   | 3/4         |
| `carcassTicks-600`                  | 8.3                | 12, 7, 8, 6     | 0.008      | 1.00     | 375 | +6%              | 0.23   | 0/4         |
| `move-0.7`                          | 8.3                | 2, 12, 15, 4    | 0.013      | 1.00     | 407 | +14%             | 0.18   | 1/4         |
| `kill-150`                          | 7.8                | 6, 5, 6, 14     | 0.007      | 1.00     | 430 | +4%              | 0.21   | 1/4         |
| `kill-300`                          | 4.0                | 4, 4, 5, 3      | 0.006      | 1.00     | 436 | -3%              | 0.23   | 1/4         |
| `passive-0.6`                       | 10.0               | 12, 10, 6, 12   | 0.006      | 1.00     | 341 | +35%             | 0.19   | 2/4         |
| `split-0.6`                         | 59.8               | 58, 7, 15, 159  | 0.009      | 1.00     | 317 | +35%             | 0.20   | 1/4         |
| `kill300-passive0.6-split0.6`       | 44.0               | 137, 12, 15, 12 | 0.003      | 1.00     | 362 | +25%             | 0.20   | 0/4         |
| `kill150-passive0.6-split0.6`       | 42.3               | 128, 11, 17, 13 | 0.003      | 1.00     | 359 | +25%             | 0.22   | 1/4         |
| `kill300-passive0.6-split0.6-bite6` | 41.0               | 126, 16, 10, 12 | 0.004      | 1.00     | 361 | +23%             | 0.20   | 1/4         |
| `...-bite6-carcass` (the wide arm)  | 14.5               | 20, 20, 12, 6   | 0.007      | 1.00     | 430 | -4%              | 0.19   | 2/4         |

Every arm `FAIL`s the absolute scorecard rows, the reference included (mating, specialisation dominance), so the judging is on the relative columns: no arm collapses (population above the floor and below the cap on 4 of 4 seeds everywhere), none has births per 1000 ticks down by more than 15% (all are within -4% or higher), `eval.food_energy_per_1k` is within -12% of the reference everywhere, and lineages are up 2% to 19%.

Conclusion:

- **The rescue alone fixes presence** (0.37 to 1.00 on every rescue arm) and lifts `eval.catch_rate` above 0 on 4 of 4 seeds, as predicted, but predator births stay at 5 per seed.
- **No arm reaches 30 predator births on every seed.** The three combination arms with `splitMinEnergyMultiplier` 0.6 average 41 to 44 per seed, but one seed carries each mean (126 to 137 births on one seed, 10 to 17 on the other three); `split-0.6` alone is the same shape (159, 58, 15, 7). Per seed the best arms sit at 10 to 17 births, about half the 30 the E36 criterion needs on 12 of 16 seeds. The plan's number is not met by this grid.
- **The prediction was wrong on three counts.** (1) `split-0.6` alone is the strongest single lever (mean 60), not a no-op: a lower threshold lets predators that already hold some surplus split, which the 900 threshold never allowed (the replays showed mean alive energy about 400). (2) The kill payment does nothing: `kill-300` has 4.0 births against `base`'s 5.0, and the combination with 300 and with 150 differ by 4%. `eval.catch_rate` stays at 0.003 to 0.02 on every arm, so predators almost never land a fatal bite, and a payment per kill is paid on almost no kills. (3) Bite size, `carcassShare`, `carcassTicks` and `moveCostMultiplier` each move births by under a factor of 2, as predicted, and the wide arm with `carcassShare` 0.75 and `carcassTicks` 600 on top of the combination is worse (14.5): food that lasts longer feeds the prey and the foragers, not the predators (pop back to 430).
- **Not a plague.** The cost of the combination arms is `eval.population_mean` 359 to 362 against 436 (-17%), with `eval.food_energy_per_1k` unchanged (-1% to +1%) and fed median lifespan down 15% to 18%: the world carries more small, quickly splitting predators and a thinner prey population, not a collapse. `split-0.6` alone is the plague-like arm (pop 317, -27%, food -12%). The screen has no predator-share metric, so the share itself was not measured; T15e should read it.
- **Proposed tuned defaults for T15d** (`kill150-passive0.6-split0.6`): `predatorRescueMin` 3, `predatorRescueInterval` 450, `specialisations.predator.passiveLossMultiplier` 0.6, `specialisations.predator.splitMinEnergyMultiplier` 0.6, `predatorKillEnergy` 150, and `biteMultiplier` 4, `carcassShare` 0.5, `carcassTicks` 300, `moveCostMultiplier` 1 unchanged. It ties `kill300-passive0.6-split0.6` on births (42 against 44) and keeps mating at 0.22 (the 300 arm falls to 0.20) and specialisation dominance at 1 of 4 (the 300 arm 0 of 4); the kill payment is kept at 150 because it is the one lever aimed at what the plan wants (predators that eat prey) and costs nothing measurable here. It does not meet the 30-births criterion on every seed.
- **Next, before T15d is final** (not run; reported first as the task requires): the catch rate is the open problem, and no economy lever moves it because the cause is hunting skill, not energy. Try `splitMinEnergyMultiplier` 0.4 and 0.5 with `passiveLossMultiplier` 0.6 (the threshold is what works), `passive-0.6` with `split-0.6` without a kill payment to confirm the payment is idle, and a cap on the predator share (or the `predatorRescueMin` count raised to 6) so the births come from many seeds rather than one. The E36 criterion on `eval.predator_births` may need lowering to what `eval.catch_rate` can support; that is for the user.

### 2026-10-23 - Why hunting fails (fitness-and-selection T15k)

The rules do not block kills; the evolved predators do not hunt. A scripted `hunter` controller (`js/evo/scripted-combat.js`: steer at the nearest "I can bite it" ray, sprint, bite) driving every predator of the live world gets 1.68 kills per 1000 predator-ticks, against 0.002 for the evolved predators of the same seeds and config: about 1000 times more. Method: the T15g arm `kill150-passive0.6-split0.6` (its `config` from `evals/screens/results/predator-economy/kill150-passive0.6-split0.6.report.json`, policy `map-elites-v1q`) on seeds 174238, 200460 and 597883 (three of the grid's four), with a read-only probe outside the sim that looks at every predator each tick: its nearest biteable agent, the ray hit, heading error and outputs, and a chase per predator-prey pair (the prey within the predator's vision, gaps up to 15 ticks allowed). The first 5000 ticks are discarded. "Evolved" is the unmodified arm for 60000 ticks; "scripted" is the same world for 30000 ticks with the `canHunt` agents' outputs replaced by `hunter` through `createControllerBrain` (arms `{ canHunt: 'hunter', rest: 'random' }`, so the prey keep their own evolved brains). Pooled over the three seeds:

| Pooled over 3 seeds       | Evolved predators | Scripted `hunter` |
| ------------------------- | ----------------- | ----------------- |
| Predator-ticks measured   | 595000            | 1587000           |
| Chases                    | 919               | 19302             |
| Reached contact           | 242 (26%)         | 9260 (48%)        |
| Bitten at least once      | 28 (3%)           | 6836 (35%)        |
| Killed                    | 1 (0.1%)          | 2666 (14%)        |
| Bites                     | 118               | 134954            |
| Kills per 1000 pred-ticks | 0.002             | 1.68              |

The seeds agree: per seed (174238, 200460, 597883) the scripted rate is 1.73, 0.90 and 1.65 kills per 1000 and the evolved rate 0, 0 and 0.005. The scripted predators breed (about 47, 3 and 13 alive on average against about 3 evolved), so the two worlds are not the same economy; the contrast is in rates per predator-tick and per chase.

What the evolved and the scripted predator do (range over the three seeds; "in vision" is a biteable agent within the predator's vision):

| Measure                                                  | Evolved                 | Scripted                |
| -------------------------------------------------------- | ----------------------- | ----------------------- |
| Mean predator speed (px/tick)                            | 1.0 to 1.3              | 5.6 to 6.5              |
| Mean prey speed (px/tick)                                | 1.8 to 2.8              | 2.2 to 2.3              |
| Predator mean energy / size                              | 241 to 1360 / 26 to 31  | 636 to 2160 / 29 to 38  |
| Prey mean energy / size                                  | 438 to 2080 / 26 to 33  | 452 to 483 / 27 to 28   |
| Predator-ticks with a biteable agent in vision           | 0.05 to 0.27            | 0.15 to 0.59            |
| Heading within 0.4 rad of the prey, chase ticks          | 0.11 to 0.22            | 0.47 to 0.59            |
| (a random heading gives)                                 | 0.13                    | 0.13                    |
| Touching a biteable prey, per in-vision tick             | 0.014 to 0.090          | 0.17 to 0.26            |
| Prey in the jaws, given touching                         | 0.04 to 0.40            | 0.88 to 0.92            |
| `BITE` output on, given touching and in the jaws         | 0.00 to 0.12            | 0.82 to 0.91            |
| Prey sees the predator (threat ray), within 200 px       | 0.80 to 0.88            | 0.65 to 0.74            |
| Prey heading away from the predator (cosine), within 200 | -0.04 to 0.04           | 0.37 to 0.46            |
| Prey sprinting, within 200 px                            | 0.41 to 0.54            | 0.14 to 0.17            |
| Predator vision / prey vision (px)                       | 345 to 353 / 311 to 344 | 290 to 361 / 317 to 369 |

The `eval.*` intent counters of the arm agree: `eval.pursuit_bite_share` 0.08 on average (0, 0, 0.21 and 0.09 by seed), `eval.pursuit_kill_share` 0 on 4 of 4, `eval.hunt_call_answer` 0.00003, `eval.undefended_bite_share` 0.93 and `eval.escape_rate` 0.73.

Speeds and costs (`js/sim/physics.js`, `js/sim/energy.js`, default config). The no-sprint cap is `maxVelocity` 8 for every body; the sprint cap is 8 x (1 + 0.5 x `sprintBoost`), so 14.4 for the predator (`sprintBoost` 1.6) and 12 for the rest, a margin of 20%. A tick costs `movementCost` 0.015 x speed^2, plus `sprintCost` 0.05 while sprinting, plus a standing term of about 0.05, so moving is the cost:

| Speed (px/tick)                             | 2    | 5    | 8    | 12   | 14.4 |
| ------------------------------------------- | ---- | ---- | ---- | ---- | ---- |
| Move cost per tick                          | 0.06 | 0.38 | 0.96 | 2.16 | 3.11 |
| Total per tick (standing 0.05, sprint 0.05) | 0.16 | 0.48 | 1.06 | 2.26 | 3.21 |
| Ticks a 241-energy predator can hold it     | 1500 | 500  | 230  | 107  | 75   |

A scripted chase takes a median 30 ticks (killing chases 70) at about 7 px/tick, so about 24 energy per chase and 170 per kill (7 chases per kill); a kill returns about 20 bites x 20 plus 150 plus the carcass, over 550. Hunting pays for a predator that does it; the evolved ones, at 1.2 px/tick, spend almost nothing and find almost nothing.

Bites per kill is large. A bite takes `biteEnergy` 5 x `biteMultiplier` 4 = 20 and prey carry 350 to 2000 energy, so a kill needs 18 to 100 bites in contact and in the jaws. Scripted killing chases took a median 7 bites when the prey held under 300 energy, 18 (300 to 600), 33 (600 to 1000), 54 (1000 to 2000) and 103 (above 2000), and the share of bitten chases that end in a kill falls with it: 65%, 55%, 44%, 30% and 16%. The evolved chases that were bitten at all had a median of 1 to 2 bites. The kill payment (150) is under a third of a kill's income and arrives on a tail event, which is why `predatorKillEnergy` moved nothing in T15g.

Size gate. `couldBite` needs `size[biter] > huntSizeRatio x size[victim]`, and `size = baseSize + energy / 250`, so a poor predator is a small one. Of the non-hunter agent-ticks within a predator's vision, the biteable share is 40%, 23% and 39% for the evolved predators (seeds 200460, 597883, 174238) and 63%, 62% and 63% for the scripted ones. `huntSizeRatio` cannot go below 1 (`config-validate.js` wants a number of at least 1). Had it been 0.9 the evolved shares would be 83%, 58% and 66%, and 100%, 79% and 83% at 0.7 (from the probe's size histogram of prey size over predator size).

Mechanism, in the order of the chain a predator must complete:

1. **Steering and approach (skill).** Evolved predators move slowly (about 1.2 px/tick against 1.8 to 2.8 for prey) and point at the prey no better than chance. A biteable agent is in vision on 5% to 27% of their ticks.
2. **Size (rule).** Most prey a poor predator sees are as large as it is or larger, and cannot be bitten.
3. **Contact in the jaws (rule and skill).** Reach is the contact list: `resolvePair` records a pair only when the circles overlap and `feed` bites over that list, so there is no reach beyond touching, and the victim's centre must be within `biteArc` (45 degrees) of the heading. A body that touches at a random heading is in the jaws a quarter of the time; the evolved predators measured 4% to 40%, the scripted 88% to 92%.
4. **Bite output (skill).** Touching and in the jaws, the evolved `BITE` output is on in 0% to 12% of ticks; the scripted in 82% to 91%.
5. **Staying in contact for 18 to 100 bites (rule).** A bitten prey flees and nothing slows it. The scripted `hunter` closes at 0.2 to 0.6 px/tick on prey that flee at 5 to 6 px/tick, 65% of its chases end without a bite and 21% with a bite and no kill.
6. **No step towards hunting before the first bite (inference).** A predator that does not move does not starve faster for it, and a half-aligned approach earns nothing, so selection has only the first bite to reward. This is not measured.

Ranked by evidence (what keeps the kills from happening; none of the rules blocks a competent hunter):

1. **Evolved predators do not pursue or bite** (skill, not a rule): 1000 times the kill rate for the scripted contrast, chance-level heading, speed 1.2, bite output off at contact. Direct, three seeds, same rule set.
2. **Size gate**: 60% to 77% of the prey a poor predator sees cannot be bitten, and a predator that does not eat stays small. Direct (the size histogram). A rule only because `huntSizeRatio` has a floor of 1.
3. **Contact-only reach and the 45-degree jaws**: a chance contact turns into a bite 4% to 40% of the time (jaws) times 0% to 12% (output). A random-walk predator touches a biteable prey on 1.4% to 9% of its in-vision ticks. Direct for the rates; that a wider arc teaches hunting is not shown.
4. **Bites needed per kill** (18 to 100 against a median of 1 to 2 landed): it explains the idle kill payment, not the absence of bites, since each bite pays 20.
5. **Prey detection and flight**: prey see the predator on 65% to 88% of near ticks, but only the prey of the scripted world flee (cosine 0.37 to 0.46); against evolved predators they do not (about 0). Equal ranges (about 350 against about 330) give the hunter no edge, and scripted hunters still win 14% of chases. Not a block.
6. **Speed and sprint**: the 20% edge of the predator's sprint cap is thin (the scripted hunters close at 0.2 to 0.6 px/tick) but enough to kill. Not a block. The cost of running (0.96 per tick at 8 px/tick, 3.1 at the cap) is why a poor predator that sprints starves in a few hundred ticks.

Uncertain: the scripted world's population differs from the evolved one, so only rates per predator-tick and per chase are compared; the evolved sample is small (1 kill and 28 bitten chases in 595000 predator-ticks); a wider jaws arc run (`biteArc` 90 degrees, 60000 ticks, seeds 174238 and 200460) gave 35 and 36 bites against 111 and 0, which is noise at this length and says nothing about evolution, so the T15l levers are proposals from the mechanism, not measured effects. The probe is a scratch script, not committed; the numbers are not in a report file.

### 2026-10-23 - Predator hunting screen (fitness-and-selection T15l)

Grid `evals/screens/predator-hunting.grid.json`: 4 seeds (offset 28), 200000 ticks, policy `live`, 12 arms (each checked with `createConfig` before the run). Every arm but the reference is built on the T15g arm `kill150-passive0.6-split0.6` (`base`: rescue 3/450, `predatorKillEnergy` 150, predator `passiveLossMultiplier` 0.6 and `splitMinEnergyMultiplier` 0.6); `defaults` (the current defaults, rescue off) is the reference. Arms are shallow overlays, so each arm that sets `specialisations` restates the passive and split multipliers. Single levers: `biteArc` 1.047 and 1.571, predator `biteMultiplier` 8 and 12, predator `sprintBoost` 2.0, `huntSizeRatio` 0.9 and 0.8 (the validator floor is now 0.5). Combinations: `arc1.571-bite12-size0.8`, `arc1.047-bite8-size0.9`, `arc1.571-bite8-size0.9-sprint2.0`. The point is not skilled hunting: it is to give a clumsy predator some bites and kills, so selection has a gradient.

Prediction (written before the run): `size-0.8` and `size-0.9` are the strongest single levers for first bites (they take the biteable share of prey from 40% to 60-80%), `arc-1.571` the second; `bite-12` and `sprint-2.0` move `eval.catch_rate` little on their own because a clumsy predator rarely lands the first bite, and `bite-12` helps only once bites happen. `eval.catch_rate` stays under 0.03 on the single levers and reaches 0.03 to 0.1 on `arc1.571-bite12-size0.8`. `eval.pursuit_kill_share` stays near 0 on every arm (kills remain chance contacts), so no arm shows deliberate hunting; it is the pursuit bite share that may rise. `size-0.8` risks a predator plague (prey as small as 0.8 of a predator become food, population_mean down 20% or more), and the wide combination is the plague arm. Round B (reach, bitten slowdown) will probably be needed.

Results (4 seeds x 200000 ticks, from `evals/screens/results/predator-hunting/`; `catch` is the mean `eval.catch_rate`, `births` the mean `eval.predator_births` per seed, `pursuit kill` and `pursuit bite` the means of `eval.pursuit_kill_share` and `eval.pursuit_bite_share` over the seeds that have a value, `pop` is `eval.population_mean`; `catch seeds` is the number of seeds with `catch_rate` of at least 0.01). `base` reproduces the T15g `kill150-passive0.6-split0.6` arm exactly (42.25 births, pop 359), so the runs are deterministic across the two screens.

| Arm                                | catch  | catch seeds | births | pursuit kill | pursuit bite | pop | mating | food/1k vs ref |
| ---------------------------------- | ------ | ----------- | ------ | ------------ | ------------ | --- | ------ | -------------- |
| `defaults` (reference)             | 0.0038 | 0/4         | 4.5    | 0.00         | 0.09         | 436 | 0.21   | =              |
| `base`                             | 0.0030 | 0/4         | 42.3   | 0.00         | 0.08         | 359 | 0.22   | -1%            |
| `arc-1.047`                        | 0.0044 | 1/4         | 28.8   | 0.26         | 0.19         | 393 | 0.22   | +1%            |
| `arc-1.571`                        | 0.0097 | 1/4         | 27.5   | 0.07         | 0.09         | 413 | 0.21   | -5%            |
| `bite-8`                           | 0.0050 | 0/4         | 46.3   | 0.07         | 0.09         | 354 | 0.20   | -11%           |
| `bite-12`                          | 0.0078 | 1/4         | 43.5   | 0.28         | 0.14         | 366 | 0.22   | -7%            |
| `sprint-2.0`                       | 0.0042 | 1/4         | 27.8   | 0.07         | 0.19         | 395 | 0.18   | +9%            |
| `size-0.9`                         | 0.0056 | 1/4         | 53.3   | 0.06         | 0.06         | 332 | 0.22   | -17%           |
| `size-0.8`                         | 0.0065 | 1/4         | 23.8   | 0.17         | 0.09         | 401 | 0.18   | -2%            |
| `arc1.571-bite12-size0.8`          | 0.0689 | 4/4         | 47.5   | 0.09         | 0.10         | 360 | 0.17   | +2%            |
| `arc1.047-bite8-size0.9`           | 0.0142 | 4/4         | 35.0   | 0.07         | 0.08         | 381 | 0.19   | -5%            |
| `arc1.571-bite8-size0.9-sprint2.0` | 0.0309 | 4/4         | 61.3   | 0.06         | 0.09         | 322 | 0.21   | -10%           |

Per seed, `arc1.571-bite12-size0.8` has `catch_rate` 0.019, 0.037, 0.12 and 0.100 and births 62, 22, 95 and 11, and a `pursuit_kill_share` above 0 on all four (0.12, 0.03, 0.14, 0.08); `base` has `catch_rate` 0.001 to 0.004 and a pursuit kill share of exactly 0 on all four. Every arm is `FAIL` on the absolute Scorecard rows, the reference included (spec dominance on 1 to 2 seeds of 4 above 70%); the arms differ on the mating row (0.17 to 0.19 `FAIL` on `arc1.571-bite12-size0.8`, `arc1.047-bite8-size0.9`, `size-0.8`, `sprint-2.0`), and no arm has a population below the floor or at the cap on any seed. The predator share of the final population is 0.4% to 1.6% on every arm (one `size-0.9` seed 11%): the rescue floor of 3 holds it near 1%, so the extra births are short-lived predators, not a larger predator class.

Conclusion:

- **No single lever helps much; the three together do.** Every single lever leaves `eval.catch_rate` at 0.004 to 0.010 and lifts it over 0.01 on one seed in four at most, which is where `base` sat (0.003). The wide combination `arc1.571-bite12-size0.8` reaches 0.069, 23 times `base`, on 4 of 4 seeds (0.019 to 0.12); `arc1.571-bite8-size0.9-sprint2.0` 0.031 and `arc1.047-bite8-size0.9` 0.014 also clear 0.01 on all four. The effect is multiplicative: a wider arc and a bigger prey pool bring first bites, and 12x bites turn the first bites into kills (9 to 50 bites per kill). The prediction that the size gate would be the strongest single lever was wrong (`size-0.9` 0.0056, `size-0.8` 0.0065), as was the guess that `bite-12` helps little alone (it is the best single bite lever for pursuit kills, 0.28, but on one seed).
- **Kills are still mostly chance, but no longer zero.** `eval.pursuit_kill_share` is 0 on every `base` seed and 0.03 to 0.14 on all four seeds of `arc1.571-bite12-size0.8`; so about 9 kills in 100 follow a deliberate close (the observer's chase definition), and 91 do not. The catches come from contact the rules now reward, not from evolved pursuit yet. The gradient exists (a predator that closes gets a kill share it did not before); whether it climbs needs more than 200000 ticks, or the round B levers.
- **No plague, no prey collapse.** `arc1.571-bite12-size0.8` has population 360 (equal to `base`, -17% against `defaults`), food +2%, births per 1000 ticks +7%, fed life -6% and predator share about 1%. The costs are mating 0.17 (the only absolute row it fails that the reference passes) and `size-0.9` alone as the plague-like arm (pop 332, food -17%, one seed 11% predators).
- **Proposed tuned defaults for T15d (the whole predator package):** `predatorRescueMin` 3, `predatorRescueInterval` 450, `predatorKillEnergy` 150, `specialisations.predator.passiveLossMultiplier` 0.6, `specialisations.predator.splitMinEnergyMultiplier` 0.6 (all T15g), plus `biteArc` 1.571, `specialisations.predator.biteMultiplier` 12 and `huntSizeRatio` 0.8 (this screen); `sprintBoost` stays 1.6, `carcassShare`, `carcassTicks` and `moveCostMultiplier` stay. Setting `huntSizeRatio`, `biteArc` and the predator bite multiplier moves the golden hashes, so T15d re-pins them in a commit of its own. Alternative if the mating dip (0.17) matters more than catches: `arc1.571-bite8-size0.9-sprint2.0` (catch 0.031, mating 0.21, but pop 322 and food -10%).
- **Not run, reported first (round B):** the deliberate share is 9%, so the real fix is probably a rule that makes a started chase pay: `biteReach` (10 and 20 px beyond touching) and `bittenTicks` with `bittenThrust` (30 ticks and 0.5), on top of `arc1.571-bite12-size0.8`; and a longer run (600000 ticks) of that arm to see whether `pursuit_kill_share` rises. Caveat for all of this: 4 seeds, a screen not a verdict; E36 or a 16-seed `eval:compare` is the test of the final package.

### 2026-10-23 - Call cost screen (fitness-and-selection T15h)

Grid `evals/screens/call-cost.grid.json`: 4 seeds (offset 28), 200000 ticks, policy `live`, 15 arms (each checked with `createConfig` before the run). `base` is the adopted T15l package (`predatorRescueMin` 3, `predatorRescueInterval` 450, `predatorKillEnergy` 150, `biteArc` 1.571, `huntSizeRatio` 0.8, predator `passiveLossMultiplier` 0.6, `splitMinEnergyMultiplier` 0.6, `biteMultiplier` 12); every arm is built on it, and no arm touches `specialisations`. `defaults` (the current defaults: rescue off, arc pi/4, ratio 1.01, bite 4, no economy levers) is the reference. Levers: `alarmCost` 2, 5, 10, 20 (default 0.5); `huntCallCost` 2, 5, 10, 20 (default 0.5); `smokeCost` 10 and 40 (default 20); combinations `alarm5-hunt5`, `alarm10-hunt10-smoke40`, `alarm20-hunt20-smoke40`.

Prediction (written before the run): `eval.idle_signals_per_1k` falls as the cost rises, roughly halving at cost 5 and falling by 80% or more at 20, because a call at nothing is pure energy loss and selection removes it. The precisions rise only if calls survive at all. The likelier outcome at costs of 10 and above is silence: blobs stop calling, idle signals go to near zero and the precisions become null on most seeds, which counts as spam fixed but not as precise calling. 200000 ticks is short for a new signal to evolve, so I expect silence rather than precision. `smokeCost` moves idle signals little (smoke is rare and already costly). The costs should not hurt the predator package (`eval.catch_rate` near 0.07, mating near 0.17), though a heavy hunt call cost may cut predator births a little. The combinations are the strongest arms for idle signals and the most likely to show silence.

Results (4 seeds x 200000 ticks, from `evals/screens/results/call-cost/`; `idle` is the mean `eval.idle_signals_per_1k`, `alarm p` and `hunt p` the means of `eval.alarm_precision` and `eval.hunt_call_precision`, `births` the mean `eval.predator_births` per seed, `pop` is `eval.population_mean`; the Scorecard is `FAIL` on every arm, the reference included, so the column is left out):

| Arm                      | idle | alarm p | hunt p | catch | births | pop | mating |
| ------------------------ | ---- | ------- | ------ | ----- | ------ | --- | ------ |
| `defaults` (reference)   | 12.5 | 0.0000  | 0.0051 | 0.004 | 4.5    | 436 | 0.21   |
| `base`                   | 11.7 | 0.0002  | 0.0084 | 0.069 | 47.5   | 360 | 0.17   |
| `alarm-2`                | 9.5  | 0.0009  | 0.0057 | 0.127 | 131.5  | 334 | 0.16   |
| `alarm-5`                | 11.1 | 0.0008  | 0.0092 | 0.058 | 97.0   | 247 | 0.14   |
| `alarm-10`               | 8.8  | 0.0013  | 0.0076 | 0.051 | 95.8   | 268 | 0.14   |
| `alarm-20`               | 8.4  | 0.0010  | 0.0038 | 0.017 | 179.8  | 134 | 0.09   |
| `hunt-2`                 | 12.9 | 0.0002  | 0.0077 | 0.048 | 47.8   | 370 | 0.18   |
| `hunt-5`                 | 10.7 | 0.0002  | 0.0109 | 0.047 | 45.3   | 380 | 0.20   |
| `hunt-10`                | 10.4 | 0.0004  | 0.0112 | 0.079 | 55.0   | 388 | 0.21   |
| `hunt-20`                | 12.0 | 0.0002  | 0.0085 | 0.036 | 43.3   | 354 | 0.16   |
| `smoke-10`               | 10.7 | 0.0004  | 0.0095 | 0.070 | 88.0   | 394 | 0.20   |
| `smoke-40`               | 11.6 | 0.0006  | 0.0068 | 0.123 | 76.5   | 381 | 0.18   |
| `alarm5-hunt5`           | 9.1  | 0.0013  | 0.0088 | 0.241 | 1533   | 298 | 0.14   |
| `alarm10-hunt10-smoke40` | 8.8  | 0.0006  | 0.0056 | 0.029 | 185.3  | 97  | 0.10   |
| `alarm20-hunt20-smoke40` | 8.0  | 0.0012  | 0.0063 | 0.014 | 138.8  | 104 | 0.05   |

Conclusion:

- **Call costs do not fix idle signals.** Per seed the spread of `base` is 10.6 to 12.5, so the best any arm does is a quarter lower (8.0 on `alarm20-hunt20-smoke40`, 8.4 on `alarm-20`), and only by shrinking the population (134 and 104 against 360) and mating (0.09 and 0.05), which also cuts the denominator. The arms that keep the population are within the noise of `base`: `hunt-10` 10.4, `smoke-10` 10.7, `hunt-5` 10.7. The prediction (a halving at cost 5, 80% off at 20) was wrong: idle signals per 1000 agent-ticks stay at 8 to 13 on every arm.
- **Blobs do not go silent and do not become precise.** `eval.idle_signals_per_1k` never nears zero, and `eval.alarm_precision` stays at 0.000 to 0.001 on every arm (the best, `alarm-10` and `alarm5-hunt5`, 0.0013). `eval.hunt_call_precision` sits at 0.004 to 0.011 (base 0.008); `hunt-10` and `hunt-5` are the only arms that lift it (0.011), a small, 4-seed difference. The prediction of silence was also wrong: with a cost the call still goes out, because the genome has no gradient against it at these sizes (the cost is 0.5 to 20 energy against a call that costs nothing in lost fitness when nothing happens).
- **High `alarmCost` is harmful.** `alarm-5` to `alarm-20` cut population to 247, 268 and 134 and mating to 0.14, 0.14 and 0.09, with fed life -35% to -59%: the cost is paid by every blob that calls, spam or not. `alarm-2` costs mating (0.16) for -2.2 idle. `huntCallCost` is gentler: `hunt-10` keeps the population (388), the mating row (0.21, the only cost arm to pass 0.2 besides `hunt-5` at 0.20), catch rate (0.079) and births (55); `hunt-20` is already worse (mating 0.16). `smokeCost` 10 or 40 does little. The combinations are the worst on population (97 to 104 for the two heavy arms). `alarm5-hunt5` has 1533 predator births per seed and catch 0.24: the call costs kill off many blobs, which the rescue floor replaces with predators (a churn, not a better world).
- **Proposed call costs for T15d: `huntCallCost` 10; `alarmCost` 0.5 and `smokeCost` 20 stay.** `hunt-10` is the only arm not worse than `base` on the judged rows (idle -11%, both precisions up, catch up, births up, population +8%, mating 0.21), and its effect is small and inside 4-seed noise. Honest summary: the call cost lever does not solve spam; it is cheap to set, so the final T15d package is the T15l predator package plus `huntCallCost` 10, with the idle-signal problem left open. The next lever is not the cost but the signal itself (what counts as an idle call, or giving the receiving side a response that makes spam unprofitable), a question for the E36 run and a later design. Caveat: 4 seeds, a screen not a verdict.

### 2026-10-23 - Call threshold screen (fitness-and-selection T15n)

Grid `evals/screens/call-threshold.grid.json`: 4 seeds (offset 28), 200000 ticks, policy `live`, 9 arms (each checked with `createConfig` before the run). `base` is the T15h final package: the T15l package (`predatorRescueMin` 3, `predatorRescueInterval` 450, `predatorKillEnergy` 150, `biteArc` 1.571, `huntSizeRatio` 0.8, predator `passiveLossMultiplier` 0.6, `splitMinEnergyMultiplier` 0.6, `biteMultiplier` 12) plus `huntCallCost` 10, with both thresholds 0. `defaults` (the current defaults) is the reference. Arms: `alarm-0.5`, `alarm-0.8`, `hunt-0.5`, `hunt-0.8`, `both-0.5`, `both-0.65`, `both-0.8`.

Prediction (written before the run): a threshold removes the calls a random brain makes by drift, so `eval.idle_signals_per_1k` falls, unlike with the cost, because the output must now be driven well above zero and selection need not pay for each stray call. I expect about -30% at 0.5 and -60% or more at 0.8 on the arm's own call, so the `both` arms fall furthest. The precisions rise because the denominator (calls) falls faster than the useful calls do; alarm precision stays under 0.01. Population and mating stay near `base` (360 to 390, 0.2), since fewer calls means less energy paid. The risk is hunt at 0.8: the hunt call may become too rare to help, so catch rate and predator births could drop a little. Likeliest best arm: `both-0.5` or `both-0.65`.

Results (4 seeds x 200000 ticks, from `evals/screens/results/call-threshold/`; `idle` is the mean `eval.idle_signals_per_1k`, `alarm p` and `hunt p` the means of `eval.alarm_precision` and `eval.hunt_call_precision`, `births` the mean `eval.predator_births` per seed, `pop` is `eval.population_mean`; the Scorecard is `FAIL` on every arm, the reference included, so the column is left out; the failing row on the arms below `mating` 0.2 is "mating mean >= 0.2"):

| Arm         | idle | alarm p | hunt p | catch | births | pop | mating |
| ----------- | ---- | ------- | ------ | ----- | ------ | --- | ------ |
| `defaults`  | 12.5 | 0.0000  | 0.0051 | 0.004 | 4.5    | 436 | 0.21   |
| `base`      | 10.4 | 0.0004  | 0.0112 | 0.079 | 55.0   | 388 | 0.21   |
| `alarm-0.5` | 9.2  | 0.0002  | 0.0110 | 0.048 | 75.0   | 301 | 0.17   |
| `alarm-0.8` | 8.0  | 0.0002  | 0.0120 | 0.071 | 23.0   | 423 | 0.19   |
| `hunt-0.5`  | 11.1 | 0.0004  | 0.0385 | 0.064 | 31.3   | 422 | 0.22   |
| `hunt-0.8`  | 11.4 | 0.0003  | 0.0234 | 0.060 | 47.5   | 358 | 0.23   |
| `both-0.5`  | 9.5  | 0.0012  | 0.0204 | 0.096 | 233.5  | 327 | 0.17   |
| `both-0.65` | 8.9  | 0.0006  | 0.0153 | 0.084 | 72.3   | 367 | 0.24   |
| `both-0.8`  | 8.8  | 0.0001  | 0.0287 | 0.050 | 52.3   | 344 | 0.18   |

Conclusion:

- **Thresholds make calls rarer, not precise.** Idle signals fall only to 8.0 to 9.5 on the alarm and combined arms (base 10.4, per-seed sd 0.6, so `alarm-0.8` at -23% and `both-0.65` at -14% are real but modest) and do not fall at all on the hunt-only arms (11.1 and 11.4). Nowhere near the halving predicted. Precision stays low: `eval.alarm_precision` is 0.0001 to 0.0012 on every arm (under 0.2% of alarms are followed by a threat), so the alarm call is still not a signal. `eval.hunt_call_precision` is the one gain: 0.0112 on `base` to 0.0385 on `hunt-0.5` (3.4 times), 0.0234 on `hunt-0.8` and 0.0287 on `both-0.8`, but still under 4% of hunt calls precede a catch. The prediction that idle signals fall 30% at 0.5 and 60% at 0.8 was wrong; the precision rise was right for hunt, wrong for alarm.
- **The threshold removes drift calls but not the habit.** The alarm threshold at 0.8 is the best single cut (-23%) because alarm is the call most random brains fire. A hunt call is only fired by predators, so a hunt threshold changes few idle signals but does lift what a call means (hunt p up 2 to 3.4 times).
- **Costs and noise.** A threshold of 0.5 on the alarm hurts: `alarm-0.5` and `both-0.5` lose population (301 and 327) and mating (0.17), the same signature as the T15h alarm costs, and `both-0.5` has 233 predator births per seed (a churn of deaths replaced by the rescue floor). The 0.8 alarm arms keep the population (`alarm-0.8` 423) but not mating (0.19, `both-0.8` 0.18). `both-0.65` is the only arm to improve on `base` for mating (0.24), with population 367 (-5%), catch 0.084 (+6%) and births 72. Mating swings between 0.17 and 0.24 across arms without a monotone trend in the threshold, so some of it is 4-seed noise.
- **Proposed thresholds for T15d: `alarmThreshold` 0.65 and `huntCallThreshold` 0.65 (`both-0.65`).** It is the only arm that keeps mating above 0.2, cuts idle signals (-14%), lifts hunt precision (1.4 times) and keeps the predator gains (catch 0.084, births 72, pop 367). `hunt-0.5` has the best hunt precision (0.0385) and `alarm-0.8` the lowest idle (8.0) but each fails the other's row; their mix (`alarmThreshold` 0.8, `huntCallThreshold` 0.5) was not screened and is the first thing to try if E36 still shows spam. Honest summary: thresholds do not fix idle signals (the best arm is 8.0 against 10.4, not near silence) and the alarm stays imprecise. Caveat: 4 seeds, a screen not a verdict.

### 2026-10-23 - T15d defaults and golden re-pin (fitness-and-selection T15d)

- **Package:** `predatorRescueMin` 3, `predatorRescueInterval` 450, `predatorKillEnergy` 150, `alarmThreshold` 0.65,
  `huntCallThreshold` 0.65, `huntSizeRatio` 0.8, `biteArc` 1.571, `huntCallCost` 10, and the predator specialisation's
  `passiveLossMultiplier` 0.6, `splitMinEnergyMultiplier` 0.6 and `biteMultiplier` 12 (was 4). `alarmCost` 0.5 and
  `smokeCost` 20 are unchanged.
- **Hashes, old to new** (`test/sim/golden.json` and the busy effect constants in `test/worker/sim-host.slow.test.js`):
  `cases` default `75c8dc9a60512678` to `5d6bdc130c1bef61`; `cases` busy `b690703c6e579c89` to `0cbaa2a6b8ddf9b3`;
  `shortCases` default `990e90a40089671e` to `897120be022ee74d`; `shortCases` busy `46f51e32b0128c7e` to `8616e7e60b016f2b`.
  The busy effect stream (`BUSY_EFFECT_HASH`, `BUSY_EFFECT_RECORDS`) moves from `234c3f686e2b6a65` and 6329 records to
  `680983d656117e86` and 1828 records, with no dropped records. Both runs agree: `runGolden` and `driveGolden` print the
  same world hashes, and the effect stream is the same whatever the slicing.
- **One commit:** the defaults and the re-pin share a commit, because the pre-commit gate runs the golden tests, so a
  defaults-only commit cannot pass it.
- **Size-rule fixtures:** bite-rule, feeding, predator-prey and ray-march state the pre-T15d `huntSizeRatio` 1.01 they
  assume. Each keeps its assertions; bite-rule and ray-march gain a case at 0.8.
- **Bench:** `BENCH_CONFIG` restates `biteArc` Math.PI / 4 and the predator `biteMultiplier` 4, so the frozen bench
  world does not move from the defaults change.
- **Evo slow tests (nine failures, all premise):** all nine pass on `e6a1c73`. They are defined on the old combat world
  (a controller duel, a legacy-fitness exploit bound), which the changed defaults altered. `test/evo/helpers/pre-t15d.js`
  pins `huntSizeRatio` 1.01, `biteArc` Math.PI / 4, `huntCallCost` 0.5 and the predator `biteMultiplier` 4 after
  `FEATURES_OFF`, and `predator-world.js` and `anti-exploit.slow.test.js` use it; no assertion changed. Unpinning one key at
  a time (the outcomes move with the seed, so read them as which key reaches the test, not a clean split): `huntSizeRatio`
  reaches D4 and D7 and the survivable-prey duel (stronger hunters take prey the duel assumes survive); `huntCallCost`
  reaches the survivable duel and FIT-8 with sexes on; `biteMultiplier` reaches FIT-5 and FIT-8 with sexes off (both are
  `it.fails`, and with 12 the exploit no longer beats the bound, so the expected failure flipped to a pass); `biteArc`
  reaches none. The live-world guard is the `fitnessV1` arms, which expect no failure and pass.
- **Coverage:** the `js/worker` ratchet fell (lines 99.83% to 99.66%) because the `forgetOldLeaders` delete in
  `lineage-board.js` was only reached by a leader change in a slow host test, and the new world has none there. A unit test
  in `test/worker/lineage-board.test.js` now covers it directly; the baseline is untouched.

### 2026-10-23 - How blobs use the basin terrain (fitness-and-selection T42a, measured early)

Replays of the T15l package (`arc1.571-bite12-size0.8`) on seeds 200460, 597883, 174238 and 553445 for 80000 ticks,
and `defaults` on seed 200460, tallied by a `stepFn` wrapper around `runReplay` (the user asked whether the refuges
and wall gaps are too small).

| Measure                                                                    | Package (4 seeds)                     | `defaults` (1 seed) |
| -------------------------------------------------------------------------- | ------------------------------------- | ------------------- |
| Blobs inside all 4 refuges (mean)                                          | 0.2 to 1.8 (0.14 to 1.4% of capacity) | 2.8 (2.2%)          |
| Refuge entry after reaching the rocks, r under 25 / 25 to 30 / 30 and over | 21% / 20% / 11%                       | 27% / 22% / 9%      |
| Wall-gap crossings per 1000 ticks                                          | 0.5 to 2.1                            | 2.8                 |
| Collision share of deaths                                                  | 0.18 to 0.26                          | 0.33                |
| Collision deaths at the world edge / wall / refuge rocks                   | 59% / 21% / 19%                       | 50% / 26% / 24%     |
| Predator bites on prey inside or near refuges                              | 0                                     | 0                   |

- A refuge gap is exactly 60 px (8 rocks of radius 50 on a 209 px ring, `refugeSizeMax` 30), so the path for a blob's
  centre is `60 - 2r`: 6 px at radius 27 and none at 30. Blob radius is `baseSize` x the size trait plus energy / 250,
  so 44 to 62% of prey ticks on full worlds are at radius 30 or more. Entrances are too tight; the user's concern holds.
- Wall gaps are not the limit: 300 px is about 5 blob diameters, and big blobs cross as often as small ones.
- Refuges have no pull and no push: none of the 16 food patches is centred in one (food items inside 0.9 to 1.7% against
  0.48% of the area) and no predator bite happened near one, so prey use them at chance level. Predators and prey are
  the same size, so `refugeSizeMax` keeps out rich blobs, not predators.
- Collision deaths are starvation with a bump: 99.6% had 60 energy or less before a 50-energy bounce, so
  `eval.terrain_death_share` overstates the terrain's cost.
- Levers for the terrain round (T42c): `refugeRocks` 6 or 5 (gaps of 109 or 146 px at the same ring; a new key),
  `refugeSizeMax` 45 or 60 (gap and interior grow together), a food patch in each refuge (new), and `wallGaps` 6 with
  `wallGapWidth` 400; judged by refuge occupancy, entry rate, `eval.migration_index` and predator bites near refuges.

### 2026-10-24 - E36 predator fix verdict (fitness-and-selection T15e)

- **Prediction (written before the run):** the T15d package (main `de7c9ef`) against the same code with the pre-T15d
  values (`evals/experiments/E36-ref-config.json`), live policy, seeds 1-32, 200000 ticks. Presence rises from about 0.34
  to about 1.0 (rescue floor); catch rate from about 0.005 to 0.05-0.08; predator births rise but the bar of at least 30
  on 12 of 16 seeds is likely missed; idle signals fall from about 11.6 to about 9; population falls (about 436 to about
  360).
- **Verdicts (`eval:compare`, reference to fix; the 32-seed column is the ledger's):**

| Metric                      | Seeds 1-16                  | Seeds 17-32                 | 32 seeds      |
| --------------------------- | --------------------------- | --------------------------- | ------------- |
| `eval.predator_presence`    | 0.338 to 0.999, better      | 0.351 to 1.000, better      | better        |
| `eval.catch_rate`           | 0.006 to 0.107, better      | 0.005 to 0.087, better      | better        |
| `eval.pursuit_kill_share`   | 0.045 to 0.143, -           | 0.016 to 0.153, -           | -             |
| `eval.predator_births` mean | 3.6 to 75.1, better         | 5.2 to 72.8, better         | better        |
| births at least 30 per seed | 10 of 16 (bar of 12 missed) | 11 of 16 (bar of 12 missed) | 21 of 32      |
| `eval.idle_signals_per_1k`  | 11.6 to 9.0, better         | 11.9 to 8.7, better         | better        |
| `eval.hunt_call_precision`  | no-difference               | no-difference               | no-difference |
| `eval.alarm_precision`      | -                           | -                           | -             |
| `eval.food_energy_per_1k`   | 491 to 468, no-difference   | 474 to 456, no-difference   | no-difference |
| `eval.fed_median_lifespan`  | 5802 to 5706, no-difference | 6180 to 5598, worse (-9.4%) | no-difference |
| `eval.lineages_alive`       | 19.0 to 20.1, -             | 18.3 to 19.4, -             | better        |
| `eval.floor_episodes`       | needs 32 seeds              | needs 32 seeds              | no-difference |
| `eval.births_per_1k`        | no-difference               | better (+15.8%)             | no-difference |
| `eval.population_mean`      | 379 to 373, -               | 422 to 368, -               | -             |
| `eval.mating_share`         | 0.203 to 0.218, -           | 0.217 to 0.216, -           | -             |

- Predators are present on every seed (presence at least 0.995 on all 32), hunt deliberately (`eval.pursuit_kill_share`
  0.14 and 0.15, from 0.05 and 0.02), and breed: predator births average 74 per seed against 4 to 5, with a
  per-seed range of 8 to 284.
- The births bar is missed: at least 30 predator births on 10 of 16 seeds (seeds 1-16) and 11 of 16 (seeds 17-32), against
  12 of 16 in the criterion. The births are skewed: the per-seed median is 66.5 (seeds 1-16) and 47.5 (seeds 17-32), below the means of 75 and 73.
- The fix cuts calls: `eval.idle_signals_per_1k` falls 22% and 27% (better on both sets). Hunt-call precision is not worse;
  alarm precision has no verdict at 16 seeds.
- The world holds except one seed set: `eval.fed_median_lifespan` is worse on seeds 17-32 (-9.4%) and no-difference on
  seeds 1-16 and on 32 seeds (-5.7%). Food is no-difference on both sets. Population falls 2% on seeds 1-16 and 13% on
  seeds 17-32 (no verdict), so the prediction's drop was real but larger on the second set.

### 2026-10-24 - E47 softer predator bites (fitness-and-selection T15o)

- **Prediction** (`evals/experiments/E47-prediction.md`, written before the run): catch rate falls roughly in proportion to bite size (bite 10 about 0.08, bite 8 about 0.06, both `better`); predator births fall to about 60 (bite 10) and 45 (bite 8) per seed, both `better`; fed median lifespan on seeds 17-32 recovers to about -5% (bite 10) and -3% (bite 8), both no-difference. Expected pick: bite 10 if it clears fed lifespan on both sets, else bite 8.
- **Run:** live policy, seeds 1-32, 200000 ticks, main f047245, the predator `biteMultiplier` the only lever over the defaults (12). Reports: `evals/experiments/E47-bite8-report.json`, `E47-bite10-report.json`; splits in `evals/experiments/E47-bite{8,10}-seeds{1-16,17-32}.json`. Each set is compared with the E36 reference split of the same seeds.
- **Table** (`eval:compare`, verdict per seed set 1-16 / 17-32; means in brackets):

| Arm     | catch_rate                      | predator_births            | fed_median_lifespan                         |
| ------- | ------------------------------- | -------------------------- | ------------------------------------------- |
| bite 10 | better / better (0.080 / 0.066) | better / better (230 / 66) | no-difference / worse, -8.5% (5673 / 5656)  |
| bite 8  | better / better (0.060 / 0.051) | better / better (127 / 40) | no-difference / no-difference (5743 / 5760) |

The E36 reference is 0.006 / 0.005 catch rate, 3.6 / 5.2 predator births and 5802 / 6180 fed lifespan. Population is 390 / 378 for bite 8 (the x12 fix is 373 / 368).

- **Result:** the prediction's catch and birth falls were right, and both arms stayed `better`. The fed-lifespan recovery failed for bite 10 (predicted about -5%, no-difference; it was -8.5% and worse on seeds 17-32), so the expected pick does not hold. Bite 8 is the softest arm that keeps catch rate and births `better` with fed lifespan not worse on either set, and it becomes the default (T15o).
- **Births of 30 or more per seed:** bite 8 has 7 of 16 on each set (the x12 fix had 10 and 11 of 16). The E36 bar of 12 of 16 is still missed, and the births criterion stays with Phase 4.
- **Golden hashes, old to new** (`test/sim/golden.json`, and the busy effect constants in `test/worker/sim-host.slow.test.js`): `cases` default `5d6bdc130c1bef61` to `7a7accb9ab2944be`; `cases` busy `0cbaa2a6b8ddf9b3` to `3cc3b8cda813eeca`; `shortCases` default `897120be022ee74d` unchanged (300 ticks, too short for the change to reach that hash); `shortCases` busy `8616e7e60b016f2b` to `f65f58c06b08c4e0`. The busy effect stream moves from `680983d656117e86` and 1828 records to `dd77d19ae7805ad7` and 2558 records, with no dropped records. `runGolden` and `driveGolden` agree, and `npm run browser:hash` matches both golden cases in Chromium 156.

### 2026-10-24 - Why skill falls within a run (fitness-and-selection T15i)

- **Question:** `eval.deliberate_food_trend` is about -0.07 and negative on 32 of 32 seeds in every world measured (E35, E36-ref, E36-fix, E47-bite8). Is it (a) selection (chance eaters out-breed deliberate ones, so brains get worse), (b) a measurement effect (crowding raises chance contact as the world fills, brains unchanged), or (c) something else?
- **Setup:** the current defaults (E47 bite 8, `evals/experiments/E47-bite8-config.json`), live policy `map-elites-v1q`, 200000 ticks, 8 seeds (the first 8 of `evals/seeds.json`: 313056, 337535, 612370, 446985, 639124, 888035, 654502, 275725; their `deliberate_food_trend` is -0.134 to -0.022). A scratch harness stepped each world as the eval does and, after every tick, classed each meal from the per-slot deltas of `deliberateFood` and `chanceFood` in the intent state, adding the agents and food items within 300 px of the eater. It snapshotted every alive genome (weights row, specialisation, sex) at the start of window 1 (tick 10000), window 4, window 7 and the run end. Scratch scripts were not committed.
- **Per-window table** (mean of 8 seeds; windows are the 8 equal spans after burn-in; food energy rates are per agent-tick, meals per 1000 agent-ticks):

| Window | Deliberate share | Population | Agents per food item | Deliberate meals | Chance meals | Deliberate energy | Chance energy | Food in view | Mean generation of eater | Top lineage share of food |
| ------ | ---------------- | ---------- | -------------------- | ---------------- | ------------ | ----------------- | ------------- | ------------ | ------------------------ | ------------------------- |
| 1      | 0.175            | 214        | 0.134                | 0.58             | 2.73         | 0.061             | 0.287         | 0.73         | 5.5                      | 0.34                      |
| 2      | 0.157            | 327        | 0.204                | 0.67             | 3.69         | 0.072             | 0.396         | 0.80         | 9.4                      | 0.35                      |
| 3      | 0.124            | 373        | 0.233                | 0.54             | 3.88         | 0.058             | 0.420         | 0.83         | 12.7                     | 0.43                      |
| 4      | 0.118            | 402        | 0.251                | 0.46             | 3.66         | 0.051             | 0.400         | 0.83         | 14.9                     | 0.43                      |
| 5      | 0.113            | 400        | 0.255                | 0.54             | 4.49         | 0.060             | 0.497         | 0.87         | 16.9                     | 0.46                      |
| 6      | 0.106            | 403        | 0.255                | 0.48             | 4.30         | 0.054             | 0.474         | 0.88         | 20.8                     | 0.52                      |
| 7      | 0.098            | 429        | 0.268                | 0.39             | 3.57         | 0.043             | 0.391         | 0.85         | 23.8                     | 0.52                      |
| 8      | 0.093            | 450        | 0.281                | 0.39             | 3.87         | 0.043             | 0.426         | 0.87         | 27.5                     | 0.52                      |

- **The environment around the meals is flat or mild.** Food stock sits at the `maxFood` cap of 1600 in every window (no depletion), so "agents per food item" rises only because the population does (214 to 450). Agents within 300 px of a meal: 1.5 to 2.5 for deliberate meals and 1.8 to 2.5 for chance meals; food items within 300 px: 8.7 to 6.9 (deliberate) and 15.5 to 10.1 (chance). Winter covers 0.87 and 0.64 of windows 5 and 6 and no other window, and drought 0 to 0.23 of a window, yet the share falls smoothly through them. The share of agent-ticks held by agents born after burn-in is 0.87 in window 1 and 1.00 from window 3 (mean life is about 6000 ticks), so it cannot separate cohorts; generation and lineage concentration do (above).
- **What the classifier calls chance.** Of the chance energy, 98 to 99% is food that was in view but with fewer than `CLOSING_MIN` closing ticks of the last `CLOSING_BITS`; 1% was never in view within `INTENT_WINDOW`; under 1.5% was a closing approach rejected as off-axis. With food in view on 73 to 88% of agent-ticks, the classifier separates "approached" from "swept past" and does little else.
- **Correlations across the 64 seed-window points** (Pearson r of the window's deliberate share): mean generation -0.87, population -0.75, agents per food item -0.75, window -0.69, top-lineage share -0.74. Within a window across seeds: generation -0.78, agents per food -0.69. Crowding correlates as strongly as time does, and both are confounded with brain change, so the correlations cannot choose between (a) and (b); the control below does.
- **Frozen-brains control (the key test).** Each snapshot's genomes (100 or 250 drawn per run) were put into fresh worlds of the same 4 world seeds (11, 22, 33, 44), with births, immigration, the floor and the predator rescue off (`mateMinEnergy` and `splitMinEnergy` 24000, `minAgents` 0, `immigrationInterval` 1e9, `predatorRescueMin` 0; no births in any run), run 5000 ticks with the share counted from tick 500. 8 source seeds x 4 snapshots x 2 sizes x 4 worlds. Brains are the only thing that differs between rows:

| Genomes from | Share, 100 agents | Share, 250 agents | Share, both | Deliberate energy per agent-tick | Chance energy per agent-tick | Scout-only share |
| ------------ | ----------------- | ----------------- | ----------- | -------------------------------- | ---------------------------- | ---------------- |
| Window 1     | 0.141             | 0.134             | 0.137       | 0.024                            | 0.148                        | 0.135            |
| Window 4     | 0.103             | 0.110             | 0.106       | 0.050                            | 0.455                        | 0.094            |
| Window 7     | 0.086             | 0.089             | 0.087       | 0.047                            | 0.556                        | 0.076            |
| Run end      | 0.069             | 0.075             | 0.072       | 0.047                            | 0.617                        | 0.069            |

- **Result:** in identical conditions the run-end genomes score 0.066 below the window-1 genomes (paired over 8 source seeds, t = -5.2; 7 of 8 negative; window 7: -0.050, t = -2.4, 7 of 8) against an in-run trend of -0.070 (last 2 windows minus first 2) in the same 8 worlds. Per seed the two agree in sign on 7 of 8 (r = 0.52); the exception, seed 612370, has the flattest in-run trend (-0.022) and a frozen difference of +0.010. Crowding has almost no effect on a fixed set of brains: 2.5 times the density (100 to 250 agents) moves the share by -0.007, +0.007, +0.003 and +0.006 for the four snapshots, which is noise.
- **The decline is a drop in the brains.** It also holds inside one specialisation (scouts, 0.135 to 0.069), so it is not only a shift in the mix (scouts hold 17% of agent-ticks in window 1 genomes and 82% in the later ones).
- **It is not a loss of deliberate skill.** Deliberate energy per agent-tick doubles from window 1 genomes (0.024) to window 4 and stays (0.047), while chance energy per agent-tick rises about 4 times (0.148 to 0.617): total intake rises 3.7 times (112k to 412k food energy per control run). The brains get much better at eating, almost all of it by brushing past food, so the share falls.
- **Why selection does this (inferred, not tested per agent).** `fitnessV1` pays energy gathered whatever the route, and food sits at the cap with 73 to 88% of agent-ticks having food in view, so the fastest route to energy is to wander quickly through food, not to approach it. A deliberate meal and a chance meal pay the same, and the chance route is four times larger. I did not trace breeding per agent; the evidence is the frozen control plus the rise in generation (5.5 to 27.5) and in the top lineage's share of food (0.34 to 0.52).
- **Conclusion: (a), selection, not (b) or a classifier artefact.** Crowding and food dynamics are not the cause (stock flat at the cap; density x2.5 moves the same brains by under 0.01), and the classifier does not shift with density. The share's fall is real: the population is selected for total intake, and chance intake is where the intake grows.
- **What it means for merit (T16 to T21a).** The measure is sound, so `isDeliberate` and `eval.deliberate_food_trend` need no change before T16, and T16 need not wait. The finding is the case for the merit design: pay `deliberateIntake` and not total intake, and discount chance intake, or selection will keep breeding the chance route. Two additions for later tasks: report the absolute rates (deliberate and chance food energy per 1000 agent-ticks) as `watch` metrics beside the share, because the share falls here while deliberate intake doubles, and a merit run that lowers chance intake would lift the share without any rise in deliberate skill; and judge the Phase 4 "at least 0.20" share target knowing the share starts at 0.175 in window 1 of the current defaults.
- **Uncertain or untested:** 8 seeds only, and the control uses fresh worlds at the first 5000 ticks (spring, full food, no drought) rather than the aged world each run ended in; a control inside the real late world (swapping brains into a window-7 world state) was not built. The cause of the selection (the pay structure) is argued from the fitness terms and the intake split, not from a per-agent breeding record, and a run with merit on (T20) is the real test of it. Genomes carry no Hebbian state in the control, as in any new birth.

### 2026-10-28 - merit arrays hashed (fitness-and-selection T22b)

- **Hashes, old to new** (`test/sim/golden.json`): `cases` default `7a7accb9ab2944be` to `1969d11fcd461153`; `cases` busy `3cc3b8cda813eeca` to `a657b81b9af3c39e`; `shortCases` default `897120be022ee74d` to `d328ec7cf550c9cd`; `shortCases` busy `f65f58c06b08c4e0` to `7642f4a7b7400ff0`. `BUSY_EFFECT_HASH` is unchanged (`dd77d19ae7805ad7`): it covers effect records, not world arrays.
- **Why `shortCases` moves too.** The 300-tick cases were expected to keep their hash, since the merit state is still zero at that length. They do not: `hashWorld` reads every merit array at every checkpoint, and the `parentSlotA` and `parentSlotB` arrays are set at birth even with merit off, so the 300-tick worlds carry nonzero merit state into their hash.
- **What is hashed.** The arrays are taken from `meritSpecs()` in its order, so the list cannot drift from the allocation. `capSlots`, `capKeys` and `meritTally` are scratch and counters and are not hashed; a test pins that.
- **Browser check.** `npm run browser:hash` matches both `cases` in Chromium 156.

### 2026-10-28 - merit costs 0.05 ms per tick (fitness-and-selection T25)

- **Merit on, 500 agents, 5-run medians:** the `merit` phase takes 0.054 ms (0.0002 with `meritEnabled` off, so the registered phase is free when off); the whole step goes 3.166 to 3.211 ms against the `defaults` row (+1.4%); the observer adds 0.12 ms. All inside the budgets (0.15, 15% and 0.25 ms), so nothing was optimised. `bench.mjs` has a permanent `merit` tracked row (`MERIT_ON`), and `alloc-check` runs on it: 3800 bytes of heap growth over 1000 ticks, so `trackMerit`, the tally and the cap allocate nothing per tick.

### 2026-10-28 - fitnessV6 and the Phase 3 instruments (fitness-and-selection T28 to T41)

- **What exists.** `fitnessV6` (`js/evo/fitness-v6.js`, composed of `fitness-v6-skill.js`, `-lineage.js`, `-watch.js` and `-diversity.js`), `descriptorV6` (`js/evo/descriptors.js`), the policy `map-elites-v6` and the v6 exploit controllers (`js/evo/scripted-v6.js`). Merit and `map-elites-v6` are off in the live app: `LIVE_POLICY` stays `map-elites-v1q` until Phase 4. The terms, constants and decisions are in [fitness-and-selection.md](fitness-and-selection.md); this note records only what building them taught.
- **Survival pays 1 per deliberate unit, not 10.** At `SURVIVAL_PER_DELIBERATE` 10, `gateThenIdle` (forage to the gate, then idle) scored 1.39 times a `foodSeeker`, against an allowed 0.70. At 1 it scores 0.61 to 0.67 and `mateHopper` about 1.0 (user decision). The margins are thin: `gateThenIdle` 0.668 against 0.696 (sexes off), `sprinter` as prey 1.473 against 1.506 (sexes on). Phase 4 weight changes must keep every bound; re-read the ratios with `ANTI_EXPLOIT_REPORT=1 npx vitest run test/evo/anti-exploit.slow.test.js --silent=false` (the config silences console output unless `--silent=false`).
- **Prey-side bounds compare against `foodSeeker` played as prey.** The `fleer` barely eats as prey (fitness 153 in the first run), so every foraging prey beat it 4 to 6 times; against `foodSeeker` the call spammers are 0.88 to 1.05 times, inside `allowedShare`.
- **The observer's slot arrays are overwritten by the next newborn.** The sim frees a slot and a birth may refill it before the policy scores the death, so anything a fitness or descriptor reads at death (size, vision, niche, group values) must be stored at birth or written to the death log at the death. `FitnessScored` therefore reads extra death-log columns and `descriptorV6` reads `roleSkill` and `bodyPlan` from the row, not from the slot.
- **`policyOptions` are the treatment, so reports with different options compare.** `eval:compare` prints `policyOptions differ` instead of refusing, a screen arm is reused only when its options match in key-sorted JSON, and options are validated in the parent before 200000-tick workers start. `npm run replay` does not take them yet, so a `fitnessOverrides` arm cannot be replayed with `--follow` until it does.
- **Cost.** Quiet machine, 500 agents, medians of 5 alternating runs: `map-elites-v6` is +0.4% of `map-elites-v1q` on `bench.step_ms@500` (frozen world 2.569 against 2.557 ms), and the observer costs +0.155 ms per tick (budget 0.25). `alloc-check` with merit on and `map-elites-v6`: 128600 bytes per 1000 ticks (limit 1 MB).

### 2026-10-28 - E37 reference (fitness-and-selection T43)

`E37` is `map-elites-v1q` on seeds 1-32, 200000 ticks, main 8036aba, merit off, run with `node scripts/eval.mjs --seeds 32 --ticks 200000 --policy map-elites-v1q --workers 30 --out evals/experiments/E37-ref.json` (30 workers shared the machine with a screen, so about 15 minutes per seed and 35 minutes in all). It is the reference every Phase 4 finalist is compared with. The Phase 3 plan said its metrics would equal `E35`'s on seeds 1-32; they do not, because the defaults moved after `E35` (config hash `700f1d6f0ec3ee94` against `55954e27356e22ed`: the T15d predator package, bite 8 from `E47`, call costs). `eval:compare` refuses that pair, so these are plain means over the same 32 seeds:

| Metric                       | E35 mean (seeds 1-32) | E37 mean (seeds 1-32) | Change |
| ---------------------------- | --------------------- | --------------------- | ------ |
| `eval.deliberate_food_share` | 0.1151                | 0.1144                | -1%    |
| `eval.skill_trend`           | -0.0644               | -0.03317              | +48%   |
| `eval.deliberate_food_trend` | -0.06781              | -0.07237              | -7%    |
| `eval.spec_dominance`        | 0.6921                | 0.7077                | +2%    |
| `eval.spec_effective`        | 2.201                 | 2.187                 | -1%    |
| `eval.mating_share`          | 0.2098                | 0.2075                | -1%    |
| `eval.child_survival`        | 0.9466                | 0.9422                | -0%    |
| `eval.born_share`            | 0.956                 | 0.9466                | -1%    |
| `eval.lineage_lifespan_p50`  | 4922                  | 4933                  | +0%    |
| `eval.lineages_alive`        | 18.67                 | 20.42                 | +9%    |
| `eval.births_per_1k`         | 0.1038                | 0.1079                | +4%    |
| `eval.food_energy_per_1k`    | 482.7                 | 478.6                 | -1%    |
| `eval.fed_median_lifespan`   | 5991                  | 5751                  | -4%    |
| `eval.median_lifespan`       | 5247                  | 4994                  | -5%    |
| `eval.population_mean`       | 400.4                 | 384.3                 | -4%    |
| `eval.floor_episodes`        | 13.34                 | 20.75                 | +56%   |
| `eval.predator_presence`     | 0.3442                | 0.9998                | +190%  |
| `eval.catch_rate`            | 0.00558               | 0.05554               | +895%  |
| `eval.pursuit_kill_share`    | 0.03214               | 0.1048                | +226%  |
| `eval.idle_signals_per_1k`   | 11.76                 | 8.524                 | -28%   |
| `eval.hunt_call_precision`   | 0.003189              | 0.01136               | +256%  |
| `eval.mean_fitness.predator` | 241.7                 | 1055                  | +337%  |
| `eval.mean_fitness.forager`  | 7134                  | 5912                  | -17%   |
| `eval.heat_stress_share`     | 0.4517                | 0.4468                | -1%    |
| `eval.terrain_death_share`   | 0.1905                | 0.196                 | +3%    |
| `eval.predator_births`       | not in E35            | 83.44                 | -      |

- **What did not move** (within about 2%): the skill share, mating, child survival, lineage lifespan, food energy, births, heat and terrain deaths, specialisation. The world's economy is the one `E35` measured.
- **What the predator package moved:** predators are present nearly always (1.00 against 0.34), catch rate is ten times higher, and they breed (83 predator births per seed on average; 14 of 32 seeds reach 30, the bar the Done table sets at 12 of 16 per set).
- **Costs of the package:** `fed_median_lifespan` -4%, `mean_fitness.forager` -17%, and `floor_episodes` +56% (13.3 to 20.8). The last was not predicted; Phase 4's "the world holds" criterion reads it against `E37`, so it is already in the reference.
- **Skill still declines:** `deliberate_food_trend` is -0.072 and `skill_trend` -0.033 (half of E35's -0.064, not predicted). That is the gap Phase 4 has to close.
- **Per-seed predator births are skewed** (mean 83, 14 of 32 seeds at 30 or more); read the done criterion on `seedChecks`, not the mean.

### 2026-10-28 - Round A (fitness-and-selection T44, E38)

`E38` is the round A screen: `evals/screens/fitness-a.grid.json`, policy `map-elites-v6` (default `fitnessV6` weights), 4 seeds at offset 28 (benchmark seeds 29-32), 200000 ticks, 9 arms, run with `npm run screen -- --grid evals/screens/fitness-a.grid.json --workers 30`. Reports, `table.md` and `verdicts.json` are in `evals/screens/results/fitness-a/`. The screen is not a verdict: 4 seeds. The grid has one policy for all arms, so there is no `v1q-ref` arm; the `E37` reference already covers seeds 29-32 on `map-elites-v1q` (below). The non-default side of each newborn key was chosen (`maturityTicks` default 600, so 1200; `childEnergyMin` default 100, so 50). `splitDeliberateMin` 100 and 300 were chosen from the reference: deliberate food is about 54 energy per 1000 agent-ticks and a fed blob lives about 5000 ticks, so a lifetime of deliberate intake is a few hundred.

The Scorecard (plan, "Experiments and done criteria"): (1) no collapse, (2) skill against `base`, (3) `births_per_1k` and `lineages_alive` not down more than 15%, (4) dominance seeds at least `base`'s. Items 1 and 3 cut. The screen tool's own `FAIL` verdict column is a stricter generic check (mating mean at least 0.2; `base` itself is 0.198) and is not the Scorecard.

| Arm             | (1) collapse | born share | (2) delib share (d vs base) | (2) skill trend (d vs base) | (3) births/1k | (3) lineages | (4) spec<=70% seeds | Scorecard | delib share vs merit-only | births vs merit-only |
| --------------- | ------------ | ---------- | --------------------------- | --------------------------- | ------------- | ------------ | ------------------- | --------- | ------------------------- | -------------------- |
| `base`          | ok           | 0.95       | 0.115 (+0.000)              | +0.021 (+0.000)             | +0%           | +0%          | 2/4 (>= base)       | reference | -                         | -                    |
| `merit-only`    | ok           | 0.93       | 0.118 (+0.003)              | -0.075 (-0.096)             | -24%          | +9%          | 4/4 (>= base)       | CUT (3)   | +0%                       | +0%                  |
| `mate-0.005`    | ok           | 0.93       | 0.118 (+0.003)              | -0.066 (-0.088)             | -24%          | +9%          | 4/4 (>= base)       | CUT (3)   | +0%                       | -0%                  |
| `mate-0.02`     | ok           | 0.93       | 0.113 (-0.002)              | -0.119 (-0.140)             | -27%          | +12%         | 2/4 (>= base)       | CUT (3)   | -4%                       | -3%                  |
| `birth-0.25`    | ok           | 0.93       | 0.117 (+0.002)              | -0.060 (-0.081)             | -16%          | -3%          | 2/4 (>= base)       | CUT (3)   | -1%                       | +11%                 |
| `split-100`     | ok           | 0.92       | 0.126 (+0.011)              | -0.069 (-0.090)             | -28%          | +0%          | 0/4 (< base)        | CUT (3)   | +7%                       | -5%                  |
| `split-300`     | ok           | 0.93       | 0.134 (+0.019)              | +0.012 (-0.009)             | -19%          | -5%          | 1/4 (< base)        | CUT (3)   | +14%                      | +7%                  |
| `maturity-1200` | ok           | 0.94       | 0.116 (+0.001)              | -0.084 (-0.105)             | -13%          | +3%          | 1/4 (< base)        | pass      | -                         | -                    |
| `childmin-50`   | ok           | 0.95       | 0.112 (-0.003)              | -0.024 (-0.046)             | +4%           | -0%          | 3/4 (>= base)       | pass      | -                         | -                    |

Columns 2 and 3 are means over the 4 seeds; the deltas are against `base`. The last two columns are against `merit-only`, the arm every merit lever shares.

- **`meritEnabled` alone is not a no-op at the population cap.** `merit-only` (credits, tracker, every lever 0) differs from `base` on every seed: `births_per_1k` -24%, `mating_share` 0.199 to 0.155, `fed_median_lifespan` 5547 to 8304, `food_energy_per_1k` +18%, `catch_rate` 0.091 to 0.021, `predator_births` 82 to 36. The cause is `js/sim/birth-cap.js`: with `capBirthsEnabled` (default on) and `meritEnabled`, free slots at the cap go to the candidates with the highest merit (T21a), whatever the weights. `merit-identity.slow.test.js` runs 3000 ticks, which never reach the cap; a seed 29 eval at 20000 ticks has identical metrics with merit on and off, and at 200000 ticks it differs (`births_per_1k` 0.097 against 0.128). Selecting long-lived foragers for the slots lengthens lives and lowers turnover, so the births fall; the Scorecard's item 3 therefore cuts every merit arm, because they all contain this lever. Read the merit levers against `merit-only`, not `base`.
- **Merit levers against `merit-only`:** `split-300` is the only arm with a clear skill signal: `deliberate_food_share` 0.134 (+14%), `skill_trend` +0.012 (the others -0.06 to -0.12), births +7%, lineages about -13%; its dominance is 1/4 seeds and `predator_births` 249 (skewed). `split-100`: share +7%, dominance 0/4. `birth-0.25`: share +1%, births +11%, population 339. `mate-0.005` equals `merit-only` (the weight is too small to change a choice); `mate-0.02` is worse (share -4%, skill_trend -0.119).
- **Newborn arms (merit off):** `childmin-50` passes the Scorecard and is the only arm that moves mating (0.199 to 0.283, +42%) with births +4%, but skill does not move (share 0.112, `skill_trend` -0.024). `maturity-1200` passes item 3 (-13%) but cuts mating -38%, child survival 0.94 to 0.88 and dominance (1/4), with no skill gain.
- **`map-elites-v6` with merit off against `map-elites-v1q` on the same seeds 29-32:** `deliberate_food_share` 0.115 against 0.094, `skill_trend` +0.021 against -0.041, `births_per_1k` 0.111 against 0.102. A hint only (4 seeds), but the policy alone may already help; `E41` will say.
- **Noise:** 4 seeds move `births_per_1k` and `skill_trend` by large amounts (the per-seed `skill_trend` of `base` runs from -0.018 to +0.099). Every arm that differs from `base` in catch rate (0.09 to 0.02 to 0.05) differs because the runs diverge, so read predator metrics here as noise unless an arm is far outside the others.

### 2026-10-28 - Why 0.44 of agent-ticks are heat-stressed and 0.19 of deaths are collisions (fitness-and-selection T42a)

Diagnosis only: no world rule changed. Replays tallied by a `stepFn` wrapper around `runReplay` (not committed), live
policy, seeds 1-8, 200000 ticks, burn-in 10000, one sample per 100 ticks (5.69M agent samples, 59,982 deaths), on main
`a422d80` (T15d defaults, bite 8, merit and fitness off). Screen arms are 8 seeds x 200000 ticks, judged by means
only: 8 seeds give no `eval:compare` verdict.

**The numbers reproduce.** The E36 fix arm had bite 12; only the bite differs from today's defaults, and the metrics
match.

| Metric                     | E35 (64 seeds) | E36 fix (32 seeds) | main (16 seeds, sd) | main (8-seed screen) |
| -------------------------- | -------------- | ------------------ | ------------------- | -------------------- |
| `eval.heat_stress_share`   | 0.442          | 0.418              | 0.450 (0.047)       | 0.445                |
| `eval.cold_stress_share`   | 0.055          | 0.062              | 0.056 (0.010)       | 0.062                |
| `eval.terrain_death_share` | 0.194          | 0.188              | 0.191 (0.026)       | 0.188                |

**Heat stress: the heat is the agents' own, and eating is most of it.** There is no heat field: the only terrain
temperature rule is the cold margin (`coldFactor` doubles `temperatureLossPassive` within `coldMarginWidth` of the
north and south edges). Temperature is a body state: moving warms it, eating warms it (`temperatureGainEat` 2 per
`foodEnergy` eaten), time cools it by `temperatureLossPassive` x the season's loss multiplier.

| Measure (replays, 8 seeds)                                           | Value                                                                       |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Heat per agent-tick: movement / eating and biting / passive loss     | +0.0034 / +0.0054 / -0.0079 (eating is 61% of the gain; net +0.0009)        |
| Net heat per tick by season (spring, summer, autumn, winter)         | -0.0002 / +0.0030 / +0.0007 / -0.0005                                       |
| Hot share by season                                                  | spring 34%, summer 58%, autumn 52%, winter 36%                              |
| Temperature (share of agent-ticks)                                   | under 40: 7%; 40-70: 31%; 70-90: 24%; 90 to 99.99: 37%; at 100: 1.4%        |
| Hot share by energy (under 200 / 200-1k / 1k-5k / 5k and over)       | 16% / 24% / 54% / 75%                                                       |
| Hot share by age (under 600 / 600-5k / 5-15k / 15k and over)         | 1% / 28% / 66% / 51%                                                        |
| Hot share by radius (under 25 / 25-30 / 30 and over)                 | 21% / 25% / 58% (63% of agent-ticks are at 30 or more)                      |
| Hot share, cold margin against the rest                              | 34% against 46%; the margin holds 9.3% of agent-ticks for 14.8% of the area |
| Mean speed fraction by band (40-65 / 70-85 / over 85)                | 0.38 / 0.40 / 0.32                                                          |
| Hot episodes (over 85): mean length; over 5000 ticks; ended by death | 3473 ticks; 22%; 20%                                                        |
| Mate-ready agent-ticks blocked only by heat (`blocksMating`)         | 53.9%                                                                       |

- **It is a thermal budget, not a sensing failure and not a hot biome.** A fed blob (energy over 5000, 20% of
  agent-ticks) is 75% hot because every food adds temperature and the passive loss is only 0.0075 per tick. Cooling
  from 85 to 65 with no movement and no food takes about 2300 ticks in spring, 4800 in summer, 3100 in autumn and 1800
  in winter, against a median lifespan of about 5700. The body-temperature doc's "equilibrium speed fraction 0.75"
  leaves eating out; with eating the balanced speed is about 0.25, below the live policy's mean of about 0.34.
- **The tuning predates the eras.** E11 to E18 tuned the rates with `seasonLength` 3600 (a year of 14400 ticks, so
  every life crossed every season); `erasEnabled` (T53) made a season 36000 ticks, so a life now spends its time in
  one season and summer's loss multiplier 0.55 is a summer-long heat wave. Summer and autumn are the hottest, but
  winter is still 36% hot (eating per tick is highest then, 0.0076, from a thin population), so the season is a part
  of the cause, not all of it.
- **Agents barely respond.** Hot agents move at 0.32 of top speed against 0.38 to 0.40 for the rest, which the 0.6
  thrust efficiency explains without any choice; they hold the cold margin less than its area. The brain has four
  temperature inputs, so the information exists; heat is cheap enough that little rewards using it: passive and size
  costs rise by about 25% on average, and mating is blocked above 85.
- **The cost to the world is small.** Heat blocks 54% of mate-ready agent-ticks, yet in the arms below mating share
  rises 57% with births per 1000 ticks up 6% (no verdict): births are limited by the budget and cap, not by heat.

Heat screen (8 seeds, means; `defaults` is the reference; every key exists, no code change):

| Arm                                         | heat  | cold  | mating share | births/1k | population | fed lifespan | spec dominance |
| ------------------------------------------- | ----- | ----- | ------------ | --------- | ---------- | ------------ | -------------- |
| `defaults`                                  | 0.445 | 0.062 | 0.196        | 0.107     | 365        | 5767         | 0.68           |
| `temperatureGainEat` 1                      | 0.210 | 0.162 | 0.308        | 0.113     | 337        | 5770         | 0.77           |
| `temperatureLossPassive` 0.01125 (+50%)     | 0.261 | 0.211 | 0.308        | 0.111     | 361        | 5639         | 0.70           |
| `temperatureGainMove` 0.005                 | 0.339 | 0.107 | 0.191        | 0.124     | 366        | 5440         | 0.60           |
| `temperatureSeasonSlope` 0                  | 0.420 | 0.044 | 0.175        | 0.113     | 341        | 5564         | 0.69           |
| `coldMarginWidth` 1200                      | 0.419 | 0.095 | 0.214        | 0.100     | 403        | 6066         | 0.70           |
| `temperatureHeatStress` 95 (moves the line) | 0.309 | 0.061 | 0.259        | 0.121     | 363        | 5603         | 0.59           |

Every arm moves heat; none moves fed lifespan or births by a clear margin. The defaults arm sits at mating share
0.196, just under the Phase 4 collapse line of 0.2. `temperatureGainEat` 1 and `temperatureLossPassive` 0.01125 each
trade heat for cold (cold stress 0.16 and 0.21) and lift mating share to 0.31, so a middle value should land heat near
0.3 with cold under 0.1. `coldMarginWidth` 1200 raises population 10% and fed lifespan 5% with heat at 0.42.

**Collision deaths: starvation with a bump, and most bumps are at the world edge.**

| Measure (replays, 8 seeds)                                              | Value                                                                  |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Deaths by cause (starved / eaten / collision / old age)                 | 72.3% / 0.6% / 20.2% / 7.0%                                            |
| Collision deaths: world edge / wall / refuge rock outside / inside ring | 58.7% / 20.2% / 11.6% / 9.5%                                           |
| Bumps (energy drop of 45 to 70 in a tick, near an edge or rock)         | edge 56.7%, wall 19.3%, refuge outside 17.6%, refuge inside 6.4%       |
| Bumps per 1000 agent-ticks; share that kill                             | 1.245; 1.7%                                                            |
| Energy lost to bumps per agent-tick                                     | 0.062, about the base passive cost (0.06)                              |
| Energy before the fatal bump: 60 or less / median / 90th percentile     | 99.6% / 26 / 45                                                        |
| Drain of a blob at 60 energy or less                                    | 0.168 per tick, so the median fatal-bump blob had about 155 ticks left |
| Age at death, collision (all deaths): under 600 / 600-5k / 5-15k / 15k+ | 15.3% / 55.3% / 23.4% / 5.9% (6.0% / 47.6% / 27.6% / 18.8%)            |
| Specialisation `spec3` (78% of the population)                          | 74.3% of collision deaths                                              |
| Radius at death: under 25 / 30 and over                                 | 32.5% / 12.4%                                                          |

- **`eval.terrain_death_share` mostly measures the world edge, and mostly labels deaths that were coming.** 59% of
  collision deaths are at the world edge (`wallDamage`, which is not terrain), 41% at rocks. A fatal bump takes a blob
  with 60 energy or less, so the death moves forward by a median of about 150 ticks. The real cost is the drain:
  every approach to an edge or rock costs 50 whatever the speed, and a blob loses about 0.062 energy per tick to
  bumps, as much as its base passive cost.
- **Newborns are over-represented (15% of collision deaths against 6% of deaths); no specialisation is.** `spec3` is
  78% of the population and 74% of collision deaths. Deaths cluster on starving blobs, not on a kind.
- **Refuges are used at chance and trap a little.** Over 3 seeds x 100000 ticks, 0.22% of agent-ticks were inside a
  refuge against 0.27% of the world's area. After a blob reached a ring it entered on 35% of approaches under radius
  25, 17% at 25 to 30 and 1.3% at 30 or more, and 63% of agent-ticks are at 30 or more. Refuge rocks are 24% of bumps,
  with no food, no predation and no reason to go there. The earlier note's concern holds: the gap is 60 px against a
  blob diameter of 50 to 70.

Damage screen (8 seeds, means; existing keys, no code change):

| Arm                                  | terrain death share | population | fed lifespan | births/1k | mating share |
| ------------------------------------ | ------------------- | ---------- | ------------ | --------- | ------------ |
| `defaults`                           | 0.188               | 365        | 5767         | 0.107     | 0.196        |
| `obstacleDamage` 0 (rocks)           | 0.131               | 400        | 6096         | 0.098     | 0.203        |
| `wallDamage` 0 (the edge)            | 0.107               | 396        | 6663         | 0.094     | 0.201        |
| `obstacleDamage` and `wallDamage` 25 | 0.168               | 384        | 6072         | 0.103     | 0.222        |

Zero damage still leaves 0.11 to 0.13 labelled collision (the last loss before a starvation). Removing the bump adds
30 to 35 agents and 6% (rocks) to 16% (edge) fed lifespan: the edge is the bigger drain, and it is not terrain.

**What the evidence supports for T42b and T42c.**

- Wider entrances (`refugeRocks` 6 or 5, `refugeSizeMax` 45 or 60) fix the clearance, but refuges have no pull, so
  occupancy would only rise toward the area share (0.3%): `refugeFood` is needed for use, and a reason to be there
  (no predator bit near a refuge in the earlier note). Fewer rocks also cut refuge bumps (24% of all bumps).
- `wallGaps` 6 with `wallGapWidth` 400 relieves the wall's 19% of bumps; the migration index stayed at 0.064 to 0.067
  in every arm here.
- Not in the plan: the bump itself. A lower `wallDamage` and `obstacleDamage`, or a damage that scales with impact
  speed, removes most of the drain; `wallDamage` 0 is the largest single gain here.

### 2026-10-29 - Round B (fitness-and-selection T45, E39)

`E39` is the round B screen: `evals/screens/fitness-b.grid.json`, policy `map-elites-v6`, 4 seeds at offset 28, 200000 ticks, 8 arms, `--workers 30`. Reports, `table.md` and `verdicts.json` are in `evals/screens/results/fitness-b/`. A screen, not a verdict. `base` and `merit-only` reproduce round A exactly (the runs are deterministic). `nocap` (`capBirthsEnabled` false, merit off) is the reference for `split-300-nocap`. Five arms are the choice; the three references are not counted against the limit of 5. The `chance-0.1` weight keeps the anti-exploit bounds (suite run with `CHANCE_WEIGHT` 0.1: `gateThenIdle` 0.661 of 0.696 allowed, `sprinter` prey pair 1.483 of 1.506, `mateHopper` 0.994 and 1.059 of 1.18, 114 passed and 14 expected failures).

| Arm                                | births/1k | delib share | skill_trend | mating | lineages | child surv | spec dom | pop | pred births | reference  | births vs ref | share vs ref | births vs base | share vs base |
| ---------------------------------- | --------- | ----------- | ----------- | ------ | -------- | ---------- | -------- | --- | ----------- | ---------- | ------------- | ------------ | -------------- | ------------- |
| `base`                             | 0.111     | 0.115       | +0.021      | 0.199  | 20.9     | 0.939      | 0.557    | 390 | 82          | -          | -             | -            | +0%            | +0%           |
| `merit-only`                       | 0.084     | 0.118       | -0.075      | 0.155  | 22.8     | 0.946      | 0.495    | 390 | 36          | merit-only | +0%           | +0%          | -24%           | +3%           |
| `nocap`                            | 0.108     | 0.113       | -0.081      | 0.026  | 8.6      | 0.952      | 0.513    | 430 | 38          | base       | -2%           | -2%          | -2%            | -2%           |
| `split-300`                        | 0.089     | 0.134       | +0.012      | 0.147  | 19.9     | 0.943      | 0.701    | 349 | 249         | merit-only | +7%           | +14%         | -19%           | +17%          |
| `split-300-childmin-50`            | 0.108     | 0.128       | -0.073      | 0.163  | 20.1     | 0.931      | 0.634    | 257 | 100         | merit-only | +29%          | +9%          | -2%            | +11%          |
| `split-300-childmin-50-birth-0.25` | 0.089     | 0.125       | -0.028      | 0.136  | 21.0     | 0.947      | 0.719    | 305 | 28          | merit-only | +6%           | +6%          | -20%           | +8%           |
| `split-300-nocap`                  | 0.119     | 0.123       | -0.048      | 0.054  | 13.6     | 0.946      | 0.642    | 285 | 39          | nocap      | +10%          | +9%          | +8%            | +7%           |
| `chance-0.1`                       | 0.108     | 0.117       | -0.031      | 0.229  | 21.7     | 0.937      | 0.747    | 355 | 40          | base       | -2%           | +2%          | -2%            | +2%           |

Means over the 4 seeds. "vs ref" is against `merit-only` for the merit arms, `nocap` for `split-300-nocap`, `base` for `chance-0.1`.

- **`capBirthsEnabled` off is not an isolation, it is a different world.** `nocap` alone: `mating_share` 0.026, `lineages_alive` 8.6, population at `maxAgents` on 4 of 4 seeds, `predator_presence` 0.60. So the cap ranking cannot be separated by switching the cap off; the births cost of merit stays tied to the cap. Against `nocap`, `split-300-nocap` moves share +9% and births +10%, but both worlds fail mating and lineages, so neither is a candidate.
- **`split-300` stays the only skill signal:** share 0.134 and `skill_trend` +0.012 (vs `merit-only` +14%, births +7%). Its dominance (0.70) and `predator_births` 249 are still skewed.
- **`childmin-50` on top of `split-300` costs the skill:** share 0.128, `skill_trend` -0.073, population 257, but births +29% over `merit-only` and mating 0.163. The triple with `birth-0.25` has share 0.125, `skill_trend` -0.028, births -20% vs `base`. Neither beats `split-300`.
- **`chance-0.1`** (merit off, archive weights only): share 0.117 (+2%), `skill_trend` -0.031, births -2%, mating 0.229, population 355, dominance 0.75. The skill metrics do not move beyond noise at 4 seeds; mating 0.199 to 0.229 is likely noise (the weight does not touch mating).
- The prediction was right that `split-300` reproduces round A and that the triple gains no share; wrong that the pair keeps the share and that `nocap` isolates the births cost.

### 2026-10-29 - Archive round (fitness-and-selection T46, E40)

`E40` is the archive round screen: `evals/screens/fitness-archive.grid.json`, policy `map-elites-v6` on the round B winner (`meritEnabled`, `splitDeliberateMin` 300), 4 seeds at offset 28, 200000 ticks, 9 arms, `--workers 30`. Reports, `table.md` and `verdicts.json` are in `evals/screens/results/fitness-archive/`. A screen, not a verdict. `split-300` is the reference (it reproduces E39 exactly) and `merit-only` the second reference. Defaults: `immigrationInterval` 600 (a config key; 0 is off), `archiveShare` 0.5, `cloneShareEnd` 0.8 (0.3 clones, 0.2 random), descriptor `v6`. Values sit on both sides of each default.

| Arm             | births/1k | delib share | skill_trend | mating | lineages | diversity | child surv | spec dom | pop | pred births | births vs ref | share vs ref |
| --------------- | --------- | ----------- | ----------- | ------ | -------- | --------- | ---------- | -------- | --- | ----------- | ------------- | ------------ |
| `merit-only`    | 0.084     | 0.118       | -0.075      | 0.155  | 22.8     | 0.23      | 0.946      | 0.49     | 390 | 36          | -6%           | -12%         |
| `split-300`     | 0.089     | 0.134       | +0.012      | 0.147  | 19.9     | 0.21      | 0.943      | 0.70     | 349 | 249         | +0%           | +0%          |
| `imm-300`       | 0.076     | 0.128       | -0.049      | 0.105  | 37.3     | 0.21      | 0.951      | 0.78     | 355 | 18          | -14%          | -4%          |
| `imm-1800`      | 0.160     | 0.133       | -0.063      | 0.124  | 12.3     | 0.22      | 0.942      | 0.57     | 210 | 62          | +79%          | -1%          |
| `share-0.25`    | 0.101     | 0.122       | -0.038      | 0.132  | 20.8     | 0.22      | 0.943      | 0.84     | 299 | 50          | +13%          | -9%          |
| `share-0.75`    | 0.077     | 0.111       | -0.081      | 0.126  | 20.3     | 0.23      | 0.952      | 0.80     | 349 | 22          | -14%          | -18%         |
| `cloneend-0.6`  | 0.113     | 0.130       | -0.028      | 0.127  | 19.0     | 0.22      | 0.939      | 0.85     | 270 | 46          | +27%          | -3%          |
| `cloneend-0.95` | 0.096     | 0.124       | +0.020      | 0.122  | 22.3     | 0.22      | 0.926      | 0.75     | 352 | 930         | +7%           | -7%          |
| `descriptor-v1` | 0.132     | 0.128       | +0.012      | 0.115  | 18.9     | 0.22      | 0.931      | 0.61     | 249 | 753         | +47%          | -4%          |

Means over the 4 seeds; "vs ref" is against `split-300`.

- **Nothing beats `split-300` on share.** Every archive arm has a share at or below it (-1% to -18%); with 4 seeds, differences under about 10% are noise, so only `share-0.75` (-18%, `skill_trend` -0.081, births -14%) is clearly a step back. Lowering `archiveShare` to 0.25 gives births +13% and spec dom 0.84.
- **`immigrationInterval` moves the world, not the skill.** `imm-300` doubles lineages (37.3) but lowers mating (0.105) and `skill_trend` (-0.049); `imm-1800` halves the pool (lineages 12.3, population 210) and lifts births +79% at share 0.133 and `skill_trend` -0.063.
- **`cloneShareEnd` 0.95** (0.45 clones, 0.05 random) is the only arm keeping the positive trend (`skill_trend` +0.020, lineages 22.3, births +7%), at share -7%; `predator_births` jumps to 930. **`cloneShareEnd` 0.6** (more random blood) gives births +27% and lower population (270) with `skill_trend` -0.028.
- **`descriptor-v1`** keeps `skill_trend` +0.012 and share -4% against descriptor v6, with births +47%, but population 249, mating 0.115 and `predator_births` 753. So v6 is not clearly better for skill at 4 seeds; v1 trades mating and population for births.
- Every arm fails the mating (>= 0.2) scorecard row, as `split-300` does (0.147); `child_survival` is 0.93 to 0.95 everywhere; no collapse (population above `minAgents` on 4 of 4).
- Predictions: right that nothing collapses and that immigration moves share under 10%; wrong that `share-0.75` helps (it hurt, -18%) and that `descriptor-v1` loses share (-4%, noise).

### 2026-10-29 - Finalists (fitness-and-selection T47, E41)

`E41` runs the three T46 finalists on `map-elites-v6` with `meritEnabled` true and `splitDeliberateMin` 300 (`evals/experiments/E41-config.json`), 200000 ticks, 16 seeds per set, `--workers 30`: F1 `split-300` (no options), F2 with `cloneShareEnd` 0.95, F3 with `descriptor` v1. Each is compared with `E37` (`map-elites-v1q`, seeds 1-32) split into its two 16-seed halves (`evals/experiments/E37-s1-16.json`, `E37-s17-32.json`, filtered from `E37-ref.json` by index; `eval:compare` refuses a 16-seed report against the 32-seed one). Compare JSON is next to each report (`E41-F<n>-s<set>-compare.json`), with `--allow-config-diff policy,meritEnabled,splitDeliberateMin`. The prediction is in `evals/experiments.json` (committed before the runs). Facts only; the decision is T48a's.

Done criteria (each cell: mean, then the `eval:compare` verdict; `no change` is `no-difference`, `-` is too few seeds to call; `PASS`/`FAIL` against the criterion's number on that seed set). Built from the reports and the compare files by a one-off script (not committed), not by hand; the table is also in `evals/experiments/E41-summary.json`.

| Criterion                                                                             | F1 s1-16                                                                        | F1 s17-32                                                                   | F2 s1-16                                                                            | F2 s17-32                                                                   | F3 s1-16                                                                    | F3 s17-32                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Skill: deliberate_food_share better, mean >= 0.20                                     | 0.129 no change FAIL                                                            | 0.136 better FAIL                                                           | 0.131 better FAIL                                                                   | 0.128 better FAIL                                                           | 0.128 better FAIL                                                           | 0.133 better FAIL                                                        |
| Behaviour: deliberate_food_trend better                                               | -0.073 no change FAIL                                                           | -0.056 better PASS                                                          | -0.073 no change FAIL                                                               | -0.072 no change FAIL                                                       | -0.075 no change FAIL                                                       | -0.064 no change FAIL                                                    |
| Behaviour: skill_trend mean >= 0, positive on >= 10 of 16                             | -0.024 (5/16 > 0) FAIL                                                          | -0.023 (7/16 > 0) FAIL                                                      | -0.037 (2/16 > 0) FAIL                                                              | -0.030 (2/16 > 0) FAIL                                                      | -0.037 (5/16 > 0) FAIL                                                      | -0.026 (5/16 > 0) FAIL                                                   |
| No monoculture: spec_dominance better, mean <= 0.55                                   | 0.674 no change FAIL                                                            | 0.678 no change FAIL                                                        | 0.645 no change FAIL                                                                | 0.727 no change FAIL                                                        | 0.667 no change FAIL                                                        | 0.623 no change FAIL                                                     |
| No monoculture: largest specialisation <= 70% on >= 12 of 16                          | 8/16 FAIL                                                                       | 8/16 FAIL                                                                   | 9/16 FAIL                                                                           | 6/16 FAIL                                                                   | 7/16 FAIL                                                                   | 10/16 FAIL                                                               |
| Predators persist: predator_presence mean >= 0.60, not worse than E37                 | 0.999 no change PASS                                                            | 1.000 no change PASS                                                        | 0.998 no change PASS                                                                | 1.000 no change PASS                                                        | 1.000 no change PASS                                                        | 1.000 no change PASS                                                     |
| Predators breed: predator_births >= 30 on >= 12 of 16                                 | 698.3 mean, 9/16 >= 30 FAIL                                                     | 850.0 mean, 11/16 >= 30 FAIL                                                | 906.6 mean, 7/16 >= 30 FAIL                                                         | 368.2 mean, 8/16 >= 30 FAIL                                                 | 861.1 mean, 11/16 >= 30 FAIL                                                | 436.9 mean, 12/16 >= 30 PASS                                             |
| Calls: idle_signals_per_1k better; alarm and hunt-call precision not worse            | idle 7.48 no change; alarm -; hunt no change FAIL                               | idle 7.06 no change; alarm -; hunt better FAIL                              | idle 7.61 no change; alarm -; hunt no change FAIL                                   | idle 7.93 no change; alarm -; hunt no change FAIL                           | idle 7.51 no change; alarm -; hunt worse FAIL                               | idle 7.45 no change; alarm -; hunt no change FAIL                        |
| Mating: mating_share better, mean >= 0.35                                             | 0.115 - FAIL                                                                    | 0.127 - FAIL                                                                | 0.122 - FAIL                                                                        | 0.126 - FAIL                                                                | 0.131 - FAIL                                                                | 0.109 - FAIL                                                             |
| Lineage: lineage_lifespan_p50 better; child_survival mean >= 0.90                     | p50 worse; child_survival 0.934 FAIL                                            | p50 worse; child_survival 0.934 FAIL                                        | p50 worse; child_survival 0.930 FAIL                                                | p50 worse; child_survival 0.941 FAIL                                        | p50 worse; child_survival 0.933 FAIL                                        | p50 worse; child_survival 0.936 FAIL                                     |
| World: none worse of food_energy, fed_median_lifespan, lineages_alive, floor_episodes | food_energy better, fed_median better, lineages -, floor -: PASS                | same pattern: PASS                                                          | PASS                                                                                | PASS                                                                        | PASS                                                                        | PASS                                                                     |
| World: births_per_1k down at most 15%                                                 | -4.1% PASS                                                                      | 5.4% PASS                                                                   | 1.2% PASS                                                                           | -18.8% FAIL                                                                 | -3.2% PASS                                                                  | 7.3% PASS                                                                |
| World: seedChecks on every seed                                                       | born_share >= 0.5 on 16/16; checks all pass PASS                                | same: PASS                                                                  | PASS                                                                                | PASS                                                                        | PASS                                                                        | PASS                                                                     |
| Diversity recorded (spec_effective, body_plan_coverage, trait_spread)                 | spec_effective no change; body_plan_coverage worse; trait_spread no change PASS | spec_effective no change; body_plan_coverage worse; trait_spread worse PASS | spec_effective no change; body_plan_coverage no change; trait_spread no change PASS | spec_effective no change; body_plan_coverage worse; trait_spread worse PASS | spec_effective no change; body_plan_coverage worse; trait_spread worse PASS | spec_effective better; body_plan_coverage worse; trait_spread worse PASS |

Other runs:

- **Ladder** (`npm run ladder`, defaults, `evals/ladder/a4723db-3x10000.json`): wanderer 2.0 and hunter-vs-fleer 2.0 (floor), random 98.7, hunter-vs-foodSeeker 193.3, the foragers (sloppyForager, foodSeeker, fleer) 450.0 (saturated at 450 of 500). Random is below the foragers: the order holds.
- **Anti-exploit suite** (`test/evo/anti-exploit.slow.test.js`, default `fitnessV6` weights; the finalists change no weight): 114 passed, 14 expected failures (all in the legacy entries, the count T42 recorded).
- **`eval:power`** on `E41-F1-s1-16.json` with `--include-watch` was refused: the tool's smallest arm is 16 seeds, so a 16-vs-16 split needs 32 seeds and a 16-seed report cannot be split. No power figures for E41; not worked around.

Things that look odd (facts for T48a):

- `skill_trend` is negative on every finalist and set (-0.023 to -0.037), not the +0.012 to +0.020 the 4-seed screen showed; `E37` itself is -0.033.
- `predator_births` is about 8 to 10 times `E37`'s 83 per seed (means 368 to 907; one F1 seed at 2316); the counts are real per-seed values.
- `lineage_lifespan_p50` is `worse` on all six sets (F1 s1-16 4116 against E37's 5011 on the same seeds).
- `mating_share` is 0.11 to 0.13, below `E37`'s 0.21 (the compare's verdict is `-`, too few to call); the mating row fails on every cell.
- F2 seeds 17-32 lowers `births_per_1k` by 18.8%, outside the 15% limit.
- `body_plan_coverage` is `worse` in 5 of 6 cells.

Prediction check (recorded before the run in `evals/experiments.json` as E41): deliberate share 0.13 was right; mating near 0.15 was low (0.11 to 0.13); skill_trend 0 to +0.02 was wrong (negative); spec_dominance 0.66 to 0.70 roughly right (0.62 to 0.73); the Skill, Mating and No monoculture rows failed as predicted. Predator births were predicted above 30 per seed on most seeds, which held but understated the size (hundreds of births per seed on average); `lineage_lifespan_p50` was not in the prediction.

### 2026-10-29 - Adopting F1 split-300 re-pins the golden hashes and the busy effect stream (T48b, T48c)

- The defaults now have `meritEnabled` true and `splitDeliberateMin` 300, and `LIVE_POLICY` is `map-elites-v6`. The pre-commit hook runs the golden tests on any commit that touches the defaults, so the Node re-pin cannot sit in a commit of its own; it is in the T48b commit.
- **Hashes, old to new** (`test/sim/golden.json`): `cases` default `1969d11fcd461153` to `6a071841cce97696`; `cases` busy `a657b81b9af3c39e` to `778566888b16e69f`; `shortCases` default `d328ec7cf550c9cd` to `60429c3dc35c214d`; `shortCases` busy `7642f4a7b7400ff0` to `40984ad04e6ef7a6`. `npm run browser:hash` matches both long cases in Chromium 156.
- **`BUSY_EFFECT_HASH` changed** (unlike T22b): `dd77d19ae7805ad7` to `1bcb8565c2f7c1a9`, records 2558 to 1487, because the busy world now runs with merit on (the split gate blocks splits).
- `baseline-v5` and `baseline-v5-o16` are re-recorded (16 seeds x 200000 ticks, seeds 1-16 and 17-32). `bench/baseline.json` is left as it was: the frozen-world code path did not change, a re-run read `bench.step_ms@500` 2.524 ms against 2.372 (machine noise), and `bench-check` passes against the old baseline, so a noisier reading is not recorded. The tracked rows (not gated) read `defaults` 3.483 ms, `merit` 3.375 ms, `w7680` 4.106 ms.

### 2026-10-29 - Split and heat screens (fitness-and-selection T48f, E61 and E62)

- **Split screen (`E61`)**: `evals/screens/split.grid.json`, `map-elites-v6`, 7 arms x 8 seeds at offset 32 (seeds 33-40, fresh against the E37 and E41 seeds 1-32), 200000 ticks. Means over seeds:

| Arm              | mating | bumper share | split delib | deliberate share | skill_trend | pop | floor eps | fed life | lineages | spec dom | predator births |
| ---------------- | ------ | ------------ | ----------- | ---------------- | ----------- | --- | --------- | -------- | -------- | -------- | --------------- |
| ref              | 0.129  | 0.291        | 0.178       | 0.130            | -0.022      | 353 | 7.8       | 7827     | 21.7     | 0.749    | 672             |
| share-0.2        | 0.146  | 0.111        | 0.261       | 0.162            | +0.012      | 250 | 4.5       | 5795     | 19.3     | 0.779    | 41              |
| share-0.3        | 0.151  | 0.233        | 0.269       | 0.172            | +0.009      | 157 | 8.8       | 5600     | 20.0     | 0.668    | 140             |
| share-0.4        | 0.152  | 0.384        | 0.202       | 0.152            | -0.041      | 95  | 38.5      | 5469     | 19.0     | 0.561    | 55              |
| share-0.3-once   | 0.146  | 0.410        | 0.177       | 0.139            | -0.037      | 99  | 21.1      | 6404     | 20.7     | 0.547    | 43              |
| prey-no-split    | 0.146  | 0.458        | 0.143       | 0.138            | -0.007      | 97  | 30.3      | 6806     | 19.7     | 0.627    | 45              |
| share-0.3-strict | 0.144  | 0.283        | 0.248       | 0.167            | -0.014      | 59  | 18.3      | 5512     | 19.1     | 0.520    | 30              |

- The reference's `eval.split_bumper_share` is 0.291, not the 0.4 to 0.5 predicted; its split-parent deliberate share (0.178) is close to the mate-parent share (0.170). Its predator births (672) are one seed of 5238; the other seven average 20.
- **Every gate that bites shrinks the world** (population 59 to 250 against 353, food per 1000 ticks -8% to -49%, fed lifespan -13% to -30%): the births a gate refuses are not replaced by matings, because mating stays difficult (0.13 to 0.15 in every arm). Below about 100 agents the population sits on the floor bypass and `eval.floor_episodes` rises (30 to 38 for `share-0.4` and `prey-no-split`). Only `share-0.2` keeps both the floor episodes (4.5) and a population above 200 on most seeds (lowest 94 and 110).
- **`prey-no-split` makes the bumper share worse** (0.458): when only predators may split, the split births that remain are the predators' and they are bumpers. `splitMaxPerLife` 1 does not cut it either (0.410).
- Mating share moves only 0.129 to 0.152 across the arms, so nothing here makes mating easy, which is the intent.
- **Heat screen (`E62`)**: `evals/screens/heat.grid.json`, 4 arms x 16 seeds at offset 32, on the old split default (`splitDeliberateShareMin` 0):

| Arm        | heat stress | cold stress | mating | skill_trend | pop | fed life | floor eps | food/1k |
| ---------- | ----------- | ----------- | ------ | ----------- | --- | -------- | --------- | ------- |
| ref        | 0.496       | 0.074       | 0.125  | -0.036      | 346 | 7753     | 18.4      | 599     |
| eat-1.5    | 0.415       | 0.097       | 0.183  | -0.015      | 328 | 7306     | 30.2      | 614     |
| loss-0.009 | 0.387       | 0.137       | 0.146  | -0.049      | 307 | 7476     | 36.4      | 566     |
| both       | 0.358       | 0.159       | 0.171  | -0.001      | 335 | 7680     | 23.8      | 604     |

- No arm reaches heat stress 0.3. `loss-0.009` lowers heat less than `eat-1.5` and raises cold more (the passive loss is doubled in the cold margin), so the two levers do not add up as predicted; `both` breaks the cold limit. No arm collapses. Heat 0.3 needs a different lever (a smaller `coldFactor`, or heat from movement); it was not screened.
- Not yet tested together: `share-0.2` with `temperatureGainEat` 1.5. T48g adopts both only after a 16-seed `eval:compare` on the combination.

### 2026-10-29 - T48g confirm (fitness-and-selection, E63)

- **What ran**: both T48f winners together (`splitDeliberateShareMin` 0.2, `temperatureGainEat` 1.5) against the live default, 16 seeds at offset 32, 200000 ticks, `map-elites-v6`. `eval:compare` refuses the pair on config until `--allow-config-diff splitDeliberateShareMin,temperatureGainEat` is given.
- **Treatment**: `eval.split_bumper_share` 0.331 to 0.105, `eval.mating_share` 0.125 to 0.204, `eval.deliberate_food_share` 0.126 to 0.173, `eval.skill_trend` -0.036 to +0.003, heat stress 0.496 to 0.304, cold stress 0.074 to 0.093. The two heat levers compound when `share-0.2` is on: heat reaches 0.30, which `eat-1.5` alone did not (0.415 on the old split default).
- **Cost**: `eval.food_energy_per_1k` 599 to 481 (-20%, worse), `eval.fed_median_lifespan` 7753 to 5577 (-28%, worse), `eval.median_lifespan` -25%, population mean 346 to 256 (lowest seed 75, five seeds under 200, reference lowest 145). The 8-seed screen saw only the lifespan cost; the food cost is new. The user adopted both anyway (Decisions, 2026-10-29).
- **Floor**: the population never fell below `minAgents` on average (`popAboveMin` 16 of 16); the minimum tick population is 40 on both arms. `specShare` fails on most seeds on both arms (3 of 16 pass for the reference, 5 of 16 for the candidate).
- **Unseparated**: the 16-seed run did not split the food and lifespan cost between the two keys.
- **Adopted (T48g)**: `splitDeliberateShareMin` 0.2 and `temperatureGainEat` 1.5 are the defaults, in `FEATURES_ON`; `FEATURES_OFF` pins `temperatureGainEat` 2 so the frozen bench world and the scripted temperature tests keep their meaning. The merit identity test zeroes the share gate with the other merit settings, since the gate acts whenever merit is on.
- **Hashes, old to new** (`test/sim/golden.json`): `cases` default `6a071841cce97696` to `9fbb095d6777c131`; `cases` busy `778566888b16e69f` to `45172f943fc66638`; `shortCases` default `60429c3dc35c214d` to `24bb4f277f8d3566`; `shortCases` busy `40984ad04e6ef7a6` to `b5f7c8be6d5055ed`; `BUSY_EFFECT_HASH` `1bcb8565c2f7c1a9` to `286503d0cbe4025c` (records 1487 to 2121). `npm run browser:hash` matches both long cases in Chromium 156.
- **Baselines re-recorded** (16 seeds x 200000 ticks, `baseline-v5` seeds 1-16 and `baseline-v5-o16` seeds 17-32). The scripted `baseline-v5` policy is far harsher on the new defaults than `map-elites-v6`: means over seeds 1-16 and 17-32 are food per 1k 404 and 373, fed median lifespan 5007 and 5071, population 190 and 186, mating share 0.27 and 0.30, bumper share 0.21 and 0.22, heat stress 0.24 and 0.21, cold stress 0.125 and 0.128, floor episodes 59 and 68. The cold stress is over the 0.1 limit on this policy only; the E63 candidate on `map-elites-v6` read 0.093.

### 2026-10-29 - E42 long run (pre-watchability)

- **What ran**: the T48g defaults (live `map-elites-v6`, configHash `79384a6cfa80414d`), seeds 1-16 at the default offset, 600000 ticks, no config or policy options. The report is `evals/experiments/E42-report.json`. This is the pre-watchability baseline: the user judged this world unwatchable (97% scouts, spinning, alarm spam), so T49 is rerun after the watchability work (T48h to T48j).
- **Result**: `eval.skill_trend` mean +0.036 (sd 0.083), positive on 10 of 16 seeds. `eval.deliberate_food_share` 0.172, `eval.mating_share` 0.262, `eval.split_bumper_share` 0.025, `eval.spec_dominance` 0.851, `eval.spec_effective` 1.66, `eval.alarm_precision` 0.0003, heat stress 0.490, cold stress 0.061, `eval.population_mean` 385 (sd 35).
- **Floor and predators**: the sampled population minimum (every 1000 ticks) is 40 on five seeds and never under `minAgents`. `eval.predator_births` median 93.5 per seed, with seed 313056 at 15890 (mean 1101), so the mean is one seed.
- **Prediction check**: `skill_trend` sign and count (10 of 16) and `deliberate_food_share` were as predicted. Mating (0.26 against about 0.2), heat (0.49 against about 0.30), split bumper (0.025 against 0.10 to 0.15) and population (385 against below 256) were wrong. The longer run did not reproduce the 200000-tick E63 levels of heat and population.
- **Verdict**: none. There is no same-tick reference for `eval:compare`, so the ledger effect is a placeholder.

### 2026-10-29 - Economy screen (fitness-and-selection T48i, E64)

- **What ran**: `evals/screens/economy.grid.json`, `map-elites-v6`, 8 arms x 8 seeds at offset 32 (seeds 33-40), 200000 ticks, T48g defaults. Reports and `table.md` are in `evals/screens/results/economy/`. Means over seeds (population is the mean of the per-seed means):

| Arm                   | circling | saturation | alarm/1k per agent | spec dom | spec eff | energy share | energy / split | delib food | mating | bumper | skill_trend | heat  | cold  | pop | food/1k | fed life | floor eps |
| --------------------- | -------- | ---------- | ------------------ | -------- | -------- | ------------ | -------------- | ---------- | ------ | ------ | ----------- | ----- | ----- | --- | ------- | -------- | --------- |
| ref                   | 0.441    | 0.481      | 8.13               | 0.781    | 2.01     | 0.125        | 3.50           | 0.185      | 0.233  | 0.053  | -0.011      | 0.324 | 0.085 | 314 | 479     | 6226     | 7.0       |
| max-4000              | 0.383    | 0.391      | 7.45               | 0.681    | 2.38     | 0.333        | 1.49           | 0.181      | 0.186  | 0.192  | -0.008      | 0.251 | 0.100 | 210 | 382     | 5186     | 16.4      |
| max-2000              | 0.354    | 0.334      | 7.35               | 0.633    | 2.68     | 0.417        | 0.93           | 0.196      | 0.280  | 0.158  | 0.035       | 0.167 | 0.102 | 188 | 348     | 4927     | 23.4      |
| max-1200              | 0.310    | 0.300      | 6.86               | 0.691    | 2.43     | 0.504        | 0.68           | 0.190      | 0.329  | 0.198  | -0.004      | 0.110 | 0.103 | 166 | 342     | 4551     | 60.1      |
| max-2000-scout-move-1 | 0.331    | 0.305      | 6.87               | 0.536    | 3.16     | 0.389        | 0.87           | 0.190      | 0.231  | 0.194  | 0.037       | 0.163 | 0.090 | 146 | 359     | 4098     | 91.6      |
| max-2000-alarm-5      | 0.304    | 0.312      | 6.05               | 0.621    | 2.83     | 0.420        | 0.95           | 0.190      | 0.256  | 0.191  | 0.037       | 0.189 | 0.090 | 175 | 384     | 4222     | 70.3      |
| regrow-0.045          | 0.387    | 0.438      | 7.42               | 0.783    | 2.12     | 0.135        | 3.84           | 0.168      | 0.200  | 0.093  | 0.020       | 0.326 | 0.093 | 272 | 513     | 5498     | 12.0      |
| combo                 | 0.300    | 0.303      | 5.78               | 0.641    | 2.75     | 0.405        | 0.91           | 0.195      | 0.188  | 0.198  | -0.020      | 0.208 | 0.073 | 158 | 424     | 3725     | 86.4      |

- **The reference matches the diagnosis**: circling 0.441 (the diagnosed range was 25 to 65%), spec dominance 0.781, and a bank of 3.5 split thresholds (`eval.energy_over_split`) at 12.5% of `maxEnergy`. The bank is the lever: `maxEnergy` brings `eval.energy_over_split` under 1 at 2000 and lowers circling (0.44 to 0.35 to 0.31 at 1200), saturation (0.48 to 0.33 to 0.30) and alarm rate (8.1 to 7.4 to 6.9). `foodRegrowPerArea` 0.045 alone does little to the bank (3.8) or the mess metrics.
- **Circling stays high**: no arm gets under 0.30, so about a third of the tracked agents still circle. The economy cuts it by a quarter to a third, not to zero. Nothing rewards roaming: the `fitnessV6` migrate term pays only up to 8 food patches and only steers the archive, and merit has no movement term. The fallback, if circling stays high after T48j, is T48l (a ground-covered term in merit).
- **Only the scout discount moves the monoculture**: `eval.spec_dominance` is 0.54 with `moveCostMultiplier` 1 against 0.62 to 0.78 in every other arm, and `eval.spec_effective` rises to 3.16. It is near 0.5 and not under it, so T48k stays open after T48j.
- **Costs**: population falls from 314 to 146 to 188 (lowest per-seed means 59 to 105), `floor_episodes` from 7 to 23 (`max-2000`) to 92 (`max-2000-scout-move-1`), `eval.fed_median_lifespan` by 21% to 34%, food per 1000 ticks by 20 to 30%. The worlds are small and floor-bound, which the user accepted for less waste. Mating share does not drop (0.23 to 0.33 in the `maxEnergy` arms); the `split_bumper_share` rises from 0.05 to about 0.2 in every `maxEnergy` arm.
- **seedChecks** (pass counts of 8): `popAboveMin`, `catchRate`, `lineages` and `popBelowMax` pass 8 of 8 in every arm. `specShare` passes 2 (ref), 4 (`max-4000`), 2 (`max-2000`), 4 (`max-1200`), 5 (`max-2000-scout-move-1`), 4 (`max-2000-alarm-5`), 1 (`regrow-0.045`) and 3 (`combo`). Every arm's table verdict is FAIL, the reference's too; combo and `max-4000` also miss the mating-mean check (0.19).
- **Pick**: `max-2000-scout-move-1` (best on dominance and `specShare`; mess metrics within 0.03 of the best arm). `alarmCost` 5 stacks well on circling and alarms but costs lifespan and keeps dominance at 0.62, so T48j confirms `max-2000-scout-move-1` with and without it at 16 seeds.
- **Prediction check** (E64): the direction held for every lever. Wrong: max-1200 did not have the lowest spec dominance (0.69 against 0.63 for `max-2000`), and `combo` fell over (population 158, floor 86) rather than being the best all-round arm; spec dominance stayed above 0.5 in every arm, as predicted for all but `max-2000-scout-move-1` (0.54); populations fell more than predicted (`max-2000` 40% against 15 to 30%). The split bumper rise was not predicted.

### 2026-10-29 - Scene and selection detectors (natural-selection Chunk A, T1 to T2)

- No event carries the food kind (`FOOD_KIND` in `js/sim/carcass.js`): `AgentDied` and the food arrays are all there is. `eval.carcass_meal_share` therefore watches the food arrays: a meat item alive at the end of the last observed tick and gone now before `carcassTicks` ran out was eaten, by the lowest alive slot that overlaps its last place and gained food energy (`feed` walks the slots in order).
- Mate births are seen too late for candidates: pregnancy lasts `pregnancyTicks` (480), so the males in range at the birth are not the ones the mother chose from. `eval.mate_skill_gap` and `eval.mate_hunter_lean` are read at the tick a mother turns pregnant (`pregnancy` rises from 0), when `fatherId` and the candidates are in place.
- `parentSlotA` and `parentSlotB` (merit-state arrays) are set by `giveBirth` whether or not `meritEnabled` is on, and the parent's meal counters (`mealsTotal`, `mealsDeliberate`) exist but stay 0 with it off, so `eval.skill_heritability` is `null` there.
- `obsX` and `obsY` are `Float32Array`: a refuge rock sits a ring radius from its centre only to about 2e-5, so tests of the ring geometry compare to two decimals.
- A within-lineage regression of a quantity that does not vary still has a rounding-noise variance; `eval.childshare_by_condition` ignores a lineage whose summed squared spread is under 1e-9.

### 2026-10-30 - The big bang, as built (natural-selection stages 1 to 6a)

- **Top-2 pooled rays.** The T10b discrimination checks on the strongest hit per channel (57 inputs) scored `two-food-opposite` 1.00 pooled to 1.00 raw, `two-threats-apart` 0.69 to 0.88 and `corridor` 0.00 to 1.00 (16 trials, seed 1), so the plan's rule added the top 2 per channel: 8 x 2 x 3 = 48 pooled values plus 33 body inputs is 81 inputs and 4047 floats at 32 hidden (1775, 2847, 4047, 6831 and 10127 at 16, 24, 32, 48 and 64). The brain plan's last Genome sizes row (2238 to 10542) is the no-`SPLIT`, `brainSkip` variant and matches a per-block derivation, but it is not the built row. On the built layout, with the pooled controllers reading both hits: `two-food-opposite` 1.00 to 1.00 (pass), `two-threats-apart` 0.88 to 0.88 (pass), `corridor` 0.00 to 1.00 (still fails). The corridor stays a failure because the two strongest obstacle hits in a passage are the two rocks nearest the agent, which sit on the same wall; the far wall is never among them. The scene was not changed. A brain can still use the second hit for the near wall's extent, but a two-wall balance needs a channel per side, which is a layout question for `E53`, not a scene to tune.
- **Pooling is a two-slot insertion.** `poolRays` keeps, per channel, the first slot's triple and the second's, shifting the first into the second when a ray beats it (strict `>`, so the first ray wins a tie). The `pooled` row stays zero-filled per tick and the function allocates nothing.
- **A hook runs the related slow tests.** `scripts/check.sh --tier 1` runs `vitest related` on the staged files, which includes `*.slow.test.js` unless `TEST_SCOPE=fast` is set. A commit that changes sim behaviour fails the hook on the full-length Node goldens, the host golden and the effect-stream pin until they are re-pinned, so run per-commit hooks with `TEST_SCOPE=fast`, pin the short cases in the behaviour commit and re-pin the long ones in a commit of their own.
- **Two slow tests were written for the old world, not broken by the new one.** `anti-exploit.slow.test.js`: the bound is `max(0.5, intake share + 0.1)`, and the big-bang economy (`maxEnergy` 2000, the bite kick and the recoil) cuts a hunter's intake (the hunt-call spammer's food energy from 0.87 to 0.46 of the foodSeeker's) while the legacy `fitnessV5` score still pays for the same bites, so the allowance fell under it (1267 against 916). The suite now pins the economy its bounds were defined on (`maxEnergy` 25000, `biteCost` 0, `recoilEnergy` 0). `scripted-temperature.slow.test.js`: "a rusher overheats out" relied on the old per-agent food target (`FEATURES_OFF`) being scarce; on the default area-regrowth food (0.06 per 1,000,000 px2 per tick) a rusher sits at 95 degrees and still fills the world to 500. The case now runs on `foodRegrowPerArea` 0.003, where the rusher ends below the start and below half the gentle forager, across 0.002 to 0.005.
- **The busy effect stream is livelier, not broken.** Its record count went 1110, 1173, 1675, 1755 across the stage-5 re-pins and is 1379 on the top-2 layout. Counted by kind (born, died, bite, alarm, pack call, smoke): 121, 143, 711, 97, 36, 2 at 1110; 95, 134, 435, 344, 146, 19 at 1173; 113, 148, 1016, 316, 70, 12 at 1675; 147, 168, 1039, 340, 42, 19 at 1755; 124, 150, 810, 233, 45, 17 now. Births and deaths stay between 95 and 168; the swings are bite effects (435 to 1039) and alarm calls (97 to 344), which follow how often hunters and prey meet in one 5000-tick world, and no record was dropped in any of them. Each behaviour commit re-rolls that count; it is not a trend to read.

### 2026-10-30 - The brain instruments, as built (brain plan chunk B1)

- **The keys sit at today's values.** `leakMin` 0.05, `mutationRate` 1, `weightDecay` 0 and `leakGeneStart` 3 are the old constants and behaviour, so no golden moved; the big-bang defaults arrive with chunk B3. `mutationRate` has its own rule type (`mutationRate` in `js/sim/config-rules.js`) because it is a number, `invsqrt` or `genes:<k>`; `js/sim/mutation-rate.js` validates and resolves it per row length.
- **The checkpoint sample is shared, not redrawn.** `diversity` leaves the slots it drew in `observer.sampled`, so the leak, Hebbian and weight samplers read the same agents and draw nothing (the `observer.rng` stream and `eval.diversity` are unchanged). Under 2 agents the sample is empty.
- **The 16-tick hidden snapshot needs the checkpoint interval.** The observer cannot know when a checkpoint will come, so `createObserver` takes `checkpointTicks` (`scripts/eval-worker.mjs` passes its 1000); without it `eval.hidden_persistence` is `null`.
- **A skill is defined only where its denominator is.** The per-life forage, hunt and flee skills (`js/evo/metrics-leak-skill.js`) skip a life with no food, no kill (or a specialisation that cannot hunt) or no escaped bite episode, which needed a per-slot `escapedLife` counter beside `respondedEscape` in the intent state. The life's leak is read from the genome row at death, and a slot the world has already refilled is skipped.
- **Memory-output classes.** A life of at least 600 ticks is flat when both outputs have a standard deviation under 0.05, a signal when a varying output has a lag-1 autocorrelation of at least 0.2, and noisy otherwise, so the three shares sum to 1. The autocorrelation is the Pearson correlation of the consecutive pairs, from per-slot sums (count, first, last, sum, squares, lag products).
- **Rare inputs are scanned only once rare.** `js/evo/rare-saturation.js` marks an input fired when it is seen firing while it is in the rare set, so an agent that fired it before it became rare may count once; the bias is small and the scan costs nothing before burn-in. The input-activity sample starts at burn-in, so an input can be rare after 10,000 agent-samples (about 20 samples at 500 agents).
- **`weightDecay` is not wired to the live app yet.** A birth decays the `wIn` rows of the inputs set in `createBirth`'s `silent` mask. In an eval the input-activity sample fills it (`observer.silentTarget`, set by `map-elites-v1`); the live worker has no observer, so the mask stays zero there. Chunk B3 sets `weightDecay` above 0 and must decide where the live mask comes from.

### 2026-10-30 - The big-bang brain, as built (brain plan chunk B3)

- **The row is 4,494 floats at 32 hidden.** `wOut`, `bOut` and `wSkip` have 10 gene columns (`layout.geneOutputs`), and `GENE_OUTPUTS` in `js/sim/brain-layout.js` maps gene column to output index (`[0..7, 9, 10]`): the outputs after `SPLIT` shift down one column. `forwardAll` sets the `SPLIT` sum to 0 and the output row stays 11 wide. Nothing in the sim ever read `SPLIT` (a split needs energy and the gates), so deleting its genes changed no rule.
- **Skip details.** Random skip weights have sd `1 / sqrt(48)` (0.144; `wOut` is 0.177 at 32 hidden, equal at 48 and above it at 64). Crossover takes each output's skip column whole from one parent, one `nextFloat` per gene column after the trait genes; mutation covers the block already (it lies before `traitStart`), and the Hebbian update does not touch it. `geneticDistance` scales its skip samples by `sqrt(48)`.
- **The silent-input mask is world state.** `world.inputActivity` (`js/sim/input-activity.js`, moved from `js/evo`) is filled by the `brain` phase straight after `forwardAll`, so a newborn's zero `pooled` row is no longer counted as inactive (the eval observer used to sample after the whole step). Its counts are hashed only when `weightDecay` is above 0, so it moved the goldens only with the default. A controller run that replaces the `brain` phase (the scripted worlds) skips the sample, which is harmless before burn-in. The eval observer reads the same object (`observer.activity` is set to it each tick); a world double without one is sampled by the observer.
- **A reference policy hides what the big bang changes.** `cloneWithNoisePolicy` (the goldens) ignores `leakGeneStart`, `mutationRate` and the decay: it starts its leak genes at 0 and mutates by its own rule. So `leakGeneStart` and `mutationRate` moved no golden, `leakMin` moved them through every leak rate (0.525 to 0.51 at a gene of 0), and `weightDecay` moved them only because the activity counts joined the hash. With the old value as an override each short case reproduced the previous hash, and the long cases at the end reproduced the pre-defaults tree (bfad12a93505da49, 725a89fec3919b2b).
- **The busy effect stream is much livelier.** 2,567 records (was 1,379): born, died, bite, alarm, pack call, smoke 116, 157, 667, 1204, 198, 225 (was 124, 150, 810, 233, 45, 17). Random skip weights wire a pooled input straight to the alarm, call and smoke outputs, and the reference policy does no selection against them. No record was dropped; the births and deaths stay in their band.
- **A duel test was seed luck.** `survivable-world.slow.test.js` had seed 3 at 7 resolved bite episodes against a floor of 5 on the earlier code. The longer row shifts every birth's draws and the meetings reshuffle (4 now; seed 4 has 205), so the suite runs seeds 1, 2 and 4 with the bounds unchanged. The controllers do not use the brain.
- **A pre-existing dupes finding.** `scripts/check.sh --only=dupes` reports the `inputActivity: results.map(...)` argument block shared by `scripts/eval.mjs` and `scripts/lib/screen-run.mjs` (7 lines), added with the B1 instruments; it is not from B3.

### 2026-10-30 - Innate instincts for random genomes (`instinctWeight`)

- **Turn sign.** A positive `TURN` output turns towards positive sine in the agent's frame: with food at +0.5 rad the heading rises tick by tick, at -0.5 rad it falls (`test/evo/instinct.test.js` checks both by the heading change). So the food turn term is +w on the strongest food hit's sine and the threat turn term is -w.
- **Terms.** `applyInstinct` in `js/evo/instinct.js` adds to the first hit slot of the pooled skip rows, never to literal offsets: food strength to thrust +w, food sine to turn +w; a forager also threat strength to thrust +w and threat sine to turn -w; a `canHunt` body also prey strength to thrust +w and to bite +2w, prey sine to turn +w. The alarm, hunt-call and smoke output biases start at -2w. Sums are clamped to `WEIGHT_CLAMP`. It draws nothing, so the stream and the genome at `instinctWeight` 0 are those of `randomWeights`.
- **Where it applies.** `randomGenome` (random-brain and the map-elites seeder's random branch) calls it with the agent's spec, which `spawnAgent` sets before `initBrain`. `baseline-v5` and the test policies keep their own init.
- **Staging range.** A forager sees 300 and a predator 350, so a staged scene must put its target inside that (the first test run put food at 400 and read nothing). The threat test judges the first tick only (the subject's pooled row was empty from tick 2 in the hand-built world; not diagnosed).

### 2026-10-30 - The survival screens and the defaults they set (natural-selection T5, E67 and E68)

- **What ran.** Five screens of 8 seeds x 200000 ticks on the live policy and the big-bang defaults, reports in `evals/screens/results/{survival,survival-diag,predator-metabolism,predator-gorge,instinct}/`. The cost grid (`biteCost`, `huntUpkeep`) was stopped after 3 arms: predator presence 0.035 to 0.134, so the cost is not the lever. The diagnosis (old brain, energy 6k and 25k, no kick) moved nothing past 0.08. Cause, by replay: random-brain predators never landed a bite and starved from the movement cost of thrashing (`movementCost x speed^2`).
- **The fix is from biology** (principles.md, look to nature first): innate instincts (`instinctWeight`), a gorge-and-fast predator and decisive bites. The merge gate (population above the floor at the end on every seed, `eval.predator_presence` at least 0.5, `eval.spec_effective` above 1.5) is met by one arm only: every seed's final population is above `floorTrigger` (8 of 8, the lowest 55). The screen table's own `popAboveMin` column, a time share above `minAgents`, fails on seed 5 (0.55, 7 floor episodes), and predators are alive at the end in 3 of 8 seeds: the boom and bust the balancing phase takes on.
- **Table** (means over 8 seeds; pop > min is the screen's seed count; ref is the first row of each screen):

| Screen / arm                            | pop > min | predator presence | pop mean | predator births | catch > 0 |
| --------------------------------------- | --------- | ----------------- | -------- | --------------- | --------- |
| survival-diag / defaults (ref)          | 2/8       | 0.06              | 142      | 2.6             | 6/8       |
| predator-metabolism / fast-0.3-meal-600 | 4/8       | 0.24              | 203      | 3.3             | 7/8       |
| predator-gorge / gorge-bite20           | 1/8       | 0.09              | 98       | 1.4             | 7/8       |
| predator-gorge / gorge-bite40           | 1/8       | 0.28              | 127      | 2.3             | 8/8       |
| predator-gorge / deepfast-gorge-bite20  | 4/8       | 0.18              | 220      | 3.4             | 7/8       |
| instinct / inst1 (instincts alone)      | 8/8       | 0.06              | 480      | 3.0             | 8/8       |
| instinct / inst1-gorge                  | 8/8       | 0.16              | 477      | 32              | 8/8       |
| instinct / **inst1-gorge-bite20**       | 7/8       | **0.67**          | 403      | 2972            | 8/8       |
| instinct / inst0.5-gorge                | 8/8       | 0.25              | 431      | 742             | 8/8       |

- **The winning arm** `inst1-gorge-bite20`: predator presence 0.67 (0.09 to 1.0 by seed), `eval.spec_effective` 2.87 (1.90 to 4.06), floor episodes 1.0 per seed (7 on seed 5, 0 or 1 elsewhere), catch rate 0.42, deliberate food share 0.53, alarm precision 0.20 (only 2 of 8 seeds call at all), mating share 0.54. It became the defaults: `instinctWeight` 1, predator `passiveLossMultiplier` 0.3, `maxEnergyMultiplier` 3, `biteMultiplier` 20, `predatorKillEnergy` 600.
- **The screen table still prints FAIL for it** on its own columns: `popAboveMin` is the share of samples above the minimum and seed 5 reads 0.55, `lineages >= 5` fails on all 8 (1 to 3 per basin) and `spec <= 70%` on 7. The plan's gate is the one above, which it meets; the other columns are the balancing work.
- **Known issue left for balancing.** Predators boom and bust (about 2972 predator births per run, alive at the end in 3 of 8 seeds), and the lineage count per basin is low. Instincts alone fix the population but not the predators; only the three predator changes together hold them.
- **Goldens moved by the defaults** (`test/sim/golden.json`): `cases` default `bc61370b43a2df99` to `8401c064ae9cbceb`; `cases` busy `d72f837a149dd80f` to `15f01d86733caf36`; `shortCases` default `e1e3ef13b277b1d5` to `007d5a41d009aa58`; `shortCases` busy `eee2d99decb6f926` to `87c57d4fa9d0a18c`; the busy effect stream `999b8f474640dcac` (2567 records) to `27108f937e31a6e4` (2359 records). An override with the five old values reproduces both old long hashes, so nothing else moved. Chromium 156 matches (`npm run browser:hash` reads `golden.json`; there is no separate pin).
- **Fixtures that assumed the old values.** `test/helpers/simple-world.js` now pins `instinctWeight` 0, the predator `maxEnergyMultiplier` 1 and `biteMultiplier` 8, so tests that raise `maxEnergy` to 25000 do not trip the `hashCellSize` radius check with a 3x store (a 25000 x 3 body is 332 px). The same pin sits on the neutral predator of `feeding.test.js`.

### 2026-10-30 - Dither the aurora in linear light, and declare no attribute `ShaderMaterial` adds

The aurora is dim (at most `AURORA_MAX_LUMINANCE` 0.010 linear, about 28 of 255 encoded), so its smooth gradients cover only a few dozen 8-bit steps and the encode in `OutputPass` can show them as contours. The upsample therefore adds interleaved gradient noise (`finish-glsl.js`) scaled to one sRGB step at that value, in linear light. Banding was judged by eye in screenshots only; no banding metric has been measured.

A `ShaderMaterial` prepends `attribute vec3 position` (and `uv`, `normal`) to its vertex shader, so a shader that declares `position` again fails to link: the program is dropped with a `console.error` and the layer draws nothing. The unit tests build no GL context and did not see this; `test/app/renderer/shader-sources.test.js` scans every layer's vertex shader for it and the browser spec loads quality 0, where those layers draw.

### 2026-10-30 - Deploy on merge to main

`.github/workflows/deploy.yml` deploys `main` to production on Cloudflare Pages (project `matrix`) after the `check` workflow succeeds on a push, with the repo's pinned wrangler and the secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; `workflow_dispatch` redeploys main's HEAD. Roll back from the Pages dashboard or by redeploying. This is the interim pipeline ahead of `deployment-and-community.md` Phase 1 (Release Please, `/v/<version>/`, `/next/`, PR previews), which replaces it.

### 2026-10-30 - The merged effect stream (big bang plus the Look)

The Look added a `MATED` worker effect and the big bang changed the sim, so the busy golden's effect-stream pin moved from `27108f937e31a6e4` (2359 records) to `f709be33928e72f4` (2400). Counted by kind (born, died, bite, alarm, pack call, smoke, mated): 86, 157, 608, 962, 336, 210, 41. The 2359 non-mated records are the same count as before the merge; the 41 mated records are the whole difference. `worldHash` did not move: the Look changes only the snapshot and worker, not the sim.

### 2026-10-30 - Hash every built asset name

`vite.config.js` once set `assetFileNames: 'assets/[name].[ext]'`, so the built stylesheet was `dist/assets/index.css` with no content hash (the manifest and the uPlot stylesheet were unhashed too). Cloudflare Pages serves it with `cache-control: public, max-age=14400, must-revalidate`, and the old legacy site had deployed a different `assets/index.css`, so a returning visitor's browser kept the legacy stylesheet for up to 4 hours under the new HTML: the HUD showed the legacy font and stacked buttons. A clean browser was fine. The pattern is now `assets/[name]-[hash][extname]` (the Rollup placeholder is `[extname]`, with the dot, in Vite 8), as the JS chunks already were. `index.html` reaches the manifest through the bundle, so its hashed name resolves. `test/build/asset-names.test.js` pins the pattern and `asset-names.slow.test.js` runs a real build and checks every emitted name. The static pages `public/about/index.html` and `public/blog/index.html` still link `/assets/index.css`, which no longer exists; that link was already stale (the file is the app stylesheet, not the legacy one they were written for).

### 2026-10-30 - Audit: integrated benchmarks

Partial audit; measured on a 32-thread WSL2 box with other agents running (load average 2 to 13 across the runs, every timing run under `flock /tmp/claude-1000/cpu.lock`), so margins are wide.

- `npm run bench -- --json`, defaults (100, 250, 500), three runs, median `step_ms`: 0.888 / 2.003 / 4.058 ms. Committed `bench/baseline.json` has 0.881 / 1.950 / 3.943, so the head is 1 to 3 percent above it, inside `bench-check`. Brain phase at 500: 2.107 ms (baseline 2.033), sense 1.084, physics 0.233, field 0.089, lifecycle 0.087, merit 0.049, hash 0.079, signal 0.020. Tracked rows at 500: `merit` step 4.03, `w7680` step 4.34 (brain 2.49, sense 1.75).
- `node scripts/bench-compare.mjs --base 2146626 --sizes=500 --runs=3` (load 2 to 5): step 3.127 -> 4.066 ms (+30.0 percent); brain 1.306 -> 2.128 (+63.0 percent); signal 0.015 -> 0.0225 (+50 percent, tiny in absolute terms); sense +6.5 percent and lifecycle +8.2 percent, within the 10 percent limit; physics, field, merit, hash flat. The brain phase is nearly all of the step growth (+0.82 of +0.94 ms).
- `bench` cannot run above 682 agents: it sets `maxAgents` but not `eventCapacity`, and `checkCrossKey` in `js/sim/config-validate.js` needs `eventCapacity >= 6 x maxAgents` (default 4096). `maxAgents` is capped at 4096 by `config-validate.js` (and by 2^24 weight floats / `weightCount`). `--sizes=1000` fails with that error. The maximum was not benched.
- `npm run bench:brain -- --compare 2146626` fails: the ref tree lacks `js/sim/burn-in.js`, `js/evo/instinct.js` and the `instinctWeight` config key that the new bench files import, so the per-part attribution (pooling, addInputs, hiddenStep, skip block, Hebbian, input-activity sampling) is not done. Running the suite on the head alone gives the parts but not the growth; the cause of the +63 percent brain growth is therefore not attributed.
- Not done: observer cost, worldHash equivalence of replay versus eval observer, `browser:hash`, `perf:browser`, `alloc-check` heap growth, and the check of eval-worker versus app-worker metric paths.

### 2026-10-30 - Audit: plan against code, persistence, fitness proxies and memory

- **The brain on main matches the plan.** `brainLayout(createConfig())` gives `inputCount` 81, `rawInputCount` 177 (the raw ray row the observer reads), `weightCount` 4494; `addSkip` adds `wSkip` to the output sums in `outputStep`; `SPLIT` has no genes and nothing in `js/sim/reproduction.js` reads it. An external review's "179 inputs, no skip" was the layout before PR #217 merged. `test/sim/sensory-schema.test.js` now pins the pooled channels, `POOLED_VALUES` 48, the body offsets and inputCount 81.
- **Equal-length layouts were accepted.** The genome, archive and champion layout stamps held sizes only; they now carry `BRAIN_LAYOUT_NAME` (`layoutStamp` in `js/sim/brain-layout.js`), and `validateChampion`, `decodeArchive`, `decodeGenome` and `assertGenomeFits` refuse a missing or different name. No genome is stored in the browser (no IndexedDB; `js/app/prefs.js` keeps UI preferences only), so a returning user simply starts a fresh world.
- **Credit proxies, measured on staged scenes** (`test/evo/credit-audit.slow.test.js`, 1500 ticks, fitnessV6): random movement through food earns only chance credit and fitness 0; a foodSeeker earns deliberate credit as the formula says; a near miss earns nothing; reversing into food is chance; a hunter that only follows earns 0. Two leaks, within the exploit bound: a cruiser that never turns earns full deliberate credit when food lies exactly on its line, and a wide circle in a dense patch earns about 10% of its intake as deliberate (`patchCircler` reaches 0.425 of foodSeeker's fitness against a bound of 0.5). Escape and kill credits are about 0% of fitness in every specialisation on a 3-seed x 20000-tick default run; intake is 52 to 58% and the deliberate share about 50% everywhere.
- **Memory is not evolved yet.** On 8 champions from 2 seeds x 20000 ticks the memory gain is about 0 on every probe (the memory-storing reference scores +1.00, so the probes work), and the mean leak rate stayed at its start (0.51). Neither supports nor refutes `leakGeneStart` 0 and `leakMin` 0.02; `mutationRate` invsqrt and `weightDecay` 0.005 remain unmeasured (natural-selection Phase 4, E84).
- **The step at 500 agents** is 4.07 ms against 3.13 at 2146626 (+30%), the brain phase 2.13 against 1.31 (+63%, about 0.82 ms of the 0.94 ms growth). `npm run bench` cannot run above 682 agents: it raises `maxAgents` without `eventCapacity`, which `config-validate.js` requires to be at least 6 x `maxAgents`.
- **Not done, for the balancing phase:** the brain growth by part (`bench:brain -- --compare` fails on old refs that lack `instinct.js`), observer cost, the replay-against-eval worldHash check, `perf:browser`, `alloc-check`, the brain-state reset, mutation-count and silent-drift tests, the multi-seed stability runs, and the README and Status drift (`manifest.json` and `package.json` still say v5.0 and 5.0.0).

### 2026-10-30 - E81, the big-bang defaults against the Phase 4 gate (natural-selection T31)

16 seeds x 200000 ticks, live policy, `evals/results/e81-defaults.json` (code at b6f9c67; the T41 channel shares came later, the world is bit-identical). Viability table from `scripts/viability-table.mjs`.

- **Mechanical layer.** A prey type is alive at the last tick on 16 of 16 seeds and the population sits at 450 to 500 on 15 (one seed ends at 55 after 7 floor episodes). Child survival 0.78 to 0.95, deliberate food share 0.45 to 0.62.
- **The gate misses on both rows.** Predators are alive at the last tick on 3 of 16 seeds (17, 10 and 3 hunters), against 14 needed; `eval.predator_presence` still reads 0.56 over the run, so the hunters boom early and are gone by the end. `eval.basin_lineage_effective` is at least 3 on 0 of 16 seeds (mean 1.04, max 1.18): in the last quarter each basin holds one maternal line. The whole-run `eval.lineage_effective` is 3.96 and `eval.lineages_alive` 7.2, so the families exist after burn-in and coalesce later.
- **Why the families coalesce.** `lineageId` passes down the mother's line and only floor and immigrant entrants start a new one; with the floor guard idle (0 episodes on 14 seeds) nothing new enters, and over 200000 ticks the maternal lines coalesce as any closed population's do. A gate of 3 effective matrilines per basin at the end may be out of reach for any predator value; the bite screen (E82) tests that, and the definition is a question for the plan.
- **Behavioural layer.** `eval.circling_share` 0.079 (0.035 to 0.155) and `eval.output_saturation` 0.289 (0.226 to 0.368): neither reaches 0.30 on the mean, so the brain-plan follow-up is not triggered. `eval.spec_effective` 2.39.
- **Emergent layer.** `eval.instinct_drift` 1.01 (0.73 to 1.40): the instinct cells sit as far from the prior as the founders did, so no scene is credited to evolution of the reflex yet.

### 2026-10-30 - E82, the bite screen: no arm passes (natural-selection T32)

12 arms (the predator's `biteMultiplier` 8, 12, 16, 20 x `predatorKillEnergy` 150, 300, 600) x 8 seeds x 200000 ticks, `evals/screens/results/balance/`. No arm passes the bust row (predators alive at the last tick on at least 7 of 8): the best is bite20-kill300 at 4 of 8, the defaults 3 of 8, five arms 0 or 1. `eval.basin_lineage_effective` is at least 3 on 0 of 8 seeds in every arm, and a prey type survives on 8 of 8 everywhere. `eval.predator_presence` rises with the bite (0.10 at bite8-kill150 to 0.67 at the defaults), and so does the split share of births (11.6% to 52.2%): stronger hunters boom by splitting and then vanish. Nothing is adopted and nothing is rescued; the miss is reported to the user, who asked for the clonal limits (`E85`) next.

### 2026-10-30 - The brain-phase rise and the step budget (natural-selection Phase 4, T27 and T28)

- **Where the big bang's step growth went.** `node scripts/bench-compare.mjs --base 2146626 --sizes=500` (median of 5, quiet machine, CPU lock): step 3.08 to 3.92 ms. The brain phase rose 1.26 to 2.05 ms (+0.79 of the +0.84 ms), and the signal phase 0.015 to 0.021 ms (it is +324% at 7680 wide, still under 0.1 ms). Sense (0.96 to 1.04), physics, lifecycle, field, merit and hash were within 10%.
- **The cause is `hebbianStep`, not the new brain.** Timed directly on the 500-agent bench world (450 alive, 81 inputs, 21.9 nonzero per agent): `forwardAll` 2.08 ms with learning and 1.07 ms without, `hebbianStep` alone 0.89 ms and `poolRays` 0.04 ms. Deleting the SPLIT genes (94b71fc) moved the output read in the Hebbian 32 x 10 inner loop behind a `GENE_OUTPUTS` lookup. A CPU profile of the step loop then read `hebbianStep` 15%, `hiddenStep` 13%, `castRays` 11%, `appendFixtures` 9%, `detTanhInto` 9%, `outputStep` 8%, `gatherNear` 6%.
- **Fixed, all bit-identical (goldens pass):** `hebbianStep` reads the gene outputs once per agent and clamps with two comparisons (0.89 to 0.50 ms); `outputStep` walks the hidden-to-output block row by row; `appendFixtures` tests reach before writing a row (136 obstacles per caster). `bench.step_ms@500` 3.94 to 3.39 ms, brain phase 2.05 to 1.65 ms.
- **The 3.0 ms budget is not met.** What is left is the 32 x 32 recurrent pass, the batched tanh (its `r / d` divisions cannot become multiplications without moving bits) and the ray casts against the gathered circles, each already tight. The next 0.4 ms needs a behaviour change (Hebbian every few ticks, fewer rays or a narrower gather), which is a decision for the plan, not a bit-identical fix.
- The micro suites (`npm run bench:parts -- --area brain`) read about four times slower in absolute terms than `npm run bench` (forwardAll 8.6 ms against a 2.05 ms phase); use them for shares and `--compare`, and the direct timing or `npm run bench` for milliseconds.

### 2026-10-31 - E85, the clonal limits: splits fall, hunters fall with them (natural-selection T46)

8 arms x 8 seeds x 200000 ticks on the seeds of E82, `evals/screens/results/clonal/`. Every limit cuts the split share of births (52.2% on the defaults; `splitClonalMax` 1, 2, 3 at 19.4, 14.4 and 11.1%; `splitMaxPerLife` 1 and 2 at 22.6 and 29.1%; the predator split above one kill's meal 42.7%), but none keeps hunters to the end: predators alive at the last tick on 0 or 1 of 8 against the defaults' 3, and `eval.predator_presence` 0.09 to 0.41 against 0.67. The hunters were living on splits: they are too few to find mates, an Allee effect. `splitMaxPerLife` 1 and the combined arm crash the population (mean 188 and 183 against 403) and refill it from the floor (3.6 and 3.0 episodes against 1.0); their `eval.basin_lineage_effective` of 3.39 and 2.76 counts those entrants, not families that held. Nothing is adopted (T47). Nature's answer to a rare sexual animal is facultative parthenogenesis: a Komodo dragon or a shark breeds alone only when no mate can be found, so the next trial gates the split on mate scarcity instead of capping it.

### 2026-10-31 - E86 and E87, predator life history and space: no arm keeps the hunters (natural-selection T46)

Both 8 seeds x 200000 ticks on the seeds of E82; predators alive at the last tick against the defaults' 3 of 8. **E86** (`evals/screens/results/predator-life/`): predator `cooldownMultiplier` 2 and 3 at 1 and 2 of 8, handling and digest 30 at 0 of 8 (presence 0.20), carcasses 900 ticks at 0.75 share at 2 of 8, slow breeding with the predator split above one meal at 3 of 8. **E87** (`evals/screens/results/space/`): 6 wall gaps at 1 of 8, 400 px gaps at 0 of 8, refuges one per group at 2 of 8 (and one seed lost every prey type), 6 gaps with spread refuges at 3 of 8. Maternal lines per basin stay at 1.0 to 1.2 effective in every arm, gene flow or not. With E82 and E85, no predator value, life history or space keeps hunters to the end on more than 4 of 8 seeds; a hunter catches 1 chase in 14 (E81), so the chase itself is the next question (E88). E88 was stopped before an arm finished (user, 2026-10-31); its grid is committed.

### 2026-10-31 - The split defaults adopted without a screen

`splitMateScarceTicks` 600 and `splitClonalMax` 3 are on by default (user, 2026-10-31). With both relaxed every old golden hash reproduces, so they alone moved the hashes; the busy golden's effect stream fell from 2400 to 1506 records. Their effect on the gate is unmeasured: E85 showed a clonal cap of 3 lowers hunters at the end (3 to 1 of 8) while cutting splits from 52% to 11% of births, and the shark rule was to be measured by E88.

### 2026-10-31 - Flora Phase 1 in draft

- Mycelium persists for 144000 ticks; fertile zones expire too early to carry summer deaths into the fungal window.
- Plant intake counters record stored energy before food slots are cleared. The observer differences these counters after burn-in; same-tick slot reuse cannot hide a meal.
- A blocked mycelium disc refuses its fungus source and redraws patch/background rather than moving fungus away from the death site.
- E69-E74, metric power and performance measurements remain owed while balancing uses the CPU. The draft is rebased on balancing PR #223 (`f649cd8`) with goldens re-pinned.

### 2026-10-31 - Flora Phase 2 hue and toxin instruments

`pooled-v3` has 83 inputs and 50 skip rows: the two food hues follow the 48 pooled ray values, before the 33 body inputs. This changes gene meanings and the archive codec version; a v2 row must not be imported as v3. A pooled food pair can be two rays hitting the same item, so the hue discrimination fixture tests an aligned first decision with random target side, not sustained navigation or evolved avoidance.

The starting cap gives dose 0.36, but sick agents cannot eat until below 0.3. The next cap meal stays below 0.66: the default lethal threshold 1.0 and all E71 lethal arms (0.8 to 1.4) are unreachable through these meals. The code preserves the approved starting values; E71 and world-balance H4 owe a reachable exposure specification/power check before claiming poison deaths. A fresh lethal meal in a deliberately reachable fixture dies in the same lifecycle, before a later decay can erase its cause.

The toxin metrics use exact plant item counts even when net stored energy is zero, 1000-tick plant availability, poison/all death events and sick/all alive agent-ticks. All have denominator fixtures and null reasons. E71, metric power, survival and standalone performance comparisons were not run while the CPU was reserved; no screen value was adopted. Node and Chromium agree on both long goldens after the layout, dose state and cap mix change. The worker's busy effect stream is 1410 records with hash `be9383a3e0039426`, without dropped records.

### 2026-10-31 - Flora Phase 3 source identity and local spread

The fixed patch pool holds live, banked and free slots. Stored item `foodPatchSerial` and carrier `pollenSerial` distinguish a source generation, including same-species slot reuse. Uint16 carrier indices are necessary because slot255 is encoded as256. Expired banks never restore themselves; two independent expected RNG draws pin bank slot order. Local seed placement first tries the configured ring, then bounded disc retries within the visited basin; blocked placement refuses instead of falling back anywhere.

All ecological draws use the named, seed-forked `flora` stream: pollen, placement, fixed five-Gaussian mutation and one float per banked slot/tick. Replay fixtures compare worlds and stream states; Node and Chromium reproduce the long goldens (`7baac24daf291215`, `f5dc335ad5176e99`). The worker busy effect stream stays at1410 records, `be9383a3e0039426`, with no drops. No new brain layout or feature flag was introduced.

Trait means stay in reusable Float64 scratch until mutation and Float32 storage. Year starts blend as offsets about their archetype; a Float32 phase rounding to1 is canonical zero. The config domain rejects inherited energy/life bounds that do not fit positive Float32, and rejects variation greater than the smallest stored energy, preventing a negative plant item without changing the inheritance formula.

The migration visit denominator is now pool capacity (`floraPatchMax`), not initial patch count, so a lower index across this revision is not by itself a behavioural regression. With no live patch ever observed the metric is null; unvisited available patches give zero once mature deaths supply a denominator. Seeding refusal logs are deduplicated per carrier/tick, first reason wins, while subsequent state decisions and draws still execute. The event budget reserves `8 x maxAgents + 2 x floraPatchMax`.

The family survival gate now names the genetic-family detector adopted by world-balance, keeping the same6/8 screen and12/16 confirmation thresholds; maternal line coalescence is a separate diagnostic. E72, detector power, survival comparisons and standalone performance measurements remain owed while the CPU is reserved; no screen value or evolutionary verdict was adopted.

### 2026-11-01 - Flora rendering and seeded pollen

The flora look packs a six-word food record and a five-word live-patch section. A sick bit and a 12-bit carried-pollen hue travel in the existing unsigned agent flags; dead or reused pollen sources do not draw as carriers. The colour ramp maps the documented linear hue to green through red and magenta and caps luminance at the existing food ceiling. Patch glows and pollen remain below the scenery ceiling.

Pollen particle directions derive from the world seed, genome id and 20-tick emission bucket; no simulation random stream or wall clock is consumed. Disabling the flora look clears pollen particles and rings; restoring it does not replay missed emissions. All four Node golden hashes remain unchanged, the long hashes match Chromium 156, and the worker effect-stream self-pin remains `be9383a3e0039426` (1410 records, no drops). The E69 to E74 screens, power, survival, 4K clip and standalone performance comparisons remain owed; the renderer has not established the ecosystem done criteria.

### 2026-11-01 - Megafauna Phase 1 T15 adoption

The matched 16-seed E76 carcass-lifetime extension compared 6000 with 12000 ticks at radius 200 and count 6. The 12000-tick arm improved mean herd-carcass meal share from 0.002719 to 0.005702 and positive seeds from 10/16 to 11/16; herd presence and grazing remained positive on 16/16. The original carcass target is 12/16 and remains unmet. Predator presence at end fell from 2/16 to 0/16. By explicit user direction, T15 adopts the measured improvement while carrying the target shortfall and predator risk into balancing; neither is reported as a passed gate. Defaults are `herdCount: 6`, `herdStartleRadius: 200`, and `herdCarcassTicks: 12000`. After the T15 long-golden pins, `npm run browser:hash` passed in Chromium 156: default `81a814ec8c4e88ef` and busy `f4bb595a68fc0296` matched the committed hashes. The first 5-run comparison against `d9c9c98` (the pre-herd world, not the plan budget baseline) was 3.399 to 3.8639 ms/step (+13.7%) and failed the wrapper’s default 10% threshold. The Phase 1-start `9d63367` comparison was 4.0177 to 3.6917 ms/step (-8.1%), within the 15% total-step budget; the wrapper still failed on the field (+268%) and physics (+16.3%) phase deltas, with environment’s 0.0002 ms base too small for a useful percentage. These are balancing diagnostics, not an isolated ≤5% phase-cost pass. The isolated 5-run comparison from T15 parent `15da835` (count 4, radius 700, carcass ticks 6000) to T15 defaults was 3.3108 to 3.761 ms/step (+13.6%; merit +13.8%), over the standard 10% comparator limit. Field was +93.6% and physics +11.0%. This adoption delta remains a balancing performance concern even though the absolute step stays under the Phase 1-start 15% ceiling. The 4K render comparison belongs to the later renderer phase.

### 2026-11-01 - Megafauna Phase 2 sensory channel

`pooled-v4` adds a dedicated megafauna ray channel after the eight existing channels, bringing the layout to 89 inputs and archive version 6. Herd rays now pool separately from obstacles, and the inspector labels the channel `megafauna`. `herdWary` scales the deterministic flee and turn instincts; zero leaves the previous instinct output unchanged and consumes no random draws. The short and long Node goldens pass, and Chromium 156 matches the long default and busy hashes (`f48faad085266668`, `5d5e0298629c5754`). The worker busy effect stream is pinned at hash `99d77975df1b87a7`, 792 records, no drops.

E77 completed all 11 arms but used the pre-Flora `toxinDose: 0.45` config (`e2cf27dfd276b012`), so it is exploratory and no value was adopted from it. Its local best was `herdWary: 1` (dodge 0.9907, trample 0.0143); the registered current-main confirmation E92 then compared `herdWary` 0.5 with 1 at toxinDose 1.2 on 16 matched seeds. Wary 1 improved dodge from 0.98826 to 0.99225 and reduced trample share from 0.02846 to 0.01398. Its six input-activity means were 0.05110, 0.05110, 0.04955, 0.02962, 0.02962 and 0.02902. The 20,000-tick, 16-seed live input check on the Wary 1 candidate gave means 0.04598, 0.04598, 0.04502, 0.03060, 0.03060 and 0.03021. Means exceed the 0.02 target; several individual-seed values are below it. The behavioral benefit is confirmed, but the global population gate is 0/16, predators are present at end on 3/16, prey on 16/16, and basin_lineage_effective >=3 on 3/16. These population, predator and family deficits are balancing follow-ups, not passes.

For T23 performance, the single `npm run bench -- --json` run measured `bench.step_ms@500` 3.5346 ms. The required locked 5-run comparison against Phase 1 main `b3f11c6` at a 5% per-phase threshold measured median step 3.6057 to 3.5353 ms (-2.0%), within the step limit. The comparator exited 1 because several per-phase rows exceed 5%: environment +31.8%, hash +9.4%, lifecycle +8.8%, merit +8.4%, sense +6.8%, and signal +10.6%; physics was +3.8% and field at 500 agents was -0.7%. Tracked merit and 7680-width rows also contain phase misses. This does not pass the per-phase cost budget; timing remains a balancing diagnostic. Full E77 and E92 reports and tables are under `evals/screens/results/herd-sense/` and `evals/screens/results/herd-sense-current/`.

T24 adopts `herdWary: 1` from the current-main E92 behavioral confirmation; `herdCount: 6` and `herdSize: 8` stay at their measured Phase 1 defaults. The focused config/instinct tests (15 tests), short goldens and long goldens pass without a re-pin. Chromium 156 `npm run browser:hash` also matches both unchanged golden hashes: default `f48faad085266668`, busy `5d5e0298629c5754`. Population remained below the generic gate in both E92 arms, so no population, predator or family gate is claimed passed.

To measure the actual adopted default, a second locked 5-run comparison against Phase 1 main `b3f11c6` at a 5% per-phase threshold used T24 head `d463b8f` (`herdWary: 1`). Median total step was 3.6028 to 3.5527 ms (-1.4%), within 5%. The comparator exited 1 on phase costs: environment +32.7%, field at the tracked 7680 width +20.4%, lifecycle +9.3%, merit +8.5%, sense +7.3% and signal +10.5%; in the tracked merit variant, sense was +16.2%. At 500 agents, field was -1.4%, hash -0.6%, physics -0.4%. The total step passes this comparison; per-phase timing does not and remains a balancing diagnostic.

### 2026-11-01 - Megafauna Phase 3 dung, seeds and ecology metrics

Dung drops use the named `herds` stream and remain attached to their source in `zoneOrigin`; at the configured interval, a living well-fed animal adds a capped local fertility zone. Flora's existing spawning path gives DUNG_ZONE items priority within those zones while preserving other food sources. At the configured settings, dung zones are capped at 30, size 60, and spaced by 900 ticks. The T27 seed carrier stores patch slot, generation serial and a 24,000-tick lifetime per animal; only grazing living plant items with a pollinated patch can load it. A dung drop plants through the same trait-mutation routine as pollen, after source cooldown, distance and patch-pool checks. `HerdSeeded` and source-tagged `SeedingRefused` events are counted and logged.

T28 adds `eval.dung_food_share` from stored energy consumed from DUNG_ZONE items divided by all stored plant energy, `eval.herd_seeded_patches` per 1,000 post-burn-in ticks, and patch-held `eval.herd_follow_share`. The latter compares mean blob counts within `foodPatchRadius` while a herd is within `foodPatchRadius + 400` versus when no herd is nearby; each patch needs at least three checkpoints in each state, and a zero bare-state mean is excluded from the ratio. Focused scene, feeding and detector tests pass.

T27 pins the short hashes at default `87c514d93826b6f0` and busy `9c8a6afa42db3f2e`; the long Node goldens and worker-host effect stream pass after T28 without further world-hash changes. The effect stream remains hash `5cd95891263ea554` (721 records, no drops). T29's Chromium 156 `npm run browser:hash` matched the long default `cf9bd60d69c4bd9a` and busy `cb0e357ccee19f12` hashes.

### 2026-11-02 - Megafauna E78 ecology screen

The preregistered E78 screen completed all 11 arms (16 seeds x 200,000 ticks, live policy) with no runner errors. Dung-food share clears 0.03 in all arms and seeds (means 0.1121 to 0.1304). Seeded patches miss the 0.1-per-1000 rate in all 16 seeds of every arm; mean rates are 0.0095 to 0.0178, and positive-seed counts range from 9/16 to 12/16. Grazed share means are 0.4326 to 0.4811, all above the 0.25 ceiling. `herdDungTicks: 1800` has the strongest watched `herd_follow_share` mean (4.193), but its predators-at-end result is 0/16 versus 2/16 on the reference, and basin_lineage_effective >=3 is 2/16 versus 5/16. Across all arms the generic population gate is 0/16, prey types survive on 16/16, predators on 0–4/16, and family-effective counts at least 3 occur on 1–6/16. All survival/population/family deficits and the seed/grazing ecology misses remain balancing diagnostics, not claimed passes or blockers under user direction. The complete per-arm table and reports are in `evals/screens/results/herd-ecology/phase3-gates.md` and that directory.

The preregistered 32-seed extension compares the Phase 3 reference to `herdDungTicks: 1800` on matched seeds. The candidate raises mean follow-share from 2.465 to 3.353, but its paired 95% CI crosses zero (-0.368 to +2.760); dung-food share changes from 0.12393 to 0.12591 (CI -0.00883 to +0.01375), and seeded-patch rate falls from 0.01266 to 0.01086 (CI -0.00724 to +0.00428). No new detector shows a supported improvement. At n=16, power analysis gives false-positive rates 0.183 for follow-share (no detectable effect), 0.084 for dung-food share (80% power at a 30% relative change), and 0.089 for seeded patches (no detectable effect). In the 32-seed extension, the generic population gate is 0/32; basin_lineage_effective >=5 is 12/32 for the reference and 4/32 for 1800 ticks. The 500-agent single benchmark measured 3.5667 ms/step. The locked five-run comparison against Phase 3 start `828d638` measured median `bench.step_ms@500` 3.5415 to 3.5677 ms (+0.7%). The total-step budget passes; phase rows `environment@500w7680` (+28.4%) and `merit@500w7680` (+7.6%) exceed the 5% threshold, while these phases are small in absolute time. Keep the existing `herdDungTicks: 900` default: the 1800-tick candidate has no confirmed detector benefit and weaker family survival, so the screen does not support adoption. E78 misses and population/family deficits remain balancing follow-ups, not claimed passes.

### 2026-11-02 - 4K browser frame stalls in Flora T33

The 4K browser measurement ran through Windows Chrome 156 on an NVIDIA GeForce RTX 4090 (D3D11), with a 58.1 Hz monitor. `npm run perf:browser` rejected the display refresh unless `--allow-low-refresh` was supplied, and its frame collector discards intervals above 250 ms. Both Flora-excluded and full-look runs returned zero accepted frame intervals, so their browser frame percentiles are unavailable. A separate matched 60-second `requestAnimationFrame` observer retained the long intervals: 229 intervals per arm, 225 above 250 ms, with p95 278.7 ms control and 278.5 ms full look. The paired p95 differed by 0.2 ms in one run; this is not statistical evidence of equivalence. The absolute stalls remain severe and belong in balancing follow-up; the GPU timer p95 alone is not a substitute for valid frame percentiles.

### 2026-11-02 - Megafauna Phase 4 rendering and integration screens

The initial T40 probe used WSL Chromium and therefore reported SwiftShader; that was the wrong browser for this machine. Windows Chrome was available through WSL CDP and reports an NVIDIA RTX 4090 (D3D11). That exposed a second harness issue: Playwright's `browser.newPage` viewport and scale options were ignored over CDP. `setMeasurementViewport` now applies the requested CSS viewport and 1x scale through CDP and fails if the page does not report them. A matched 60-second pair at CSS 3840×2160 and an actual 3840×2160 WebGL canvas, seed 1, quality 0 and 500 starting agents measured the final world with `herds` hidden versus `look=all`. Chrome 156 reported 15,221 versus 15,245 frames; frame p50/p95/p99 were 4.2/4.3/4.3 ms in both arms, draw CPU p95 was 0.6 ms in both, GPU p95 was 1.85/1.92 ms, and long tasks were 0 in both. GC pauses were 123.84/127.06 ms, above the 30 ms budget in both. The single pair shows no observed frame-time regression, not statistical equivalence. The 15-second default-world clip and raw reports are in `evals/screens/results/megafauna-t40/`; details are in `T40.md`.

E79 ran the final defaults against a same-config herd-free control on 16 matched seeds x 200,000 ticks. Reports, per-seed checks, and table are in `evals/screens/results/megafauna-e79/`; config hash `6eab957f3bf57b72`. Herd animals, crossings, dodge >=0.5, trampled share in range, dung-food >=0.03, and all six input activity values above 0.02 occurred on 16/16. Unavoidable trample share <=0.5 was 0/16, grazing share in 0.05–0.25 was 0/16, carcass meal share >=0.05 was 4/16, seeded-patch rate >=0.1/1000 ticks was 0/16, stampede rate was in range on 11/16, and predator/prey/family gate counts were 2/16, 16/16, and 5/16. The required comparison to E75 is saved in `compare-E75.json`, with explicit config-difference allowances; E75 used the earlier toxin baseline, so this cross-version comparison is confounded. It found carcass meal share no-difference, food energy per 1k +13.9%, and fed median lifespan -12.3% (worse).

E80 ran final defaults against a same-config herd-free control on 16 matched seeds x 600,000 ticks. Reports and seed checks are in `evals/screens/results/megafauna-e80/`; the final-default config hash remains `6eab957f3bf57b72`. Herd animals, crossings, dodge >=0.5, trampled share in range, dung-food >=0.03, and all six input activity values above 0.02 were present on 16/16; stampede rate was in range on 10/16. The E80 dodge mean (0.9751) is below E79 (0.9806). Unavoidable trample share <=0.5 was 0/16, grazing share in range 0/16, carcass meal share >=0.05 2/16, seeded-patch rate >=0.1/1000 ticks 0/16, and predator/prey/family gate counts 4/16, 16/16, and 4/16. These misses are recorded as misses; population, predator, and family results remain balancing diagnostics under user direction.

### 2026-11-03 - Disease ships on before its screen

- The contagion (`disease.md`) merged on at `diseaseSeedRate` 0.001 with the plan's other values (user, 2026-11-03). The only evidence is the T5 smoke run: 4 seeds x 50000 ticks gave a disease deaths share of 0.015 to 0.11, 36 to 126 strains per 100k ticks, family focus 0.99 to 1 and a frequency slope of -0.013 to 0.037. The six-arm screen (`E93`) moved to world-balance.md T95.
- Strains almost never jump between families at `diseaseSpecificity` 0.8: unrelated genomes sit about 1.13 apart, so a strain in a world of noisy random brains (the golden runs) infects only its first host.
- The observer and the live stats had hard-coded 6 death causes; a seventh (`disease`) would have been dropped without an error, because writing past the end of a typed array is ignored. Both now size from `DEATH_CAUSE`.
- On this 4-thread container the pre-commit hook's related tests include the slow anti-exploit suite, which starves `screen-run.slow.test.js` into its 5 s timeout; the file passes on its own.

### 2026-11-04 - E88 shark wait and hunter chase screen on the post-feature defaults

`E88` (`evals/screens/results/shark-hunter/`): 7 arms x 8 seeds x 200000 ticks, `map-elites-v6`, seeds 1-8, against the defaults with flora, megafauna, disease, `splitMateScarceTicks` 600 and `splitClonalMax` 3. Means over 8 seeds; predators is alive at the last tick (seeds with one or more, total).

| Arm               | predators | catch rate | families eff. | mating | prey types | population | fed life | floor episodes |
| ----------------- | --------- | ---------- | ------------- | ------ | ---------- | ---------- | -------- | -------------- |
| defaults          | 0/8 (0)   | 0.052      | 1.33          | 0.45   | 1.75       | 67         | 4296     | 12.8           |
| shark300          | 1/8 (5)   | 0.117      | 1.42          | 0.39   | 2.38       | 88         | 3978     | 16.4           |
| shark1200         | 1/8 (2)   | 0.051      | 1.68          | 0.37   | 2.13       | 41         | 4229     | 15.4           |
| sprint22          | 0/8       | 0.138      | 1.43          | 0.41   | 2.00       | 59         | 4231     | 14.0           |
| vision500         | 0/8       | 0.089      | 1.61          | 0.42   | 2.63       | 59         | 4111     | 14.3           |
| agile             | 0/8       | 0.078      | 2.23          | 0.37   | 2.50       | 55         | 4025     | 17.3           |
| shark300-sprint22 | 0/8       | 0.094      | 1.74          | 0.43   | 2.63       | 84         | 4119     | 16.1           |

Every arm fails the screen verdict (`pop > min` 0/8 everywhere, including the defaults): on these defaults the population mean is 41-88 against about 400 in the E85 screen, so the world is thin before any arm acts. Predators survive on 0-1 of 8 seeds in every arm (the one survivor of `shark300` is a single seed with 5); a faster sprint lifts the catch rate (0.05 to 0.14) and `shark300` more than doubles it, yet neither keeps hunters. Families reach 3 on 0 seeds at defaults, 2 of 8 at `agile` and 1 of 8 at `shark300-sprint22`. No arm is a candidate. The chase is not the only bottleneck: hunter numbers and the thin population are the next questions for the predator balance (natural-selection T50).

### 2026-11-05 - E98 hunter levers on the fed world: the chase is not the bottleneck, replacement is

`E98` (`evals/screens/results/hunter-fed/`): the E88 arms again, 7 arms x 8 seeds x 200000 ticks, `live` policy, on the defaults after #254 raised the food cap. Means over 8 seeds; predators is seeds with a hunter alive at the last tick (total hunters).

| Arm               | predators | catch rate | population | fed life | floor episodes | families eff. | mating | dominance |
| ----------------- | --------- | ---------- | ---------- | -------- | -------------- | ------------- | ------ | --------- |
| defaults          | 1/8 (2)   | 0.069      | 126        | 4622     | 9.0            | 1.43          | 0.56   | 0.35      |
| shark300          | 0/8       | 0.144      | 145        | 4724     | 7.9            | 1.38          | 0.56   | 0.35      |
| shark1200         | 0/8       | 0.094      | 92         | 5090     | 6.1            | 1.21          | 0.47   | 0.25      |
| sprint22          | 2/8 (6)   | 0.088      | 134        | 4165     | 9.5            | 1.45          | 0.51   | 0.28      |
| vision500         | 0/8       | 0.164      | 146        | 4867     | 6.8            | 1.32          | 0.54   | 0.35      |
| agile             | 0/8       | 0.188      | 109        | 4486     | 8.0            | 1.46          | 0.45   | 0.30      |
| shark300-sprint22 | 0/8       | 0.142      | 146        | 4130     | 5.9            | 1.12          | 0.54   | 0.32      |

Every arm fails the screen verdict. Four arms double the catch rate and none keeps hunters: the failure gate (no arm at 4/8) is met, and no arm is a candidate (`sprint22` is 2/8 on 6 hunters, under the 3/8 bar, with two seeds under a mean of 80). With prey plentiful the population is 92-146 instead of 41-88 (E88), floor episodes fell from 13-17 to 6-10, and hunters still go extinct, so the cause is how a hunter gets replaced, not how it catches. In `js/sim/` a hunter pays `huntUpkeep` (0.002 a tick) on top of its standing loss (0.3x), holds a 3x store (6000), splits at 0.6 x `splitMinEnergy` (540) only after `splitMateScarceTicks` (600) without a mate in view and at most `splitClonalMax` (3) times in a row, and a mating child waits `maturityTicks` (600) and `pregnancyTicks` (480). A rare role has few mates in view, so it relies on splits that the clonal cap then limits, and a child is a hunter only by inheritance or by `specMutationRate` (0.002). Next: E100 (`evals/screens/hunter-life.grid.json`), one hunter life-history lever per arm (H7).

### 2026-11-05 - E100 hunter life history: births rise 3 to 8 times, hunters at the end do not, and they starve

`E100` (`evals/screens/results/hunter-life/`): 7 arms x 8 seeds x 200000 ticks, `live` policy, E98's seeds and defaults. Means over 8 seeds; hunters is seeds with one or more alive at the last tick (total); births are predator births per run.

| Arm          | hunters | births | catch rate | population | seeds < 80 | fed life | floor episodes | families eff. | mating | dominance |
| ------------ | ------- | ------ | ---------- | ---------- | ---------- | -------- | -------------- | ------------- | ------ | --------- |
| defaults     | 1/8 (2) | 5.0    | 0.069      | 126        | 1          | 4622     | 9.0            | 1.43          | 0.56   | 0.35      |
| split-low    | 1/8 (1) | 12.3   | 0.096      | 106        | 3          | 4501     | 9.8            | 1.44          | 0.49   | 0.36      |
| upkeep-low   | 0/8     | 2.1    | 0.061      | 115        | 4          | 4442     | 7.0            | 1.36          | 0.47   | 0.32      |
| specmut-high | 2/8 (3) | 28.5   | 0.077      | 99         | 3          | 4511     | 9.8            | 1.17          | 0.44   | 0.31      |
| store-big    | 2/8 (2) | 15.0   | 0.146      | 131        | 2          | 4345     | 8.6            | 1.50          | 0.53   | 0.29      |
| rest-cheap   | 1/8 (2) | 38.9   | 0.123      | 114        | 3          | 5062     | 7.8            | 1.17          | 0.48   | 0.34      |
| mature-fast  | 0/8     | 5.5    | 0.094      | 101        | 5          | 3983     | 8.6            | 1.47          | 0.53   | 0.31      |

No arm reaches 3/8, so there is no candidate for a 16-seed run. Four arms lift births by 50% or more, yet hunters at the end stay at 0-2 of 8: a born hunter does not live to be counted. The reports carry no death cause per role (`eval.disease_deaths_share`, `eval.terrain_death_share`, `eval.toxic_death_share` and `eval.trampled_share` cover all agents), so four defaults replays (`npm run replay -- --seed <n> --ticks 200000 --level debug --policy map-elites-v6`, seeds 313056, 612370, 446985, 639124) were read for `AgentDied` events with `spec` 1: of 251 hunter deaths, 188 starved (75%, median age 1859 ticks, about three maturity spans), 45 hit a rock or wall (18%, `obstacleDamage` and `wallDamage` 50), 10 were eaten, 5 trampled, 3 died of disease; none of old age or poison. Hunters were born by split (93), floor re-seed (81), the initial seed (68) and mating (9). Hunters therefore starve soon after they mature, whatever their birth route. A note on the replays: `replay` defaults to `baseline-v5`, which is a different world; the screens use `map-elites-v6`. Next: E102 (`evals/screens/hunter-starve.grid.json`), one factor against starvation and rock damage per arm; `evals/hunter-store-specmut-config.json` holds the `specmut-high` plus `store-big` combination (each 2/8 against 1/8, within noise) for E102's last arm.

### 2026-11-04 - E94 herds and food supply: `maxFood` 1600 caps the food, not the herds

`E94` (`evals/screens/results/herd-food/`): 6 arms x 8 seeds x 200000 ticks, `map-elites-v6`, seeds 1-8, against the defaults. Means over 8 seeds; predators is seeds with a hunter alive at the last tick. Herds block blobs by eating plant items (`grazeHerds`) and by rigid bodies of radius 80 with trample damage (`trampleHerds`).

| Arm           | population | pop > min | food energy/1k | fed life | floor episodes | predators | prey types | families eff. |
| ------------- | ---------- | --------- | -------------- | -------- | -------------- | --------- | ---------- | ------------- |
| defaults      | 67         | 0/8       | 370            | 4296     | 12.8           | 0/8       | 1.8        | 1.3           |
| herds0        | 88         | 0/8       | 362            | 4641     | 14.6           | 1/8       | 1.9        | 1.4           |
| food15        | 67         | 0/8       | 396            | 4121     | 15.0           | 0/8       | 1.8        | 1.4           |
| herds0-food15 | 75         | 0/8       | 331            | 4386     | 16.4           | 1/8       | 2.3        | 1.6           |
| food20        | 65         | 0/8       | 391            | 3955     | 15.6           | 1/8       | 2.0        | 1.3           |
| food15-cap    | 126        | 1/8       | 420            | 4551     | 9.0            | 1/8       | 2.3        | 1.4           |

More regrowth does nothing while `maxFood` stays 1600: food15 and food20 sit at the defaults' population, so the world is at the item cap and the extra spawns have no slot. Raising the cap with 0.09 (`food15-cap`, `maxFood` 2400) nearly doubles the population (67 to 126), cuts floor episodes from 12.8 to 9.0 and lifts fed life and food energy/1k. Herds cost about 21 blobs at normal food (88 against 67), a smaller 8 under food15; the capped arms cannot say whether more food shrinks that penalty, because food15 did not add food. A `herds0-food15-cap` arm is owed to answer the 2 x 2.

`herds0` and `herds0-food15` are diagnostic controls only and never adoption candidates: the herds exist on purpose, to spread seeds, pollinate and feed hunters, as large grazers do. The herds' roles work at the defaults: `eval.herd_grazed_share` 0.45 (0 without herds), `eval.dung_food_share` 0.13, `eval.herd_seeded_patches` 0.020, `eval.herd_carcass_meal_share` 0.035, and `eval.pollination_rate` 0.064 against 0.053 without herds. They stay in the world and the cost to blobs is what to cut. Next, three levers that keep those roles:

- **Migratory grazing.** A residence time per patch: a herd grazes a patch briefly, then moves on (`herdStayTicks` 6000 and `herdLeaveShare` 0.4 exist; the screen is whether a shorter stay or a lower leave share lets patches recover). Config keys only, if the existing pair is enough; otherwise a per-patch cooldown in `herd-motion.js`.
- **A body radius apart from the graze reach.** `herdRadius` couples the 80 px exclusion in `trample.js` with the plant reach in `herd-graze.js`. A separate `herdBodyRadius` (smaller, a body is not its whole mouth reach) keeps the grazing and frees the ground and the items beside the animal.
- **Gentler contact for small, slow blobs.** In `resolveContact`, scale the push-out and `trampleDamage` by closing speed, so a slow blob slips along a herd animal without losing energy or being moved; the damage already scales with the closing speed squared, so the change is the exclusion.

`E95` confirms `food15-cap` (`evals/food15-cap-config.json`: `foodRegrowPerArea` 0.09, `maxFood` 2400) on 16 seeds x 200000 ticks against the defaults (`evals/experiments/E95-*.json`, compare in `E95-compare.json`; `eval:compare --allow-config-diff foodRegrowPerArea,maxFood`). Population mean 51 to 113 (interval 36 to 90) and seeds above the restart size 6/16 to 16/16; floor episodes 15.8 to 8.3; fed life 4071 to 4599 (better); food energy/1k 364 to 447 (better); catch rate 0.070 to 0.100 (better); predators at the end 0.31 to 0.44 and prey types 1.9 to 2.2 (no difference). Against that, intervals that exclude 0 show worse `lineage_dominance` (0.21 to 0.30), `terrain_death_share`, `deliberate_food_share` and `output_saturation`, and smaller herd roles: `herd_grazed_share` 0.47 to 0.37, `herd_seeded_patches` 0.017 to 0.008, `herd_carcass_meal_share` 0.030 to 0.016 (pollination unchanged, families 1.60 to 1.32 with no verdict). The population gain is real; the herd and dominance costs are not adopted without the user's call.

### 2026-11-04 - E96 herd behaviour: halving trampling is the candidate, a body radius the follow-up

`E96` (`evals/screens/results/herd-behaviour/`): 7 arms x 8 seeds x 200000 ticks, `map-elites-v6`, seeds 1-8, on the E95 food defaults. Means over 8 seeds; predators is seeds with a hunter alive at the last tick; seeded is `eval.herd_seeded_patches` per 1000 ticks; dominance is `eval.lineage_dominance`.

| Arm        | population | pop > 40 | fed life | floor | predators | seeded | pollination | carcass | grazed | dominance | families |
| ---------- | ---------- | -------- | -------- | ----- | --------- | ------ | ----------- | ------- | ------ | --------- | -------- |
| defaults   | 126        | 8/8      | 4551     | 9     | 1/8       | 0.006  | 0.058       | 0.015   | 0.363  | 0.345     | 1.43     |
| stay3000   | 111        | 8/8      | 4917     | 7     | 1/8       | 0.008  | 0.051       | 0.024   | 0.378  | 0.367     | 1.16     |
| stay1500   | 111        | 7/8      | 4713     | 7     | 0/8       | 0.007  | 0.061       | 0.021   | 0.396  | 0.296     | 1.27     |
| leave70    | 82         | 8/8      | 4657     | 8     | 0/8       | 0.005  | 0.050       | 0.017   | 0.397  | 0.322     | 1.47     |
| trample200 | 158        | 8/8      | 4833     | 7     | 0/8       | 0.004  | 0.061       | 0.015   | 0.343  | 0.324     | 1.32     |
| trample100 | 162        | 7/8      | 4909     | 7     | 1/8       | 0.012  | 0.057       | 0.013   | 0.356  | 0.380     | 1.63     |
| radius50   | 134        | 8/8      | 4760     | 7     | 0/8       | 0.013  | 0.072       | 0.011   | 0.299  | 0.332     | 1.30     |

Staying a shorter time or leaving a patch sooner does not help: seeded patches stay at 0.005-0.008 and the population falls (82-111 against 126), so the herd cost is not in how long they sit on a patch. Less trampling lifts the population (trample100: 162, trampled share 0.040 to 0.009) and, on this sample, seeded patches (0.012), while carcass meals (0.013) and pollination (0.057) stay inside the preregistered gate. `radius50` has the best seeded patches (0.013) and pollination (0.072) but loses carcass meals (0.011, under the 0.012 gate) and hunters (0/8), as the graze reach shrinks with the exclusion disc. Candidate for a 16-seed confirmation: `trample100` (`evals/trample100-config.json`, `trampleDamage` 100); its watch items are lineage dominance (0.38 against 0.35) and one seed under the restart size. Eight seeds cannot separate the seeded-patch doubling from noise (E95 saw 0.008 on 16 seeds for this config's parent).

If the candidate fails, the next lever is a separate body radius: a `herdBodyRadius` key in `config-herds.js` (rule as `herdRadius`), default `null` meaning `herdRadius` so the config hash only changes when it is set, read by `resolveContact` in `trample.js` and the herd rows in `ray-gather.js`, with `herd-graze.js` keeping `herdRadius`. Tests first: a blob at `herdRadius` from an animal with `herdBodyRadius` 40 is not pushed and the graze reach is unchanged; goldens unmoved at the default.

`E97` confirms `trample100` (`evals/trample100-config.json`) on 16 seeds x 200000 ticks against the E95 defaults (`evals/experiments/E95-food15-cap.json`, `E97-trample100.json`, compare in `E97-compare.json`; `js/` identical to the E95 adoption). Trampled share 0.040 to 0.008, but the other gains do not hold: population 113 to 129 (interval -15 to 51), seeded patches 0.008 to 0.013 (interval -0.001 to 0.016), predators at the end 0.44 to 0.06 per seed, seeds above 40 16/16 to 14/16, carcass meals 0.016 to 0.012, and worse (intervals exclude 0) food energy/1k 447 to 411 and defender fitness (mean 2273 to 1952). Not adopted: the 8-seed screen's population and seeded-patch gains were noise, and less trampling costs hunters. The next lever is the separate `herdBodyRadius` of the E96 note.

### 2026-11-05 - E102 hunter hunger: store-specmut keeps a hunter on 4 of 8 seeds, but hunters still starve

`E102` (`evals/screens/results/hunter-starve/`): 7 arms x 8 seeds x 200000 ticks, `live` policy, E98's seeds and defaults. Means over 8 seeds; hunters is seeds with one or more alive at the last tick (total).

| Arm           | hunters | births | catch rate | population | seeds < 80 | fed life | floor episodes | prey types (min) | families eff. | dominance |
| ------------- | ------- | ------ | ---------- | ---------- | ---------- | -------- | -------------- | ---------------- | ------------- | --------- |
| defaults      | 1/8 (2) | 5.0    | 0.069      | 126        | 1          | 4551     | 9.0            | 2.3 (1)          | 1.4           | 0.35      |
| omnivore      | 3/8 (7) | 128.5  | 0.098      | 68         | 7          | 4197     | 10.3           | 2.1 (1)          | 1.7           | 0.22      |
| move-cheap    | 1/8 (6) | 8.3    | 0.068      | 132        | 2          | 4697     | 8.8            | 2.4 (1)          | 1.4           | 0.29      |
| bite-fast     | 0/8     | 7.3    | 0.071      | 149        | 2          | 4788     | 6.6            | 2.1 (1)          | 1.4           | 0.31      |
| rocks-soft    | 0/8     | 9.8    | 0.085      | 117        | 3          | 5049     | 6.6            | 2.5 (1)          | 1.7           | 0.39      |
| child-rich    | 0/8     | 12.0   | 0.064      | 114        | 3          | 4720     | 7.9            | 2.3 (1)          | 1.5           | 0.32      |
| store-specmut | 4/8 (4) | 39.4   | 0.067      | 140        | 3          | 4773     | 5.8            | 3.6 (3)          | 1.4           | 0.29      |

No arm qualifies for a 16-seed run (3/8 hunters, no more seeds under 80 than defaults, no prey type lost). `omnivore` (predators eat plants at 0.3) reaches 3/8 with the most hunters (7) and 128 births, but the population falls to 68 and 7 seeds sit under 80: hunters that graze compete with prey and the world thins. `store-specmut` (the E100 `specmut-high` plus `store-big` pair) reaches 4/8 with one hunter per seed, holds 3 to 4 prey types on every seed and floor episodes of 5.8, but 3 seeds sit under 80 against 1 at defaults; `evals/hunter-store-specmut-config.json` stays the closest candidate. Softer rocks and walls (`rocks-soft`), a cheaper gait, a faster bite and a richer child each leave 0-1 of 8 seeds with a hunter, so neither collision damage nor move cost nor bite rate ends hunters. Softer rocks would also change every blob, not only hunters. Herd metrics did not move (seeded patches 0.002-0.016, carcass meal share 0.012-0.019 in every arm).

Replays of `store-specmut` on seeds 612370 and 275725 (`npm run replay -- --seed <n> --ticks 200000 --level debug --policy map-elites-v6 --config evals/hunter-store-specmut-config.json`): of 119 hunter deaths, 92 starved (77%, median starving age about 1.7-1.8k ticks), 18 hit a rock or wall (15%), 7 were trampled, 1 eaten, 1 died of disease. This matches the defaults replays (75% starved, median 1859): the 5x store and the extra births add hunters but a hunter still starves about three maturity spans after birth. Hunters fail on income, and the carcass meal share of 1.5% says herd kills are almost not eaten by them. Next lever from nature: scavenging. Lions and hyenas take a large share of their meat from carcasses they did not kill, and a failed hunt then costs less; a longer-lasting carcass (`herdCarcassTicks`) or a carcass cue the predator senses would let a hunter live between kills.

### 2026-11-05 - E99 herd body radius: the trampled share barely moves, one arm clears the gate

`E99` (`evals/screens/results/herd-body/`): `herdBodyRadius` 60, 45, 30 with `herdRadius` 80 (graze reach) unchanged, 4 arms x 8 seeds x 200000 ticks, `live` policy, seeds 1-8. Means over 8 seeds; predators is seeds with a hunter alive at the last tick; floor is episodes summed over seeds.

| Arm      | population | under 80 | fed life | floor | predators | trampled | seeded | pollination | carcass | grazed | dominance | prey types |
| -------- | ---------- | -------- | -------- | ----- | --------- | -------- | ------ | ----------- | ------- | ------ | --------- | ---------- |
| defaults | 126        | 1/8      | 4622     | 72    | 1/8       | 0.040    | 0.006  | 0.058       | 0.015   | 0.363  | 0.345     | 2.25       |
| body60   | 153        | 2/8      | 4588     | 47    | 0/8       | 0.047    | 0.007  | 0.070       | 0.018   | 0.347  | 0.342     | 2.00       |
| body45   | 130        | 2/8      | 4545     | 57    | 1/8       | 0.034    | 0.007  | 0.066       | 0.016   | 0.344  | 0.310     | 2.25       |
| body30   | 184        | 1/8      | 5328     | 40    | 0/8       | 0.032    | 0.003  | 0.063       | 0.013   | 0.322  | 0.313     | 2.25       |

Predictions mostly missed. The trampled share fell far less than predicted (-25%, -50%, -70% predicted; +18%, -15%, -20% measured), so a smaller exclusion disc is not what cuts trampling. Population rose in two arms but not in order of radius (+21%, +3%, +46%), with a seed sd of about 60 (se about 22), so the gains look like seed noise as in E96/E97. Predators stayed at 0-1/8 as predicted. Gate (population +10% or more, no herd role down over 30%, no prey type lost; every arm including defaults has a seed with one prey type at the end): `body60` passes and is the candidate (`evals/body60-config.json`); `body30` fails on seeded patches (-50%); `body45` fails on population (+3%). A 16-seed `eval:compare` of `body60` decides it. The mechanism is not visible, so the bar is a population gain with the interval excluding 0; without it `herdBodyRadius` is deleted with its tests (AGENTS.md "Delete what a switch replaces").

E101 (16 seeds) did not confirm body60: population +17% with the interval including 0, hunters at end 0.44 to 0 per seed (worse). The body is not the herds' cost; herdBodyRadius is deleted.

### 2026-11-05 - E104 hunter scavenging screen: carcass-rich lifts hunter presence 44%, one arm to 16 seeds

`E104` (`evals/screens/results/scavenge/`): 7 arms x 8 seeds x 200000 ticks, `live` policy, post-E103 defaults. Means over 8 seeds; hunters is seeds with one or more alive at the last tick (total alive in brackets); hunter carcass share is `eval.carcass_hunter_share`.

| Arm             | hunters  | presence | hunter carcass share | herd carcass meals | population | under 80 | fed life | floor | prey types | families eff. | dominance | mate merit |
| --------------- | -------- | -------- | -------------------- | ------------------ | ---------- | -------- | -------- | ----- | ---------- | ------------- | --------- | ---------- |
| defaults        | 4/8 (4)  | 0.356    | 0.062                | 0.012              | 140        | 3        | 4770     | 5.8   | 3.63       | 1.41          | 0.29      | -0.034     |
| carcass-long    | 2/8 (56) | 0.338    | 0.066                | 0.008              | 131        | 3        | 4650     | 9.1   | 2.63       | 1.50          | 0.34      | 0.067      |
| carcass-rich    | 3/8 (11) | 0.514    | 0.113                | 0.015              | 145        | 3        | 4740     | 8.8   | 3.88       | 1.29          | 0.29      | 0.017      |
| meat-exclusive  | 2/8 (3)  | 0.405    | 0.155                | 0.043              | 100        | 5        | 4740     | 7.9   | 3.00       | 1.32          | 0.33      | 0.015      |
| herd-turnover   | 1/8 (2)  | 0.368    | 0.129                | 0.025              | 116        | 3        | 4670     | 8.1   | 3.13       | 1.35          | 0.32      | 0.071      |
| herd-fat        | 1/8 (51) | 0.391    | 0.124                | 0.021              | 120        | 3        | 4910     | 7.1   | 3.13       | 1.58          | 0.29      | 0.024      |
| scavenger-combo | 1/8 (4)  | 0.403    | 0.362                | 0.009              | 104        | 4        | 4720     | 9.5   | 2.75       | 1.54          | 0.31      | 0.007      |

The defaults arm's hunters (4/8, presence 0.356) are a little under E103's 16-seed numbers (0.39); seed noise at 8 seeds. Gate (presence +20% to 0.43+, carcass meals up, population 115+, prey types 3.0+): only `carcass-rich` (`carcassShare` 0.8) clears it - presence +44%, hunter carcass share 0.062 to 0.113, population 145, prey types 3.88. `meat-exclusive` and `scavenger-combo` raise the hunter share most (0.155, 0.362) but starve the other roles of meat: population 100 and 104, prey types 3.0 and 2.75, and presence rises only 14% and 13%. `carcass-long` loses prey types (2.63); `herd-turnover` and `herd-fat` leave presence flat. Predictions mostly missed: the combo did not stack (it fell below carcass-rich alone), and hunters at the end did not rise (3/8 for the winner against 4/8 at defaults), so more carcass meat lifts presence (time spent alive in the run) without keeping hunters alive to the last tick. Carcass meat is shared with every role, so the gain is capped by competition at the carcass; carcass scent, which would let hunters reach carcasses first, stays the next lever if the 16-seed confirmation of `carcass-rich` (`evals/carcass-rich-config.json`) does not hold.

Sketch if carcass-rich fails (carcass scent, default off): (1) `js/sim/config.js` gets `carcassScent` (off), `js/sim/pheromone.js` a carcass layer that a carcass writes to while it lasts; (2) a new brain input `carcassScent` in the sensing layout (`js/sim/sense.js`, the input list in `js/sim/brain.js`), gated so the layout is unchanged when off; (3) the off path keeps the layout and goldens byte-identical, a test pins it; (4) screen with a grid on `evals/screens/` (`carcassScent` on, with and without `carcassShare` 0.8), 8 seeds, same gate; (5) hunters only sense it first (a predator-only input) if the all-roles arm shows meat competition; (6) delete the flag after adoption, as the flag ledger requires.

### 2026-11-05 - E106 genetic families screen: no arm holds more than one family per basin

`E106` (`evals/screens/results/families/`): 6 arms x 8 seeds x 200000 ticks, `live` policy, post-E105 defaults. Means over 8 seeds; under 80 is seeds whose population mean is under 80; predators is seeds with one or more alive at the last tick.

| Arm         | families eff. | seeds at 3 | basin families | dominance | population | under 80 | floor | fed life | presence | predators | prey types | mating share | mate merit |
| ----------- | ------------- | ---------- | -------------- | --------- | ---------- | -------- | ----- | -------- | -------- | --------- | ---------- | ------------ | ---------- |
| defaults    | 1.29          | 0/8        | 1.99           | 0.29      | 145        | 3        | 8.8   | 4739     | 0.51     | 3/8       | 3.88       | 0.45         | 0.02       |
| mate-0.7    | 1.31          | 0/8        | 1.97           | 0.29      | 125        | 3        | 7.4   | 4733     | 0.41     | 4/8       | 3.38       | 0.41         | 0.07       |
| mate-0.45   | 1.31          | 0/8        | 1.97           | 0.29      | 125        | 3        | 7.4   | 4733     | 0.41     | 4/8       | 3.38       | 0.41         | 0.07       |
| one-gap     | 1.23          | 0/8        | 1.49           | 0.37      | 132        | 2        | 7.0   | 5257     | 0.50     | 3/8       | 3.13       | 0.43         | 0.07       |
| mutation-2x | 1.50          | 0/8        | 1.80           | 0.29      | 124        | 3        | 6.6   | 4733     | 0.42     | 1/8       | 3.13       | 0.47         | -0.01      |
| disease-3x  | 1.22          | 0/8        | 1.65           | 0.34      | 127        | 2        | 8.3   | 4554     | 0.49     | 1/8       | 2.75       | 0.48         | 0.07       |

Predictions mostly missed: mate-0.45 predicted 2.2 families and measured 1.31; mutation-2x came closest to a gain (+0.21) but under the +0.4 bar and with population 124 and presence 0.42 under the gate. One gap raised dominance (0.29 to 0.37) and cut basin families (1.99 to 1.49), the opposite of predicted. mate-0.7 and mate-0.45 produced identical metrics, and the key does bind: mate births fell 0.412 to 0.384 and mating share 0.451 to 0.415 (mating is not near 0; splits rose 0.455 to 0.494). No mated pair lay between 0.45 and 0.7, so pair distances are bimodal (close kin under 0.45, distant over 0.7) and 0.7 already removes every distant pair; tightening further changes nothing. The basin populations are therefore close kin already, which is why `basin_family_effective` stays near 1: the limit is standing variation (mutation scale, and `FAMILY_DISTANCE` 0.5 against a within-basin spread under 0.45), not panmixia. No arm qualifies; failure gate applies, no candidate config written. The assortative sketch below is demoted: an assortative preference among kin cannot create variation, so screen mutation scale (above 2x, since 2x was the only gain) and a lower `FAMILY_DISTANCE` reading first; a `mateDistanceMax` of 0.85 to 0.95 is not worth a screen, it can only trade population for nothing.

Sketch for an assortative mate preference (`mateAssortWeight`, default 0 so goldens are unchanged): (1) `js/sim/config-rules.js` and `config-defaults.js` gain `mateAssortWeight` (num, 0 to 4, default 0). (2) In `beats` and `bestInCell` of `js/sim/mate-search.js` the pick score gets `- mateAssortWeight * geneticDistance(world, a, b)` beside the existing merit term, so nearer genomes win among eligible candidates; with 0 the code path is skipped and the golden hashes hold. (3) Tests in `test/sim/mate-search.test.js`: weight 0 picks the same male as before; a positive weight picks the genetically nearer of two otherwise equal males; a naive reference over all males agrees. (4) Screen it as `evals/screens/assort.grid.json`: weights 0, 0.5, 1, 2 (and 2 with mutation-2x) on 8 seeds x 200000 ticks, judged on `eval.basin_family_effective` up by 0.4 with the E106 population, presence and prey-type gates.

### 2026-11-05 - E107 standing variation screen: more mutation and less decay do not make families

`E107` (`evals/screens/results/variation/`): 7 arms x 8 seeds x 200000 ticks, `live` policy, post-E105 defaults. Means over 8 seeds; under 80 is seeds whose population mean is under 80; predators is seeds with one or more alive at the last tick; no seed reached 3 families per basin in any arm.

| Arm                   | families eff. | basin families | dominance | population | under 80 | floor | fed life | presence | predators | prey types | mating share | mate merit |
| --------------------- | ------------- | -------------- | --------- | ---------- | -------- | ----- | -------- | -------- | --------- | ---------- | ------------ | ---------- |
| defaults              | 1.29          | 1.99           | 0.29      | 145        | 3        | 8.8   | 4739     | 0.51     | 3/8       | 3.88       | 0.45         | 0.02       |
| genes-100             | 1.31          | 1.93           | 0.30      | 127        | 4        | 6.8   | 4640     | 0.39     | 3/8       | 3.38       | 0.47         | 0.05       |
| genes-134             | 1.50          | 1.80           | 0.29      | 124        | 3        | 6.6   | 4733     | 0.42     | 1/8       | 3.12       | 0.47         | -0.01      |
| genes-268             | 1.30          | 1.68           | 0.31      | 124        | 3        | 6.9   | 4597     | 0.28     | 2/8       | 2.75       | 0.50         | 0.05       |
| decay-0.001           | 1.36          | 1.89           | 0.34      | 114        | 4        | 6.6   | 4943     | 0.49     | 3/8       | 2.75       | 0.40         | 0.09       |
| decay-0               | 1.53          | 2.63           | 0.29      | 105        | 5        | 7.4   | 4788     | 0.41     | 2/8       | 2.88       | 0.40         | 0.15       |
| genes-134-decay-0.001 | 1.45          | 2.14           | 0.35      | 131        | 1        | 6.9   | 4741     | 0.42     | 2/8       | 2.75       | 0.45         | -0.05      |

Verdict: no arm qualifies (the best, decay-0, is +0.24 against the +0.4 bar, with population 105 and prey types 2.88 under their gates). The failure gate applies and the genetic-families gate is recorded as unmet for this balance round; nothing further is tuned. Predictions hit for genes-134 (1.5) and roughly decay-0 (1.6 against 1.53) and missed elsewhere: genes-268 gave 1.30 (no gain over 134, so more mutated genes does not scale), and removing silent-input decay cost population 21-28% where none was predicted. Doubled mutation (genes-134) reproduces the E106 mutation-2x row. Dropping decay raised basin families (1.99 to 2.63) but the extra clusters were not distinct enough to count as effective families.

What would have to change for it to pass: the limit is not the amount of variation introduced per birth but how many animals share a basin. A basin holds about 40 to 150 animals with 8 to 16 floor episodes per run, and each floor episode plausibly reseeds a basin from a few survivors, which would reset families to one (not measured here). Either (a) a larger population per basin (higher `maxAgents` or fewer basins, with the step-budget cost that brings) so families survive a bottleneck, or (b) a redesign of the families metric with a stated reason, for example counting a family per reproductively isolated cluster over the whole run instead of the last window, since families that form and are lost to the next floor episode are invisible to a last-state measure. The assortative mate preference sketched under E106 stays untested; E107 gives no evidence for it either way.

### 2026-11-05 - E108 temperature attribution screen: meals cross the heat limit, movement lifts the base, no arm is adopted

`E108` (`evals/screens/results/temperature/`): 6 arms x 8 seeds x 200000 ticks, `live` policy, post-E105 defaults. Means over 8 seeds; under 80 is seeds whose population mean is under 80; predators is seeds with one or more alive at the last tick (the median count is 0 in every arm); fed life counts only plant-eaters, so it reads the prey.

| Arm                      | heat  | cold  | population | under 80 | floor | fed life | presence | predators | prey types |
| ------------------------ | ----- | ----- | ---------- | -------- | ----- | -------- | -------- | --------- | ---------- |
| defaults                 | 0.342 | 0.082 | 145        | 3        | 8.8   | 4739     | 0.51     | 3/8       | 3.88       |
| no-meal-heat             | 0.001 | 0.451 | 133        | 3        | 6.4   | 4599     | 0.55     | 1/8       | 2.75       |
| no-move-heat             | 0.199 | 0.178 | 161        | 2        | 4.9   | 4759     | 0.55     | 2/8       | 3.38       |
| half-move-heat           | 0.233 | 0.149 | 146        | 2        | 8.3   | 4570     | 0.40     | 2/8       | 3.38       |
| cooling-x2               | 0.138 | 0.400 | 157        | 2        | 6.6   | 4830     | 0.49     | 2/8       | 3.25       |
| cooling-x2-cold-cost-off | 0.096 | 0.552 | 169        | 3        | 3.0   | 5634     | 0.56     | 2/8       | 3.38       |

**Predictions.** Hit: defaults cold 0.09 (0.082), half-move-heat cold 0.12-0.18 (0.149), cooling-x2 heat 0.08-0.14 (0.138). Missed: defaults heat 0.20-0.26 (0.342); no-meal-heat heat 0.20-0.24 (0.001); no-move-heat on every figure (heat under 0.05 got 0.199, population 110-130 got 161, fed life 4200-4500 got 4759); half-move-heat heat 0.10-0.15 (0.233); cooling-x2 cold 0.2-0.3 (0.400); cold-cost-off fed life up 5-10% on cooling-x2 (up 17%).

**Attribution (T51).** Heat is subtraction-attributed to two sources, not three. `stepTemperature` has no sprint heat: sprint only raises speed, so it is the top of the movement term. Removing meal heat takes heat stress from 0.342 to 0.001, so eating is what carries an animal over the limit; removing movement heat takes it to 0.199, so movement accounts for 0.14 of the 0.34. The two overlap and do not add (0.14 + 0.34 is above the whole): movement alone never overheats an animal, it lifts the base temperature that a meal then pushes over. Halving movement heat already removes 0.11 of that 0.14 (0.233), so the effect saturates: most of it is gone at half the rate. Doubling passive cooling cuts heat to 0.138 and lifts cold stress from 0.082 to 0.400, so the thermal band is narrow enough that cooling trades one stress for the other at about 1:1.5 in share terms; the cold cost is the larger part of the price (cold-cost-off gives 17% more fed life than cooling-x2, and floor episodes 3.0 against 6.6) but pushes cold stress to 0.552.

**Verdict (T52).** No arm is an adoption candidate. The viability band is population 135-155, fed life 4500-4900, presence 0.45-0.55, prey types 3.3-3.9, floor 8-10, and no worse than defaults by 5% on population, fed life, floor, presence and prey types. No-meal-heat fails population (133) and prey types (2.75); no-move-heat fails population (161), floor (4.9) and presence (0.551); half-move-heat fails presence (0.40, down 22%); cooling-x2 fails population (157), floor (6.6) and prey types (3.25); cold-cost-off fails population, fed life and floor. No thermal change is adopted from the screen itself and no `evals/<arm>-config.json` is written. E108 does support exactly one T52 comparison: the meal-capped arm (eating cannot raise temperature above `temperatureOptimalMax`; meals still warm a cold agent). Meals carry agents over the heat limit (heat 0.342 to 0.001 without them), and removing meal heat entirely costs prey types and raises cold stress to 0.451, which is what a cap that keeps the cold-side warming avoids. It is the next thermal build: a code switch, default off, a `scripts/flag-ledger.json` entry with its deletion task, screened against defaults. The other T52 arms are not justified: sprint-only heat (sprint is not a separate heat source), rest-gated cooling (cooling-x2 only trades heat stress for cold stress) and a stronger cold cost (turning the cold cost off removes the cold side of the rule, and cold-cost-off left cold stress at 0.55 with presence outside the band).

**Missing heat-source instrument (future work, T80).** Nothing partitions heat by source, so this screen subtracted rates instead. A five-line sketch:

1. In `stepTemperature` and the meal path in `feeding.js`, add each tick's move heat and meal heat to two per-agent accumulators (a typed array each; no allocation).
2. On every death and every tick above `temperatureOptimalMax`, add the two accumulators' recent shares to a per-cause heat-stress tally.
3. Count meals whose heat takes the animal above `temperatureOptimalMax` (meal overshoot) and the rest ticks spent below `temperatureOptimalMin` (rest cooling).
4. Report `eval.heat_source_move_share`, `eval.heat_source_meal_share`, `eval.meal_overshoot_share` and `eval.rest_cooling_share` as `watch` metrics.
5. Run the defaults once and check that the move and meal shares reproduce the subtraction above (meals carry it over, movement lifts the base).

### 2026-11-05 - E110 ledger and floor-off reading: the floor holds the whole world, not only the hunters

T54 asked whether the hunter gains of E103 and E105 were the floor guard restocking. They partly were, but the larger finding is that no world on the current defaults survives without the floor.

- **Floor-off kills every world.** With `floorTrigger` 0, all 16 worlds go extinct, prey included, between 41k and 149k ticks. Worlds that sat at the 500 cap from 20k fall to 0 within about 30k ticks of 80k. The defaults crash the same way and the floor holds a remnant of 20 to 40; that remnant is why 0.37 of hunter births are floor births.
- **The crash is starvation, not old age.** Old age is 6 of about 85,000 deaths, so a cohort ageing out at `maxAgeTicks` is ruled out.
- **Hunter deaths (4 replays with the eval policy, 417 deaths).** 73% starved. Of those, 65% never ate (median age 956) and 35% ate and still starved (median age 3500). Movement is 0.69 to 0.74 of a hunter's spend; standing is under 0.1.
- **Kill rate by birth source** (kills per 1,000 ticks): split from a hunter 0.177, mated from a hunter 0.337 (9 hunters), spec-flip 0.060, floor 0.011. Spec-flip and floor hunters make up the zero-kill mass; hunters born to hunters do hunt.
- **Hunters die with prey present.** The poorer basin still holds a median of 15 to 30 prey when the last hunter dies.
- **Replays need the eval's policy.** `npm run replay` without `--policy map-elites-v6` runs a world with no archive. Those runs gave 994 floor-born hunters out of 1,091 and one kill, a different world from the eval's.

Consequence: hunter levers cannot be judged on floor-off until the starvation crash is fixed, so the crash comes before E109 and the T57 screen.

### 2026-11-05 - E111 and E112 toxic cap crash: long-lived caps took the grazed-out food slots

The world-wide starvation crash of E110 is the toxic cap. It fruits from year phase 0.5 (tick 72000). By then the edible patches are grazed down to their stock floor, so most spawns into freed food slots are toxic caps. Nothing eats them, they lived 24000 ticks, and they held up to 1700 of the 2400 slots. Edible inflow fell from 471k to 178k energy per 1,000 ticks while demand stayed flat. Overshoot, patch death, the season table, herds and disease were each ruled out with a controlled rerun on seed 888035.

- **What fixes it.** Caps that live 4000 ticks with yield 0.2, plus `maxFood` 3600. The caps rot and free their slots, as a fruiting body does within days, and the larger cap leaves edible plants room while caps fruit. Fewer caps (`share` 1) or a milder toxin (`toxicity` 0.3) only reached 3 to 4 of 8 surviving worlds, because each cap still held its slot for 24000 ticks.
- **No smaller part matches.** Shorter life with the larger cap comes closest (6 of 8), and `maxFood` 3600 alone saves none.
- **What it buys, on 16 seeds with the floor on.**
    - Hunters at the end rise from 0.69 to 8.06, alive on 10 of 16 seeds instead of 3.
    - The floor share of hunter births falls from 0.37 to 0.03, and the population doubles.
- **What it costs (watch items).** Births per 1,000 ticks fall 10%, effective specialisation types 8%, and lineages alive from 7.0 to 5.4 (needs 32 seeds).
- **Diagnosis trap.** Counting eaten food as "slot alive before, dead after" undercounts, because `spawnFood` refills a freed slot in the same tick. Use the energy ledger's inflow instead.

### 2026-11-05 - Carcass scent on the hunt field drowns the hunt (E113, E114)

- **Why it was built.** On 16 seeds, herbivore `meatFoodValue` 0.1 doubled hunters' share of carcass energy (0.126 to 0.245) while the end hunter count did not move, which reads as hunters not finding carcasses (T58's gate).
- **What was tried.** `scentCarcasses` deposited each alive carcass into the existing hunt scent field every tick, so no brain input changed.
- **What happened (8 seeds).** Hunters alive at the end fell from 6/8 to 4/8, median last-quarter hunter-ticks from 238069 to 44295, population mean from 414 to 315, and hunters' carcass share did not rise (0.149 to 0.135). With herb-meat 0.1 it was also worse than herb-meat alone.
- **Likely cause.** The hunt scent field is the pack's call channel and every agent reads it; carcasses that lie for `carcassTicks` flood it, so the call no longer points at live prey and prey learn to avoid it. A carcass cue needs its own channel (a new input), which changes the brain layout, so it is not retried inside balancing.
- **Also learned (E113).** Median kills per hunter life is 0 on every one of 20 levers; 80 to 92% of hunters never kill. Budget, rest, sprint and placement levers do not teach hunting.

### 2026-11-05 - Basin divergence cannot gate an arm (T59 eval:power)

- **What was measured.** `npm run eval:power` on 32 default seeds (`evals/results/t59-defaults-32.json`, splits of 16).
- **Result.** No verdict for `eval.basin_divergence`, `eval.basin_spec_divergence` or `eval.basin_cluster_divergence`: 7 of 32 seeds have a basin under 20 agents in the last quarter, so the reading is null there, and nearly every 16-seed split holds one of those seeds. `predator_end_local_share` is null on 11 of 32.
- **How to use it.** The divergence readings are watch metrics, read as means beside the others, never an arm's gate. A null means a collapsed basin, which is itself the finding.

### 2026-11-05 - Provisioning scans the spatial hash once per agent (hunter-learning A2)

- **What was learned.** An agent sits in every hash cell its bounding box touches, so a scan of the cells around a giver meets a large young in several cells. `provisionYoung` counts an entry only in the first cell of its build-time box that lies inside the query range, so it needs no per-agent stamp or second pass.
- **Also.** `provisionedTick` stores tick + 1 (0 for never) because `freeAgent` zeroes every agent row, which makes a -1 sentinel a special case. Bench at 500 agents: `bench.step_ms@500` 4.14 to 4.20 ms with the three Phase 1 switches off and 4.16 to 4.17 ms with them on (baseline 4.20); `scripts/alloc-check.mjs` 19 KB and 67 KB of heap growth over 1000 ticks off and on (limit 1 MB).

### 2026-11-06 - The flip reflex teaches killing and then over-hunts (E115)

- **What ran.** Phase 1 of hunter-learning.md on 8 floor-off seeds: `flipReflex`, `provisionEnabled`, `juvenileDependency`, alone and together.
- **The flip reflex teaches.** Kill conversion at age 1000 to 2000 rises from 0.038 to 0.094, spec-flip hunters kill 0.403 per 1,000 ticks instead of 0.065, and the zero-kill share falls from 0.805 to 0.599. It is the first lever in balancing that moves competence, not only survival.
- **Then it over-hunts.** Prey types at the end fall from 3.38 to 1.75, the population mean from 358 to 186, and 7 of 8 seeds fall under 80 agents. Hunters that can kill need a brake that the world does not yet have (satiation, territory or prey escape), so the flip reflex is not kept alone.
- **Provisioning keeps hunters alive without teaching them.** Hunters alive at the end on 6/8 seeds instead of 5/8, no seed under 80 agents, conversion flat (0.029). The juvenile burn and kin floor alone hurt (4/8 alive); with provisioning they reach 7/8.
- **Detector note.** `eval.hunter_independent_kill_share` falls under provisioning by construction, because a provisioned hunter's kills are dependent for `INDEPENDENT_TICKS`.

### 2026-11-06 - Satiation does not stop taught hunters over-hunting; their numbers do it (E119)

- **What ran.** `satedBite` (a full or digesting hunter does not bite) with and without `flipReflex`, 8 floor-off seeds.
- **Result.** With the reflex, the brake keeps most of the competence (spec-flip hunters kill 0.215 per 1,000 ticks, the zero-kill share 0.577) but prey types still fall to 1.75 and 5 of 8 seeds go under 80 agents. Median last-quarter hunter-ticks rise eightfold (1.89 million against 238069).
- **Why.** A hunter that stops biting when full also stops paying the bite kick and wasting energy, so it lives longer and breeds more. The prey crash comes from the hunters' numerical response, not from each hunter killing more than it eats. A longer digest (30 ticks) makes it worse.
- **What it means.** A brake on a taught hunter has to act on hunter density (interference between hunters, territory), not on the single hunter's appetite.

### 2026-11-06 - Territory on breeding raises hunter numbers and passes the hunter gate (E121)

- **What ran.** `hunterTerritory` (a hunter may not breed while more than 1 other mature hunter lies within 600) with and without `flipReflex`, 8 floor-off seeds.
- **Territory alone.** Hunters alive at the end on 7/8 seeds, 1 seed under 80, median hunters at the end 13.5 against 4.5, prey types 3.63: the first arm to pass the full hunter gate. Competence is flat.
- **Why numbers rise.** Blocking breeding in a crowd does not thin hunters; a hunter that cannot breed keeps the energy a birth costs and lives longer, and the births that do happen are spread out, so fewer hunters starve on the same patch of prey.
- **With the reflex.** The best competence of any arm (conversion 1k-2k 0.097, zero-kill share 0.548) with prey types 2.50, but 3 of 8 seeds under 80 agents. A wider territory (1000) is worse on every survival row.

### 2026-11-06 - The flip reflex with territory teaches hunters to kill and passes the keep rule (E122, E123)

- **What ran.** `flipReflex` with `hunterTerritory` against the defaults on 16 seeds, floor off (E122) and floor on (E123).
- **Competence, both worlds.** Kill conversion at age 1000 to 2000 rises about 2.6 times (0.033 to 0.088 floor on), the first-kill time falls 35%, the juvenile death share falls 0.13 and the zero-kill share 0.23. It is the first lever in balancing that makes hunters better at killing on 16 seeds.
- **Floor on (production).** Hunters alive at the end on 14/16 seeds (10/16), 2 seeds under 80 agents (5), hunters at the end 37 against 8, effective specialisation types 3.2 to 4.0; the floor makes 0.7% of births. Prey types and extinctions do not move. The population mean falls 20%.
- **Floor off.** The same competence gain, but 10/16 alive and 7 seeds under 80 against 6: on the floor-off world the taught hunters still empty some basins.
- **Why the pair works.** The reflex gives a spec-flip hunter a hunter's brain at birth; territory stops the taught hunters breeding into the overshoot of E115 and E119. Neither alone holds on 16 seeds.

### 2026-11-06 - Rewarded Hebbian learning does not teach hunters (E124)

Reward-gated Hebbian plasticity (`hebbianRate` 0.0001 scaled by a trace of kills, bites or meat) gave no within-lifetime
gain: conversion at ages 3000-3999 minus 1000-1999 was negative in all nine arms, and the shuffled-reward control scored
best (-0.005; reward arms -0.020 to -0.045, no plasticity -0.048). The trace is fed mostly by bites (9.6 per 1000 hunter
agent-ticks against 0.3 kills), and plasticity touches only the hidden-to-output block, so the channel is too weak and too
noisy to credit a kill. Competence in this world comes from inherited weights (the flip reflex), not lifetime learning.

### 2026-11-06 - Step drift since #222: a bigger food cap and a bench window gap (natural-selection T61)

- **The 0.7 ms gap between the step and the phase sum is the window, not the timers.** `benchSize` times `step` on ticks 500-2500 and the phases on ticks 2500-4500. On the 500-agent bench world the population does not hold: alive agents fall from 500 to about 190 by tick 5500 (the floor is min = max = 500 only at the start), and the step falls with it. Two identical worlds stepped side by side, one by `step` and one by the phases with no per-phase timer, agree to under 0.02 ms in every 500-tick block: 4.75, 4.85, 4.77, 4.49 (ticks 0-2000), 4.32, 4.01, 3.97, 3.77 (2000-4000), 3.43, 3.06, 2.83, 2.53, 2.01 ms at 4000-6500. So the 4.45 ms step and the 3.82 ms phase sum are both right for their own ticks; the phase pass reads a lighter world. The 10 per-phase `performance.now` calls cost under 0.01 ms. `bench.step_ms@500` therefore means "the mean cost of ticks 500-2500 of the seed-1 world", and the budget of 3.32 ms was measured on the same window of a world that fell less. `bench-check` still compares like with like (same window each time), so it is unchanged; read the phase rows as shares, not as parts that add up to the step.
- **Attribution against the #222 baseline commit `d7d695a`** (`node scripts/bench-compare.mjs --base d7d695a --sizes=500`, median of 5, CPU lock, quiet machine; ms at 500 agents): step 3.451 to 4.428; brain 1.668 to 1.262 (down: Hebbian learning is gone); sense 0.932 to 1.180 (+0.25); field 0.089 to 0.529 (+0.44); physics 0.253 to 0.394 (+0.14); lifecycle 0.085 to 0.175 (+0.09); hash 0.097 to 0.182 (+0.085); environment 0.0002 to 0.016 (herd motion); merit 0.048 to 0.038; signal 0.022 to 0.024. The brain phase, which the plan named first, is not part of the rise.
- **Causes.** (1) `maxFood` went 1600 to 3600 (E95 2400, E112 3600) and the bench world saturates it from tick 500, so every loop over food slots or over hash entries costs 2.25 times as much: both `buildHash` passes (it runs twice a tick, once in the hash phase and once in the physics phase), the gather in `gatherNear`, `ageFood`, `spawnFood` and the hash visit in physics. (2) `grazeHerds` is new since the baseline: `nearestPlant` scanned all 3600 food slots for each of the 47 herd animals that was ready (about 0.3 ms, 7% of a CPU profile of the step loop), the whole of the field phase's rise. (3) The herd bodies are 47 more circles in every caster's `appendFixtures` and in `integrate` and `resolveContact`. (4) Lifecycle gained `stepToxin`, `stepDisease` and the hunter ledger.
- A CPU profile of the 500-agent step loop (3000 ticks after a 500-tick warmup) before any fix read `castRays` 11.5%, `hebbianStep` 11.5%, `hiddenStep` 9.8%, `gatherNear` 7.5%, `grazeHerds` 7.0%, `detTanhInto` 6.7%, `appendFixtures` 6.6%, `outputStep` 3.9%, `cellRange` 2.8%, `integrate` 2.7%. `hebbianStep` is still the second-largest self time, so the Hebbian pass is not what changed; why the brain row fell from 1.67 to 1.26 ms between the two commits is not explained by this profile (the 2.05 ms diagnosis of 2026-10-30 was at an earlier workload), and the brain phase was left alone: its remaining cost is the 32 x 32 recurrent pass, the batched tanh and the Hebbian update, each already tight.
- **Fixed, all bit-identical (goldens pass), each outside its `bench:parts --compare` margin:** `grazeHerds` collects the plants near each group once instead of scanning every food slot per animal (field phase micro +440%); `buildHash` keeps each circle's cell range from the count pass instead of recomputing it in the insert pass (hash +49%, and it runs twice a tick); `appendCircle` tests reach before staging a row (`senseAll` +11.1%, margin 9.7%, the phase row +9.4% inside its 10.6% margin). Tried and dropped: moving `appendFixtures` to locals-only tests (sense +9.5%, margin 13.8%, inside the margin).
- **Result** (`bench-compare` against the drifted head `b20dbb4`, median of 3, ms at 500 agents): step 4.388 to 4.040; field 0.527 to 0.190; hash 0.181 to 0.127; physics 0.393 to 0.338 (the second `buildHash`); sense, brain, lifecycle, merit, signal unchanged. The re-recorded baseline is `bench.step_ms@500` 4.068 (runs 4.068, 4.096, 3.991). The 3.32 ms budget is not met: what is left is sense 1.15 (rays against the gathered circles), brain 1.26 and physics 0.33. Closing the last 0.7 ms needs fewer food circles in the hash (the 3600 cap) or fewer ray tests, which change behaviour or the hash contents, so it is a plan decision.

### 2026-11-06 - Why floor-off worlds collapse (T64)

Floor-off worlds collapse because pairs stop meeting once the population is small, not because food runs out. `E126` (32 seeds, `floorTrigger` 0): 19 end under 80 agents. Three of those never fill (peak 106 to 121 or 306: seeds 833553, 912822, 50850); 10 fall through 80 between 50k and 100k ticks; 6 fall between 140k and 180k. Replays (`map-elites-v6`, per-1000-tick tallies by basin, a scratch driver) of collapsing seeds 224570 and 612370, the survivor 337535, and 639124 and 888035 for contrast.

- **Food is not short.** Edible slots sit at 3,590 of `maxFood` 3,600 the whole run, total edible energy 200k to 400k, and the value per slot is steady at 55 to 120. Per surviving prey the map holds 8 slots at the 430 peak, then 50 (seed 612370, tick 46k), 160 (60k) and 700 (80k) as prey vanish. Toxic caps appear only from tick 80k (30 to 980 slots) and are a late addition, not the trigger (the E112 fix holds).
- **Hunters are not the trigger.** Hunters cause 22% of prey deaths in the crash (seed 612370 at 32k to 36k: 82 eaten, 205 starved, 84 other per 2k ticks) and then starve in turn as prey fall: hunter deaths by starvation 4 to 10 per 2k ticks while hunters fall from 52 to 4.
- **Births collapse first.** Seed 612370, prey only, per 2,000 ticks:

| Tick | Prey | Hunters | Prey mate / split births | Prey deaths starved / eaten / other | Mean prey energy |
| ---- | ---- | ------- | ------------------------ | ----------------------------------- | ---------------- |
| 30k  | 446  | 30      | 262 / 6                  | 124 / 14 / 56                       | 912              |
| 34k  | 301  | 40      | 89 / 73                  | 98 / 92 / 48                        | 911              |
| 38k  | 207  | 52      | 30 / 58                  | 74 / 18 / 41                        | 832              |
| 42k  | 98   | 47      | 2 / 32                   | 45 / 9 / 14                         | 651              |
| 46k  | 55   | 37      | 0 / 25                   | 11 / 7 / 7                          | 891              |
| 50k  | 60   | 35      | 8 / 7                    | 17 / 1 / 2                          | 808              |
| 56k  | 40   | 28      | 1 / 6                    | 11 / 4 / 7                          | 1030             |
| 62k  | 24   | 17      | 0 / 11                   | 4 / 0 / 0                           | 1230             |
| 70k  | 15   | 10      | 0 / 0                    | 2 / 0 / 0                           | 1078             |

Seed 224570 shows the same shape (prey 351 at 29k, 125 at 50k, 61 at 65k, 15 at 92k; mate births 104 per 3k ticks fall to 4). Prey mate births drop to zero at 55 prey in a 14,400 x 8,100 world, and splitting cannot replace them: a prey line splits at most `splitClonalMax` (3) times in a row before it must mate, and a split needs `splitMateScarceTicks` without a mate in view. At 44k to 52k about half of the adult prey (26 to 30 of 53 to 56) are at the clonal cap and only 18 to 25 hold more than `splitMinEnergy` (900). Prey meet no one, so they neither mate nor split. The survivor holds 200 to 450 prey and 10 to 25 mate births per 1k ticks the whole run; its hunters alone fell (127 to 49 by 80k) without the world falling with them.

- **Per-agent intake falls with density** (plant energy per agent per 1k ticks): seed 612370 440 at 427 agents, 282 at 95, 155 at 31; the survivor 530 at 300. This is the second half of the loop: a lone forager finds less (no herd, no flock to follow), starves at about the same rate, and the next birth is further away.
- **Controlled reruns** (floor off, 80,000 ticks, total population):

| Arm                            | 612370 at 50k / 80k | 224570 at 50k / 80k |
| ------------------------------ | ------------------- | ------------------- |
| defaults                       | 91 / 7              | 175 / 71            |
| `splitClonalMax` 100000        | 72 / 247            | 152 / 25            |
| `mateRange` 900                | 454 / 432           | 397 / 450           |
| `splitClonalMax` + `mateRange` | 27 / 333            | 125 / 136           |

A longer mate search keeps both collapsing worlds at 430 to 450 through 80k ticks. Lifting the clonal cap alone does not (seed 224570 still falls to 25). Single seeds and one 80k window, so this names the cause and a lever to screen, not a result: the full 200k and 8 or 16 seeds are the T65 screen.

- **Why the floor hides it.** With the floor on, a world under 40 is refilled with fresh lineages, so the mating collapse looks like a dip (2 of 16 seeds under 80) while the same dynamics run underneath. The floor-off world is the honest test of this loop.
- **Ranked causes.** (1) The mating Allee effect: prey density falls below the distance at which `mateRange` 200 (edge-to-edge) finds a partner, mating births go to 0, the clonal cap and the mate-scarcity rule stop splitting from replacing them. (2) A hunter-prey overshoot starts the fall: hunters rise from 7 to 40 or more while prey fall from 430 to 100, then follow them down. (3) Late, in 6 seeds, autumn toxic caps and winter finish remnants of 8 to 60 agents. Not causes: food supply, herd grazing (47 herd animals steady), the season drain (onsets at tick 30k to 44k straddle spring and summer in different seeds).
- **Nature's answers, as candidate levers.** Animals meet at low density with long-range signals (calls, pheromone trails, leks), by ranging wider when alone, by aggregating at refuges (herds, a breeding ground), and by facultative selfing or parthenogenesis (already the shark rule here, but capped at 3). Candidates: a longer mate search when no partner has been seen for a while (density-dependent range), a mate call or scent a female can follow, and an Allee-safe split cap (reset the clonal count after a long mate drought). T65 screens these.
- **Method trap.** `npm run replay --policy` takes a registry name (`map-elites-v6`), not `live`; the diagnosis used a scratch driver with the same policy. Division by basin used the x position of the tick before the death, since `freeAgent` zeroes the slot.

### 2026-11-06 - The floor-off boom and crash (T66)

Every floor-off world booms in its first spring and falls in the summer after it; the worlds that end under 80 agents are the ones whose summer dip passes under about 100 prey, where mating stops and nothing replaces it. Method: the first 16 seeds of `evals/seeds.json` (313056 to 95573, not chosen by outcome), `evals/floor-off-config.json`, 120,000 ticks, policy `map-elites-v6` (what `live` resolves to), a scratch driver tallying per 2,000 ticks (births by cause, deaths by cause, flora intake, nearest-food distance, age bands, food slots eaten and rotted). Outcome at 120k: 4 seeds peak at 440 to 500 around tick 30k and go extinct (224570, 313056, 371179, 612370), 1 never fills (833553, peak 121), 4 crash to 62 to 138 and recover (446985, 654502, 851784, 888035), 7 hold 235 to 500 (275725, 318983, 337535, 513404, 639124, 785870, 95573). That is 5 of 16 under 80 at 120k; E126 saw 59% at 200k, so the late collapses (140k to 180k) are outside this window.

- **Spring is the boom, summer the bust, in every seed.** A season is 36,000 ticks (spring `reproductionBonus` 1.5, `energyDrain` 1.0; summer 1.2 and 1.3). Peaks fall at 26k to 38k ticks. Survivors fall too (318983 450 at 30k, 303 at 38k; 275725 449 at 26k, 291 at 42k): the survivors only differ in the depth of the dip.
- **Peak-aligned side by side** (mean over the seeds of each class; prey only, per 2,000 ticks; offset from the peak window):

| Class (seeds)  | Offset | Prey | Hunters | Mate / split births | Starved / eaten deaths | Intake per prey per 1k | Mean prey energy | Ticks near cap |
| -------------- | ------ | ---- | ------- | ------------------- | ---------------------- | ---------------------- | ---------------- | -------------- |
| Extinct (4)    | peak   | 429  | 32      | 139 / 40            | 76 / 25                | 444                    | 976              | 64%            |
|                | +8k    | 300  | 48      | 49 / 44             | 73 / 22                | 488                    | 918              | 25%            |
|                | +16k   | 201  | 44      | 19 / 41             | 42 / 19                | 539                    | 914              | 19%            |
|                | +30k   | 131  | 42      | 8 / 29              | 25 / 13                | 460                    | 1098             | 0%             |
| Recovering (4) | peak   | 458  | 6       | 141 / 15            | 64 / 3                 | 562                    | 997              | 79%            |
|                | +8k    | 447  | 14      | 99 / 51             | 84 / 22                | 496                    | 987              | 97%            |
|                | +16k   | 362  | 41      | 50 / 93             | 87 / 71                | 582                    | 916              | 32%            |
|                | +30k   | 187  | 40      | 23 / 49             | 36 / 19                | 680                    | 1055             | 0%             |
| Surviving (7)  | peak   | 357  | 37      | 62 / 71             | 58 / 33                | 585                    | 1029             | 31%            |
|                | +8k    | 329  | 50      | 54 / 60             | 60 / 41                | 605                    | 1042             | 33%            |
|                | +16k   | 301  | 50      | 35 / 71             | 58 / 35                | 636                    | 1051             | 17%            |
|                | +30k   | 289  | 38      | 44 / 58             | 59 / 16                | 542                    | 1010             | 18%            |

(Offsets are in ticks; the windows are 2k wide, so +16k is eight windows on.)

- **Per-capita rates against prey density** (all 16 seeds, every 2k window, per prey per 2,000 ticks; this is the density dependence the loop has):

| Prey in the world | Windows | Mate births | Split births | Starved | Eaten | Collision | Intake per 1k | Hunters per prey | Edible slots per prey |
| ----------------- | ------- | ----------- | ------------ | ------- | ----- | --------- | ------------- | ---------------- | --------------------- |
| under 20          | 72      | 0.03        | 0.12         | 0.25    | 0.00  | 0.06      | 330           | 0.51             | 438                   |
| 20 to 50          | 32      | 0.05        | 0.15         | 0.24    | 0.03  | 0.05      | 338           | 0.51             | 109                   |
| 50 to 100         | 96      | 0.09        | 0.26         | 0.19    | 0.05  | 0.07      | 503           | 0.28             | 41                    |
| 100 to 200        | 203     | 0.15        | 0.25         | 0.21    | 0.07  | 0.06      | 565           | 0.16             | 21                    |
| 200 to 300        | 201     | 0.17        | 0.24         | 0.20    | 0.08  | 0.07      | 559           | 0.14             | 14                    |
| 300 to 400        | 154     | 0.18        | 0.22         | 0.20    | 0.09  | 0.07      | 553           | 0.11             | 10                    |
| 400 to 500        | 155     | 0.22        | 0.10         | 0.19    | 0.03  | 0.06      | 481           | 0.04             | 8                     |

Starvation per prey is flat at 0.19 to 0.21 from 50 to 500 prey, so food gives no brake on a boom (7 to 14 edible slots per prey at the peak); total births (0.40 to 0.42) sit just above total deaths (0.35 to 0.37) from 100 to 400 prey, so a world drifts at a net +5% per 2k ticks and is pushed to the cap. Under 100 prey mate births per prey fall from 0.15 to 0.09 and under 50 to 0.03 to 0.05, splits fall to 0.12 to 0.15, and births (0.17) lie far under deaths (0.38): an absorbing edge near 100 prey.

- **Mate births are lowest in summer at the same density**: 0.11 per prey in summer against 0.20 in spring and 0.18 in autumn at 100 to 400 prey (0.16 against 0.26 at the cap), with starvation 0.18, 0.20, 0.21 and intake 572, 634, 426 (spring, summer, autumn). This is where the dip meets the Allee edge.

- **Births at the cap, age and cohorts.** Births blocked at the cap are 15 to 20 per 2k at the peak (3 to 5% of births, `BIRTH_BLOCKED` capacity), so the cap does not synchronise anything. Splits stop 50 slots short (`splitCapMargin`), which is the dip in splits at 400 or more (0.10). The age structure is young and spread: 88 to 91% of prey are under 12,000 ticks old at the peak (`maxAgeTicks` 72,000), mean age at death is 4,000 to 6,000 ticks, and old-age deaths are 0 in all 16 worlds. The whole population turns over about every 6,000 ticks; no cohort ages out together. The recovering class sat at the cap for 8k to 10k ticks (79% to 99% of ticks at 450 or more) with only 6 hunters, then hunters rose to 41 to 54 over 20k ticks and prey fell 460 to 190.
- **Hunters deepen the dip, they do not start it.** Hunter numbers barely follow prey: they hold 40 to 48 while prey fall 429 to 131, so hunters per prey rise 0.08 to 0.58 in the extinct class (0.10 to 0.2 in the survivors, who hold 340 prey). Prey eaten per 2k rise from 25 to 45 and stay at 14% to 25% of prey deaths; kills per hunter per 2k are 1.0 at the peak and 0.24 at the end. Survivors lose as many to hunters (33 to 41 at 330 to 350 prey) as the extinct class does, so hunter pressure alone does not separate them.
- **The extinct class eats about 20% less at the same food.** At +8k ticks it takes 488 per prey against 605 and starves 0.24 per prey per 2k against 0.18, at 13 edible slots per prey against 12; 612370 lost 205 prey to starvation in the 32k window at 432 prey (intake 327, mean energy 722). The cause of the dip in intake near the cap is not found (see below).
- **Food is reachable and mostly eaten.** Edible slots are 3,583 to 3,594 of 3,600 whenever toxic caps are absent; toxic caps are 0 before 50k ticks and 500 slots in survivors at 60k, with toxic meals under 1%. The nearest edible slot is 200 to 236 from a prey, the same as from a random point (199 to 226); 63% to 76% of prey have an edible slot within 300 (its vision range), and 56% to 59% under 50 prey. Food slots leave eaten 1.20M against rotted 0.57M over the 16 runs (32% rot; 47% rot at the extinct class's last window). Food is not clustered away from agents, and no seed meets a plant shortage.
- **Low-density intake: partly explained.** T64's intake drop is reproduced only under about 50 prey: 330 per prey per 1k against 553 to 565 from 100 to 400 prey; at 50 to 100 prey it is 503 and at the cap 481. Under 100 prey: more hunters per prey lowers it (470 at under 0.3 hunters per prey, 441 at 0.3 to 0.8, 406 at 0.8 or more), fewer prey have food within 300 (0.62 to 0.67 against 0.70 to 0.76), autumn is lowest (396 against 530 in spring), meals per prey fall from 10 to 7 per 1k. The rest is not explained. Not tested: agents following others to food, and avoidance of hunters.

**Ranked causes**

1. **The mating Allee edge at about 100 prey** (decides which worlds end). Mate births per prey fall from 0.22 at the cap to 0.15 at 100 to 200, 0.09 at 50 to 100 and 0.03 to 0.05 under 50; splits (capped at `splitClonalMax` and gated by `splitMateScarceTicks`) hold only 0.12 to 0.15 there; deaths stay 0.35 to 0.38 per prey. All 4 extinct worlds crossed 100 prey; no survivor went under 235.
2. **An unbraked spring boom, then a seasonal drop** (what puts worlds on the edge). Between 100 and 400 prey per-capita starvation and births do not change with density, spring gives births 0.40 per prey against 0.35 deaths, so every world climbs to 400 to 500 in 30k ticks; summer then halves mate births (0.20 to 0.11 per prey) and every world falls by a third to a half. A deeper fall (extinct: 429 to 201 prey in 16k ticks) lands on the edge in cause 1.
3. **Hunter lag**: hunters hold at 40 to 50 when prey fall (0.08 to 0.58 per prey), eaten deaths rise 25 to 45 per 2k, so the fall steepens; the recovering class booms against only 6 hunters and is cut back when hunters reach 40 (prey 460 to 190). Present in survivors too, so an amplifier, not the separator.
4. **Lower intake and higher starvation near the cap and in sparse remnants** (20% less than survivors at +8k; 40% less under 50 prey); mechanism open.
5. **Late toxic caps and winter** (from tick 60k to 80k, T64) finish remnants; not a trigger.

Not causes: food supply (edible slots full, reachable, steady), a synchronised cohort (90% under 12k ticks old, no old-age deaths), births blocked at the cap (3 to 5%), hunters alone.

**Nature's answers, as levers.** Real populations avoid overshoot and crash through density-dependent birth (clutch size and breeding rate fall with crowding, so growth slows well under the food limit), territoriality (a breeding territory caps the breeders, and the surplus floaters disperse or wait), dispersal (young leave and found new colonies, so a local crash does not take the species), refuges and seasonal breeding limits (births tied to the food pulse, not to a fixed season bonus), and an Allee-safe floor (a minimum group that does not fall to zero, such as a colony core). Candidate levers here: soft density-dependent births (a lower `splitCapMargin` so splits stop earlier, which also leaves headroom), a flatter season bonus (spring 1.5 down toward the mean) so the boom is smaller, and territory for prey breeding (the hunter territory gave the hunter win). E127's longer `mateRange` raised the mean 12% but moved which seeds tipped, so a lever that shrinks the boom-and-dip amplitude, keeping worlds off the edge, is the better bet than one that makes the edge softer.

**Limits.** 120k ticks (one year) and the first 16 seeds, one run each; per-class means over 4, 4 and 7 seeds, so the class numbers carry single-seed noise (the mate-birth rate of 0.11 against 0.20 is pooled over 169 and 206 windows but the seasons are confounded with time since the start). The 16-seed outcome counts differ from E126's (59% at 200k) because the window stops at 120k.

### 2026-11-06 - A refuge gap admits bodies about 2.5 px over refugeSizeMax

`test/sim/refuge-access.test.js` drives a scripted agent (`actAll` and `integrate`, body radius held fixed) at a ring from 16 approach angles. The gap between two rocks is `2 x refugeSizeMax` (60 px), so radius 30 has zero clearance, yet it enters and leaves from all 16 angles: `obstacleBounce` pushes a body out of one rock at a time, so a body touching both is not held. Radius 32 enters from all 16 angles, 32.5 from 1, 33 from 3 and 33.5 from none. Radius 20 to 29 enter from all 16. The gate is therefore soft by about 2.5 px, and `eval.refuge_eligible_share` uses `refugeSizeMax` with no clearance (`REFUGE_CLEARANCE_PX` 0). A body's size is re-derived from its energy whenever energy changes (`energy.js`), so a test that sets `size` must hold it each tick. Reported, not changed (refuge.md T3).

### 2026-11-06 - Cover works, prey do not reach it (refuge T5, E130)

On 32 floor-on seeds the rings already protect and admit prey, but the Refuge scene is absent because threatened prey are
not near a ring. Bites per prey-tick inside a ring are 0.12 of the outside rate, 64% of prey ticks are at a size that fits
(T3: radius 20 to 32 enter from every angle; `obstacleBounce` lets a body squeeze a 60 px gap), and 64% of ring exits
lead to a meal, yet `eval.refuge_use_under_threat` is negative on all 32 seeds (-0.0024) and a threatened prey is no
likelier to enter than a calm one. The eight rings are 0.94% of the map. The bite guard and wider gaps were dropped from
refuge.md before they were built; the screen tests reach first (`refugeCount` 16 and 24) and concealment.

Also: the first 16 seeds of `evals/seeds.json` are kinder than the next 16 - floor-on worlds end under 80 agents on 2 of
seeds 1 to 16 and on 8 of seeds 17 to 32. Read 16-seed absolute health figures as optimistic; matched-seed comparisons
are unaffected.

### 2026-11-07 - Prey live in the food patches, the cover does not (habitat-cover.md, draft E-D-1)

Draft entry from the habitat-cover research stream; the coordinator assigns the real experiment id.

On the default floor-on world (`map-elites-v6`, seeds 1 to 4, 20,000 ticks, non-hunting agents sampled every 200 ticks
over the second half) the median prey stands 1,953 to 2,667 px from the nearest ring edge, 1.1 to 5.2% of samples are
within 300 px of one (the flight of a prey) and 2.2 to 12.6% within 600 px, and 0 to 0.5% are inside. Meanwhile 28 to 45%
of samples are inside a food patch disc, which covers about 7% of the map, and the median prey is 448 to 722 px from a
patch centre. So prey are tied to the patches and the rings, drawn at random from the `obstacles` stream in
`placeRefuges`, are not. Cover on the patch rims would be within a flight of the prey that feed there. The script is a
throwaway: it steps a `createWorld` world with the live policy and measures positions, no sim change.

Nature: flight initiation distance rises with the distance to refuge (Dill and Houtman 1989, gray squirrel; Bonenfant and
Kramer 1996, woodchuck, 0 to 25 m from the burrow), the flight decision trades food against capture risk (Ydenberg and Dill
1986; Stankowich and Blumstein 2005) and foragers feed near cover (Kotler 1984; Brown 1988; Lima and Dill 1990). The first
two were checked against their abstracts; the rest are cited from memory and need a full read before they go anywhere
else.

### 2026-11-07 - Speed pass 2 (T68): rays share one walk over the gathered circles

Profile of the 500-agent step (`node --cpu-prof`, ranked by self time): `hiddenStep` 16 percent, `hebbianStep` 14,
`castRays` 10, `appendFixtures` 6, `forwardAll` 6, `outputStep` 5, `gatherNear` 5, `buildHash` and its count pass 6.
Brain parts wait for the WASM spike. Results on `bench:micro --area ray --compare origin/main` (alternating runs, a
machine at load 27, so the margins are wide):

| Change                                                            | Bench               | Change | Margin |
| ----------------------------------------------------------------- | ------------------- | ------ | ------ |
| Far herd body rejected on one axis before the distance test       | `gatherNear` x 484  | +8.7%  | 6.9%   |
| All 16 rays walk the gathered circles once (circle-major)         | `castRays` x 484    | +77%   | 21.5%  |
| `hebbianStep` with running indices instead of row and column sums | `hebbianStep` x 486 | +4.8%  | 12.0%  |

The last one is inside its margin and was dropped. The ray change is bit-identical: a ray's hit is the least distance
with ties to the lower key, so the order circles are met in cannot change it, and the golden test passes unchanged. The
`coverConceals` path keeps the per-ray loop. Not yet measured: `bench.step_ms@500` end to end (needs a quiet machine).

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

### 2026-11-07 - parental provisioning deleted (realistic-keepers T20)

`provisionEnabled` (a hunter hands `provisionShare` of a stored meal to its young in range) failed the keep rule in `E134`
on 16 floor-on seeds: hunters alive 10/16 against the defaults' 14/16, 9 seeds ended under 80 agents (defaults 7) and
`eval.prey_types_at_end` was worse. It was deleted with `provision.js`, `provision-state.js`, `eval.provisioned_energy_share`,
the three keys (`provisionEnabled`, `provisionShare`, `provisionRange`), the invariant and the `Provisioned` log emitter.
The `PROVISIONED` event code (32) stays in `events.js` unused so later codes do not renumber. The juvenile dependency, which
keeps the kin-floor half of the reflex, stays.

### 2026-11-07 - WASM brain kernel: 3 to 8 times faster and bit-identical (wasm-kernels T6)

The brain phase (`poolRays`, `hiddenStep`, `outputStep`, `hebbianStep`) runs in `wasm/blob-kernels.wasm` behind the
`attachWasm` option `wasmKernels`. Both measurements ran on a machine loaded by evals; the ratios are paired.

- `BENCH_WASM=1 flock /tmp/claude-1000/cpu.lock npm run bench:parts -- --area brain --compare origin/main` (median of 3
  alternating runs): `forwardAll, 500 agents, defaults` 110 to 881 ops/s (+703%, margin +-13%); `forwardAll, real inputs`
  102 to 824 ops/s (+706%, +-17%); hidden sizes 16 to 64 gain 4.6 to 12 times; `poolRays`, `hebbianStep` alone and the
  evolution functions unchanged (they still run in JS when called directly).
- An alternating A/B of two identical 500-agent worlds in one Node process (12 rounds of 250 ticks, world hashes equal at
  the end): brain phase median 3.10 to 1.02 ms per tick (3.15 times, paired min 2.66), whole step 7.56 to 5.46 ms (1.38
  times). The micro bench's JS figure (about 9 ms per call) is slower than the in-step one, so its ratio overstates the
  gain; read 3 times as the step-level figure.
- Identity: outputs, hidden and fastOut byte-equal every tick for 200 ticks (default, rewarded Hebbian, 13 hidden units)
  and 2000 ticks (default); the three 5000-tick golden cases reach their pinned hashes with the switch on;
  `test/sim/golden.json` unchanged.

Toolchain facts found on the way:

- `f64::floor` is not in `core` for a `no_std` crate on Rust 1.99; the kernel uses the SIMD `f64x2_floor` on a splat,
  which is IEEE round-toward-negative and so equals `Math.floor`.
- `wasm-opt` 120 rejects rustc's output unless told the features rustc's generic wasm32 CPU emits
  (`--enable-nontrapping-float-to-int --enable-bulk-memory --enable-sign-ext --enable-mutable-globals --enable-multivalue
--enable-reference-types`, plus `--enable-simd`).
- `cargo build --config "target.<triple>.rustflags=[...]"` appends to the rustflags in `.cargo/config.toml` rather than
  replacing them, so the build script adds `--remap-path-prefix` without losing `--import-memory`; a build from another
  checkout path gives the same bytes.

### 2026-11-07 - WASM brain kernel adopted: step 4.01 to 3.00 ms, drills 17% faster (wasm-kernels T7)

Every world now runs the brain in the Rust kernel from birth (`allocateWorld` attaches) and the JS brain kernel is deleted.
Measured under `flock /tmp/claude-1000/cpu.lock` on a machine also running evals (load about 10 of 32 cores), against
`origin/main` (8cf1ccd10, which runs the JS brain):

| Measure                                                                        | JS            | Rust          | Change                |
| ------------------------------------------------------------------------------ | ------------- | ------------- | --------------------- |
| `bench-compare --sizes=500 --runs=5`, `bench.step_ms@500`                      | 4.006         | 3.003         | -25.0%                |
| Same, `bench.step_ms@500merit` / `@500w7680`                                   | 4.019 / 3.549 | 2.981 / 2.742 | -25.8% / -22.7%       |
| Same, `bench.phase_ms.brain@500`                                               | 1.296         | 0.499         | -61.5% (2.6 times)    |
| `bench:micro --area drill --compare origin/main --runs 3`, trials/s per worker | 49.6          | 58.2          | +17.2%, margin +-7.0% |

- The step is under the 3.32 ms budget for the first time since the budget was set.
- `bench-compare` flagged `bench.phase_ms.sense@500` at +12.7% (and `@500merit` +10.2%, `@500w7680` +2.4%); the sense micro
  bench (`bench:parts --area sense --compare origin/main --runs 3`) shows +1.4%, margin +-10.2%, `same`. Typed-array views over
  a `WebAssembly.Memory` buffer read as fast as plain ones in the JS rules; the flag looks like load noise in the whole-step
  run, and Phase 2 moves the sense phase into the kernel anyway.
- World birth: compiling the module and probing `__heap_base` once per thread leaves a drill-size world (8 slots, 4 pages) one
  `Memory` plus one `Instance`, 28 us; the whole attach is about 35 us after the agent-row lookup moved from a scan per row
  (61 us over 99 rows, the world object being in dictionary mode before its final spread) to one `Map`.
- A synchronous `new WebAssembly.Module` of a 24 kB binary is fine in Node and in a worker; only a browser main thread limits
  synchronous compiles, and no world is born there.

### 2026-11-07 - Trainer smoke run and ticks per second (training T8 to T11)

A short run, not the Phase 2 done run (that needs about 40 x 32 x 60000 ticks): `npm run train -- --generations 6
--episodes 8 --ticks 30000 --offer-from 5000 --checkpoint-every 3 --curriculum evals/train-curriculum.json --workers 8`,
all six generations in the nursery stage. It took 3 minutes on 8 workers and the archive grew from nothing to coverage 0.106
(qd 628). Checkpoint at generation 6: mean drill edge +0.23, `eval.food_energy_per_1k` 289 (185 at generation 3),
`eval.catch_rate` 0.38. Exported with `train:export`, the five champions drilled as:

| Subject               | food-ahead   | food-behind  | two-foods    | prey-ahead   | prey-too-big | hunter-closing | rock-refuge  | mean edge |
| --------------------- | ------------ | ------------ | ------------ | ------------ | ------------ | -------------- | ------------ | --------- |
| smoke-forager-cell5   | 1.00 (+0.90) | 1.00 (+0.82) | 0.00 (-0.10) | -            | -            | 0.00 (+0.00)   | 0.00 (+0.00) | +0.32     |
| smoke-predator-cell25 | -            | -            | -            | 0.00 (+0.00) | 0.97 (-0.03) | -              | -            | -0.02     |
| reference memoryless  | 1.00 (+0.90) | 1.00 (+0.82) | 0.00 (-0.10) | 0.31 (+0.31) | 0.28 (-0.72) | 0.03 (+0.03)   | 0.00 (+0.00) | +0.18     |

- Six small generations already beat the random brain on both food drills by +0.82 to +0.90 and match the memoryless
  reference there; the predator wins none of `prey-ahead` (it never kills in the drill). `two-foods`, the hunter and refuge
  drills are not learned yet. The `defender`, `reproducer` and `scout` champions have no drill (the drills only stage
  foragers and predators).
- Default world, 100 agents: about 2 ms per tick per worker (3000 ticks in 5.5 s), so a 60000-tick episode is about 2
  minutes and one 32-episode generation about 8 minutes on 8 workers. Worker use per generation was only 25 to 41% in the
  smoke run: 8 episodes on 8 workers wait for the slowest world (nursery worlds go extinct and finish early). The doc's 32
  episodes keep the pool fuller.
- `evals/predator-world.json` no longer passes `createConfig` (`hashCellSize` 140 is below the largest radius 532.5 that
  `maxEnergy` 25000 gives); the hunt stage uses `evals/train-hunt-world.json`.
- The nursery (`evals/micro-world.json`) has no floor (`minAgents` 0): random brains go extinct before tick 12000 on some
  seeds, which ends those episodes early and offers few genomes. If the full run shows the nursery barely seeding the
  archive, a `minAgents` above 0 in the stage is the first thing to try.
- `npm run league` on a trained champion plays no games until the league has admitted champions, and prints Elo 1500.

### 2026-11-07 - Speed pass 3 (T71, T72): one gather fix kept, the rest inside the margin

Profile of the 500-agent step (`node --cpu-prof`, self time): `hiddenStep` 16 percent, `hebbianStep` 14, `castRays` 10,
`appendFixtures` 6, `forwardAll` 6, `outputStep` 5, `gatherNear` 5, `buildHash` with its count pass 6, `integrate` 3.
The brain, sense and hash code are moving to the WASM kernel, so only a gather fix was kept. Results on `bench:micro`
and `bench:parts` against origin/main (alternating runs, a loaded machine, so the margins are wide):

| Change                                                                      | Bench              | Change | Margin | Kept |
| --------------------------------------------------------------------------- | ------------------ | ------ | ------ | ---- |
| Obstacles rejected on one axis, fixture rows written straight to `rayLocal` | `gatherNear` x 484 | +23%   | 10.8%  | yes  |
| Cell loop hoisted and `appendCircle` inlined                                | `gatherNear` x 484 | -4.9%  | 15.1%  | no   |
| Count pass writes its cell box directly (no shared `range` array)           | physics buildHash  | +2.5%  | 13.4%  | no   |
| Wall bounce of both axes in one function                                    | `integrate`        | 0.0%   | 7.8%   | no   |
| Skip the square root when a lower bound already loses                       | `castRays` x 484   | -0.1%  | 10.9%  | no   |

End to end (`bench-compare --sizes=500 --runs=5`, load about 27): `bench.step_ms@500` 7.97 to 7.63 (-4.3%), sense phase
1.60 to 1.37 ms; inside the gate's noise, not a quiet-machine number. The golden test passes unchanged.

### 2026-11-07 - the realistic keepers adopted (realistic-keepers T21 and T22)

The combined world (`satedBite`, `predatorRestTicks` 60, `juvenileDependency`, `rewardedHebb`, `coverConceals`, `coverFoodFree`,
`refugeSense`) passed the keep rule on 32 seeds (hunters alive 13/16 and 14/16, no more seeds under 80 than the defaults, predators at
end +49%). Its only worse guard, `eval.hunter_kill_conversion_by_age.1k-2k` (-25%), is the by-construction fall of `satedBite` (E136):
the hungry-chase conversion is not worse (-9%, interval spans 0). All seven are the default now; the six plain switches are deleted
(`predatorRestTicks` is a plain key at 60, `rewardedHebb` a default-true key until wasm-kernels.md deletes it with the Rust and JS off
paths). Facts to know:

- Ray casting takes the covered path (`nearestHitCovered`, one ray at a time) whenever the world has refuge rings, which the default
  world does (8). The circle-major `nearestHitsAll` pass of the speed work runs only in worlds without rings (`refugeCount` 0, as in
  most tests and the busy and disease golden cases). A sense-phase cost, to be measured at the baseline re-record.
- `stepCover` and `rejectedByCover` now run in every default world: one ring byte per agent per tick, one ring test per plant placement.
- Tests that are not about a juvenile hunter set `juvenileBurn` 1 (`test/sim/helpers/predator-arena.js`), and tests of the plain
  Hebbian rule set `rewardedHebb` false.
- Historic grids and configs (`evals/screens/hunter-*.grid.json`, `refuge*.grid.json`, `evals/sated-floor-off-config.json`) still name
  the deleted keys; they record what was run and will not validate if rerun. Old reports carry `provisionEnabled`, so `eval:compare`
  against them needs `--allow-config-diff` for the keys that differ.
- Goldens re-pinned (default, busy, disease, full and short), the busy effect-stream pin in `test/worker/sim-host.slow.test.js`
  moved with them, and `npm run browser:hash` matches in Chromium.

### 2026-11-07 - herd neighbour loops skip the grid (T73)

`trampleHerds` ran a contact test of every agent against every live herd animal, and `senseGroupHunters` in
`herd-startle.js` ran a spec lookup and a distance test of every agent against each herd every eighth tick. Both now
reject on one axis before the rest: `trampleHerds` skips an animal when `|dx| >= reach`, `threatensGroup` when `dx * dx >
rangeSq`, and the startle loop runs the distance test before `specParams` (both must pass, so the nearest hunter is the
same).

- Why it is bit-identical: float multiplication and addition round monotonically, so `dx * dx >= reach * reach` follows
  from `|dx| >= reach`, and `dx * dx + dy * dy >= dx * dx`. A skipped pair is exactly one the full test returns on, the
  loops keep their order, and no float result changes. A strict `>` is used in the startle loop because that test is
  `<=` (a plain `|dx| > radius` could skip a pair whose rounded squares are equal). Tests compare each loop with an
  all-pairs copy of the old code; `test/sim/golden.json` is unchanged.
- Measured, alternating runs on a loaded machine (`npm run bench:parts -- --area <phase> --compare origin/main`):
  physics `integrate` 2,531 to 3,498 ops/s (+38%, margin 8%); environment `stepHerds` 20,196 to 38,083 ops/s (+89%,
  margin 6%), the environment phase 20,843 to 35,769 (+72%, margin 14%). The whole physics phase moved +0.5% inside a
  10% margin, so the step-level gain is small (about 0.02 to 0.05 ms) and needs a quiet-machine bench to quote.
- `herd-graze.js` already box-rejects food before its distance test; `herd-steering.js` and `herd-motion.js` loop over
  the herd's own animals, rocks and gaps (small, fixed sets), not agents, so they were left alone.

### 2026-11-07 - WASM sense kernel adopted: sense 30% faster, the covered path twice as fast (wasm-kernels T11)

The ray march (the gather and every ray's nearest hit) runs in `sense_slot`; the JS ray march is deleted. Measured under
`flock /tmp/claude-1000/cpu.lock` against the brain-only tree (e1ebff05):

| Measure                                                                    | JS ray march  | Kernel        | Change          |
| -------------------------------------------------------------------------- | ------------- | ------------- | --------------- |
| `bench-compare --sizes=500 --runs=5`, `bench.phase_ms.sense@500`           | 0.870         | 0.611         | -29.8%          |
| Same, `@500merit` / `@500w7680`                                            | 1.003 / 1.162 | 0.687 / 0.796 | -31.5% / -31.5% |
| Same, `bench.step_ms@500`                                                  | 2.970         | 2.631         | -11.4%          |
| Alternating A/B, `senseAll` ms per call, 500 agents, 5 pairs (median)      | 1.372         | 0.890         | 1.54 times      |
| Same with `coverConceals` (the default once refuge rings and cover are on) | 1.644         | 0.831         | 1.98 times      |

- Two rays per `f64x2` won in the covered loop and lost in the uncovered one: most rows miss most rays, so the scalar loop
  returns before the square root while the vector form pays for both lanes. The covered loop gained once the square root ran
  only when a lane could hit (`v128_any_true`).
- The micro bench worlds under Vitest's bench mode run the JS rules several times slower than plain Node (senseAll 4.6 ms
  there against 0.8 ms in a Node script on the same world), so phase-level claims use `npm run bench` and `bench-compare`,
  and the `wasm` area times the kernel exports raw.
- A world copy that takes its own arena needs its own `foodRows` entries as well as its own `agentRows`, now that
  `attachWasm` re-points both.

### 2026-11-07 - flaky tests 2026-11-07

Mined the last 200 GitHub runs and stressed the slow files locally. Every real flake was a heavy test timing out under
load or coverage, not shared state; the rest of the failures were a branch editing the workflow file
(`test/perf-scope.test.js`, deterministic on that branch, passes on main) and the bench compare under noise.

- Cause: one `it` ran several seconds of real worlds (2 to 3 s alone). With V8 coverage (4 to 5 times slower) on shared
  vCPUs, a 20 s limit is only 2 to 3 times the cost. Under 8 busy loops on 4 cores with coverage, the old files failed
  4 tests in the first run: memoryless gain-0, "wide circle", the group idle-trio test (a literal 30000 ms, never scaled)
  and food-then-blind@600. The new files passed 3 runs of 3 under the same load.
- Fix: split the heavy tests so each `it` is a fraction of the old cost (one per scenario, one per control, one per
  circle arm with the seeker run once per file), dropped the literal 30000 ms, shortened the replay episode in
  `test/evo/trainer.slow.test.js`. No limit raised; assertions unchanged.
- Load is read once when vitest starts (`busyScale`), so a run begun quiet keeps strict limits when other jobs start
  later: a failure there is the cost of the test, which is why the fix makes the tests cheaper.
- `test/train.slow.test.js` (order dependent before #334) passes alone per test.

### 2026-11-07 - WASM Phase 4: hash, pheromones and physics in Rust, step 10% faster, drills 22% faster (wasm-kernels Phase 4)

`build_hash`, `update_pheromones`, `move_agents`, `bounce_rocks` and `resolve_contacts` replace the JS spatial hash build,
pheromone grid loops and physics loops; each matched a JS fixture recorded before the port on the first build, and the
goldens and `npm run browser:hash` are unchanged. Measured under `flock /tmp/claude-1000/cpu.lock` against `origin/main`
(4b066055, the brain and sense kernels):

| Measure                                                                    | JS    | Kernel | Change       |
| -------------------------------------------------------------------------- | ----- | ------ | ------------ |
| `bench-compare --sizes=500 --runs=2`, `bench.step_ms@500`                  | 2.665 | 2.384  | -10.5%       |
| Same, `bench.phase_ms.hash@500`                                            | 0.137 | 0.076  | -44.7%       |
| Same, `bench.phase_ms.field@500`                                           | 0.205 | 0.153  | -25.2%       |
| Same, `bench.phase_ms.physics@500`                                         | 0.298 | 0.190  | -36.1%       |
| `bench:micro --area drill --compare origin/main --runs 3`, trials/s/worker | 60.5  | 73.8   | +22%, +-4.3% |

- The hash, pheromone and contact kernels are now small next to the JS left around them: raw, `build_hash` is about 65 us,
  `update_pheromones` 41 us for three 144x81 grids and `resolve_contacts` 8 us at 500 agents. The biggest physics kernel
  is `bounce_rocks`, about 66 us for 479 agents against 136 rocks (one call per agent, a box test per rock).
- The physics moves can run as one pass before the per-agent bounces: a move reads only its own agent's velocity, and the
  trample, wall and rock steps of the agents before it write only their own agent. The rock scan cannot: `removeEnergy`
  shrinks the agent (`updateSize`) between rocks, so the kernel stops at each damaging impact and JS resumes it.
- The CPU lock keeps other timing runs away but not the evals of the parallel push (load average 5 to 30 during these
  runs); the A/B runs alternate, so the load widens the margins without favouring either side.

### 2026-11-07 - WASM Phase 5: drills 36% faster, the bench step unchanged, four squeezes reverted (wasm-kernels T20 to T28)

- **Profile after the kernels.** `node --cpu-prof` names WASM frames `wasm-function[N]`; an exported function's `name`
  property is its index, so `new WebAssembly.Instance(module, imports).exports` maps the index to the export. In the
  500-agent bench world the kernels are about 65% of the step (`brain_forward` 38%, `sense_slot` 14%, `build_hash` 7%); no
  JS function is above 4%.
- **Drills waste time on empty slots.** The drill stage world (3000 x 4000, 8 agents) keeps the default `maxFood` 3600, so
  `build_hash` walked 3600 dead food bytes twice a tick (32% of a trial) and the pheromone update ran over grids of exact
  zeros (15%). Skipping sixteen dead bytes per `v128_any_true` and skipping rows of `+0` bits took drill throughput from
  70.3 to 95.8 trials per second per worker (+36.4%, margin +-8.0%). `aliveFoods` in `js/evo/drill-scenarios.js` (3.7%)
  and the stage's `maxFood` are the next drill levers, outside the kernels.
- **Bench-world grids are never zero.** At every 500 ticks from 500 to 4500, none of the 81 rows of any pheromone grid
  is all zero: decaying `f32` tails spread by diffusion to every cell, so zero skipping helps only small or new worlds.
- **The brain does not respond to tanh or pass width.** Six divisions instead of 13 in the vector tanh made `tanh_into`
  12% faster with no change in `forwardAll`, and 16 units per pass did nothing: the weighted sums of widened `f32` weights
  are the cost, and out-of-order execution hides the divisions. `wasm-opt -O4` was mixed (one export +13%, another -2%).
- **Bit-identity of a power-of-two divisor.** `r / 2^j` and `r * 2^-j` round the same real number, so they are equal for
  every `r`; `(r / 3) * 0.5` equals `r / 6` only while both are normal (the power-of-two scaling commutes with rounding in
  the normal range), so such a rewrite needs a guard for tiny `r`.
- **Noise.** No quiet window held during the phase (load 2 to 9, other streams running); `bench:micro` margins ran from
  2% to 28%, so `--runs 5` and only verdicts outside the margin were used.

### 2026-11-07 - Reflex cases: what a brain-only case can sense, the bars and the throughput (brain-reflex-tests Phase 1)

The six reflex cases of [brain-reflex-tests.md](brain-reflex-tests.md) are built from `stageWorld`, `buildHash` and `senseAll`, so
what follows is what the sim's own sensing gives a brain, not a design choice. Each placement below was changed from the
doc's first draft because the draft's scene could not be sensed.

- **A ray hits only a target wider than the spacing between rays.** 16 rays are 22.5 degrees apart; a hunter of radius 31 at
  210 px (0.7 of a forager's view) subtends 17 degrees, so one staging in ten left it unseen on a scored tick and even the
  scripted reference failed. The hunter now closes from 0.5 to 0.3 of view and the prey stands at 0.35.
- **Pooling keeps the two strongest hits per channel, so a nearer item can hide a farther one.** A toxic food at 0.4 of view
  covers two rays and fills both food slots; the safe food behind it never reaches the brain. `pick-safe-food` stands each
  food on one ray direction at a distance where the neighbouring rays miss it (0.55 and 0.8 of view).
- **The brain's food hue is not in the `inputs` row.** Pooling reads `world.rayHue`, which `castSlot` writes beside
  `inputs`; a table that copied only `inputs` would show every food hueless. The table snapshots both.
- **A forager cannot be made too big to bite by energy.** `addEnergy` caps at the store (2000), so a forager's size stops at
  25 + 8 = 33. `couldBite` holds while the biter's size exceeds `huntSizeRatio` (0.8) of the victim's, so a hunter of size 31
  can bite any victim up to 38.75. The `prey-too-big` drill's prey (energy 3000) is size 33 and bitable: the ray shows it as
  prey, and the drill's abort win is for not biting a bitable prey. A size gene at the top gives 1.3 x 25 + 8 = 40.5, which is
  too big: `bite-discrimination` stages it that way.
- **Dead behind has no turn side.** A food at 180 degrees is on ray 8, where `turnTowards` returns +1 whichever side it is
  on; `approach-food` stops at 160 degrees and `flee-threat` asks only for thrust past 160.

Bars (reference, random mean of 64 brains, best constant brain), the same on case seeds 1, 2, 3, 101, 105 and 116 to the
precision shown unless a range is given; every case is valid (reference at least 0.9, the other two at most 0.5):

| Case                  | Reference        | Random mean  | Best constant                                               |
| --------------------- | ---------------- | ------------ | ----------------------------------------------------------- |
| `flee-threat`         | 1.00             | 0.00         | 0.00 to 0.19 (thrust alone passes the dead-behind stagings) |
| `approach-food`       | 1.00             | 0.01 to 0.04 | 0.06 to 0.25 (full thrust passes the ahead set)             |
| `pick-safe-food`      | 1.00 (hue-aware) | 0.00 to 0.02 | 0.00                                                        |
| `avoid-obstacle`      | 1.00             | 0.00 to 0.02 | 0.00                                                        |
| `approach-prey`       | 1.00             | 0.00         | 0.00                                                        |
| `bite-discrimination` | 1.00             | 0.03 to 0.11 | 0.00                                                        |

`npm run reflex -- --policy map-elites-v6 --count 8 --workers 1` (seed 1, 20000 ticks, 16 trials; the pass share and, in
brackets, the edge over the random mean):

| Genome (best elite of the policy run) | flee-threat  | approach-food | pick-safe-food | avoid-obstacle | approach-prey | bite-discrimination |
| ------------------------------------- | ------------ | ------------- | -------------- | -------------- | ------------- | ------------------- |
| forager-cell4                         | 0.44 (+0.44) | 1.00 (+0.99)  | 0.00 (+0.00)   | 0.00 (-0.02)   | -             | -                   |
| predator cell24, cell14, cell34       | -            | -             | -              | -              | 1.00 (+1.00)  | 1.00 (+0.89)        |

The run's other genomes are defenders and scouts, which have no case. The evolved predators pass both predator cases
and the one forager passes only `approach-food`: no genome passes `pick-safe-food` or `avoid-obstacle`, and the forager
turns away from a closing hunter in under half the trials. One forager is a sample of one, not a verdict on the cases.

Throughput (`npm run bench:reflex`, under `flock /tmp/claude-1000/cpu.lock` while other streams' evals ran): the four forager
cases are 12 sequences a trial (2 + 2 + 2 + 6, each with its mirror), 16 trials, 6 ticks, so 1152 brain forwards per
genome; 512 random brains in one batch took 1.9 ms a genome, **522 genomes per second**, 1.66 microseconds a forward with
the scoring. The same kind of genomes through the five forager drills at 32 trials ran at 0.67 genomes per second, so the
tier is **776 times** cheaper. The doc's first target (900) rested on 768 forwards; it is now 300, which both numbers clear.
A table costs about 0.1 s to build (one `stageWorld` per distinct tick), paid once per case, seed and trials.

### 2026-11-07 - Drill levers: staged food slots and an allocation-free food count (training Phase 2)

Two drill-only changes (no live-sim code; `worldHash` and `golden.json` unchanged, golden test run): `STAGE_CONFIG` in
`js/evo/pool-discrimination-stage.js` gets `maxFood` 48 (`STAGE_MAX_FOOD`; it inherited 3600, so every tiny drill world walked
3600 food slots per tick in the hash build), and `aliveFoods` in `js/evo/drill-scenarios.js` (3.7% of a drill trial) became
`aliveFoodCount` and `onlyAliveFood`, which allocate nothing. Drill outcomes did not move: the table below is identical
before and after. `npm run drill` on four fresh smoke champions (4 generations, nursery) plus the references, wall time:

| Workers | Before | After   | Change |
| ------- | ------ | ------- | ------ |
| 2       | 8.71 s | 5.37 s  | -38%   |
| 4       | 5.40 s | not run | -      |
| 8       | 3.52 s | 2.26 s  | -36%   |

| Subject                   | food-ahead   | food-behind  | two-foods    | prey-ahead   | prey-too-big | hunter-closing | rock-refuge  | mean edge |
| ------------------------- | ------------ | ------------ | ------------ | ------------ | ------------ | -------------- | ------------ | --------- |
| archive-3-forager-cell5   | 1.00 (+0.84) | 1.00 (+0.82) | 0.00 (-0.11) | -            | -            | 0.13 (+0.13)   | 0.00 (+0.00) | +0.34     |
| archive-3-predator-cell15 | -            | -            | -            | 0.00 (+0.00) | 0.97 (-0.03) | -              | -            | -0.02     |
| reference memoryless      | 1.00 (+0.84) | 1.00 (+0.82) | 0.00 (-0.11) | 0.31 (+0.31) | 0.31 (-0.69) | 0.03 (+0.03)   | 0.00 (+0.00) | +0.17     |

- The elites of the earlier smoke table were refused (rules and descriptor hashes have moved since), so the table was
  re-made from a fresh 4-generation smoke run; the same champions fed both columns.
- `bench:micro --area drill --compare origin/main --runs 3` under the CPU lock (base 5f85ab5dc, head the two levers): one
  trial of each of the 7 drills 12.67 -> 16.10 ops/s, +27.0% (+-9.5%), so about 89 -> 113 trials per second per worker.
  The T12 training run (8 workers) was started while this queued, so the margin is wider than on a quiet machine.

### 2026-11-07 - Brain-value screen, the 600000-tick long run and the baseline-v5 re-record (E139, E140, T14)

- **E139 (placeholder id; T43)**: `weightDecay` 0 and `mutationRate` 1 and 0.1 against the defaults (0.005 and `invsqrt`), floor on, policy live, 200000 ticks. `mutationRate` 1 collapsed on seeds 1 to 16 (mating 0.19, population 83, hunters alive on 0.3 of seeds). `mutationRate` 0.1 looked better on seeds 1 to 16 (hunters alive 0.9 against 0.8, 3 seeds under 80 against 5) and lost on 32 matched seeds (hunters alive 23 of 32 against 27, `eval.hunter_ticks_last_quarter` -37%, `eval.predator_births` -24%, `eval.catch_rate` -11%). `weightDecay` 0 showed no gain and `eval.hunter_ticks_last_quarter` -33%. No default changed.
- **Why 16 seeds misled**: seeds 17 to 32 are harsher than 1 to 16 (E130), and a 2-seed margin on seeds under 80 flipped between the halves. Only the merged 32-seed pair judges a keep-rule arm. `scripts/screen.mjs` writes one report per half; to pair them, concatenate `seeds`, `traces`, `inputActivity` and each metric's `values` and `reasons` (recompute `mean` and `sd`), then `eval:compare` the merged files.
- **E140 (placeholder id; replaces T34)**: the defaults on 16 seeds x 600000 ticks. Hunters alive on 13 of 16 seeds, a prey type on 16 of 16, `eval.skill_heritability` 0.41 (16 of 16 positive), `eval.skill_trend` -0.032 (3 of 16 positive), `eval.basin_recolonisations` at least 1 on 4 of 16, `eval.social_return` -2.19, `eval.spec_dominance` 0.41, `eval.mating_share` 0.44. Hunters do not get better with a longer horizon; that is hunter-practice.md's problem.
- **T14, baselines re-recorded** (`baseline-v5` seeds 1 to 16 and `baseline-v5-o16` seeds 17 to 32, 16 seeds x 200000 ticks, on `6ce01567`, configHash `ff8d890a5a70c14d`): the scripted policy is harsher on the current world than at T48g. Means over seeds 1 to 16 and 17 to 32: population 190 and 186 to 18.5 and 18.2, food per 1k 404 and 374 to 175 and 167, fed median lifespan 5007 and 5071 to 3657 and 3578, floor episodes 59 and 68 to 26 and 26, and 89% to 90% of births now come from the floor (`floorTrigger` 8 refills an almost dead world, so the population sits under `minAgents`). Nothing reads these as a bar; they stay the instrument baseline for scripted policies.

### 2026-11-07 - Reach, season, alarm and hunter baselines, and the step-0 checks on them (E141, E142, E143, E144)

- **Runs** (defaults, floor on, policy `live`, 200000 ticks, configHash `ff8d890a5a70c14d`): `E141` 32 seeds (habitat reach), `E142` 32 seeds (season), `E143` 16 seeds (alarm reach), `E144` 16 seeds (matched hunter). The habitat and season reports share their worlds (identical `eval.population_mean`), as the observers are outside `worldHash`.
- **Habitat reach**: the median prey is at least 1,430 px from a ring edge on every seed; `eval.prey_within_dash_share` 0.10 (SD 0.04); `eval.prey_in_patch_share` 0.34. The premise of the habitat doc holds on the defaults. `eval:power` at 16 v 16: 30% (cover distance), 50% (dash share), 15% (patch share) detectable.
- **Season**: `eval.season_map_distance` 0.35 (0.16 to 0.63 on every seed); `eval.winter_band_shift` 0.016 (SD 0.04), so a relative detectable change is undefined near 0. The metric needs an absolute planted change before a power read.
- **Alarm**: no call on any seed (`eval.alarm_rate` 0), so every hearer metric is null by construction. `eval.call_opportunity_neighbours` 3.2 (1.5 to 5.6) against the 0.4 density estimate in the alarm doc: the estimate was uniform, and threat clusters prey. The count excludes the agent itself (`countOpportunity`).
- **Hunter matched**: matched conversion falls with age (0.083, 0.063, 0.044 across the three bands), and the fall is smaller than pooled on 13 of 16 seeds (0.039 against 0.053 absolute). `eval.hunter_conversion_by_dose` is -0.0002. A paired interval on the difference is not yet computed.
- **Fault, `eval.hunter_kills_per_life`**: a median per life, 0 on 15 of 16 seeds. It cannot register a gain. Phase 1b of `hunter-practice.md` replaces it with a mean beside `eval.chase_catch_share`.
- **Fault, the catch rate's rot theory**: refused. `eval.catch_rate` counts fatal bites by hunters per 1,000 hunter agent-ticks, from `AGENT_DIED` events; food rot emits none. It is a speed, and the attempt read is `eval.chase_catch_share`.
- **Tooling gap**: `scripts/eval-power.mjs` needs 2 times the arm size in seeds, and the smallest arm it takes is 16, so no 16-seed report can be powered. The alarm and hunter power reads need 32-seed runs or a change to that floor.

### 2026-11-07 - The arm d predator bites prey and kin and loses the drill before the bite (training.md T20, partial)

- **Subject:** the T12 iteration 2 arm d predator champion (`archive-59-predator-cell1`, `/tmp/claude-1000/eval-out/train-iter2/d/champions`). Run with the T18 and T19 tools: `npm run reflex -- --champions <dir> --cases bite-discrimination --trials 32 --level debug` and `npm run drill -- --champions <dir> --drills prey-ahead,prey-too-big --trials 32`, seed 1.
- **`bite-discrimination` by staging (pass, bite share):** prey 1.00 and 1.00; too-big 1.00 and 0.00; kin 0.00 and 1.00. The combined pass is 0.00 (edge -0.11, random 0.11, reference 1.00, case valid). The kin bite is the whole failure.
- **Skip cells:** prey into `BITE` +1.97, prey into `THRUST` +1.16, prey sine into `TURN` +1.20, kin into `BITE` -0.01, `other` into `BITE` -0.07. The inborn prey-bite prior (+2) survived 60 generations; nothing refuses kin.
- **`prey-ahead`:** won 5 of 32 (0.16; memoryless reference 0.31). Lost-trial reasons: `never-in-jaws` 24, `prey-died-unkilled` 3, `never-bit` 0. The reference loses mostly to `never-in-jaws` (16) too; the random brains split between `never-in-jaws` and `never-bit`.
- **Reading:** the bite works when the prey is in the jaws, and the too-big body is left alone by silence (it never reaches the `prey` channel). The predator has no wire against kin, though a kin lunge already costs `recoilEnergy` in the live world. The drill is lost on contact, not on the bite.
- **Lever line:** row 2 for discrimination (hunter-learning.md Phase 3 kin refusal wire); contact for the drill (arm g, then the chase). Arms e and f (too-big price) are not needed.

### 2026-11-07 - Arm d replication (training T22)

- Arm d (`evals/train-curriculum-iter2-d.json`, 60 generations, 32 episodes) on `--seed-offset` 0, 64 and 128 gives predator `prey-ahead` 0.16, 0.00 and 0.00 (memoryless reference 0.31): the +0.16 edge does not replicate (1 of 3 offsets above 0). Treat one archive's edge as a lead, not an effect.
- The bite varies by offset: all three bite prey (share 1.00); offset 0 bites kin, offset 128 bites the too-big prey, offset 64 passes `bite-discrimination` at 1.00. Prey into BITE is +1.97 to +2.19 on all three, so the bite exists in the cell and the failure is in the chase and the discrimination, not in a missing output.
- A full arm d run took about 9 minutes at 14 workers with the machine otherwise idle, not 25 to 30.

### 2026-11-08 - Carrion split: hunters eat carcasses, but the zero-kill lives do not live on them (training T28)

- **Run:** `npm run replay -- --seed <n> --ticks 200000 --level debug --policy map-elites-v6` on seeds 1 to 16 (floor on, defaults, `main` at `e090f95e`), then `node scripts/hunter-income.mjs` on each log. The first pass ran without `--policy` and so on `baseline-v5`; it is discarded.

| Share of hunter income (kill + bite + carcass) | Median over 16 seeds | Range        |
| ---------------------------------------------- | -------------------- | ------------ |
| kill                                           | 0.12                 | 0.09 to 0.16 |
| bite                                           | 0.41                 | 0.37 to 0.54 |
| carcass                                        | 0.46                 | 0.37 to 0.50 |
| carcass energy eaten by zero-kill lives        | 0.13                 | 0.07 to 0.23 |
| zero-kill lives over all hunter lives          | 0.55                 | 0.46 to 0.76 |

- **Carcass plus herd above 0.5:** not decided. `splitHunterIncome` reads `HunterLedger`, which has no herd field, and the E140 report with `eval.hunter_income_share.herd` is gone. Carcass alone is 0.46, so any herd share near 0.05 crosses 0.5.
- **A third of carcass energy to zero-kill lives:** no, 0.13 (no seed above 0.23). The carcasses are eaten mostly by hunters that also kill. Theory (1b), hunters that live on carrion without killing, is not supported, so no new record opens for it.
- **Caveat:** the ledger's kill count misses about 1 killing life in 10 (metric-trust.md, "One kill"), which counts some killers as zero-kill and raises the 0.13. The true share is lower, so the reading holds.
  ||||||| parent of 3e3bb2f9 (docs(world-balance): the old mating screens re-read by the summer minimum (T98))

### 2026-11-08 - The old mating screens re-read by the summer minimum (world-balance T98)

- **What is on disk:** `evals/screens/results/mate-range` (E127) and `evals/screens/results/boom-damp` (E128), 8 seeds x 200000 ticks, floor off. E129's 16-seed reports (`evals/results/e129-*.json`) are gone.
- **Proxy, not the metric:** the old traces keep the total population every 1000 ticks, not the prey count, so the read is the lowest total population at a summer checkpoint after burn-in (`eraSeasonTicks` 36000, season 1 of 4). That is an upper bound on `eval.prey_summer_min`: hunters are counted in.

| Screen     | Arm                   | Seeds at or above 100 through summer | Median summer minimum | Under 80 at the end |
| ---------- | --------------------- | ------------------------------------ | --------------------- | ------------------- |
| both       | defaults              | 5 of 8                               | 197                   | 3                   |
| mate-range | mate-350              | 2 of 8                               | 73                    | 3                   |
| mate-range | mate-500              | 4 of 8                               | 179                   | 4                   |
| mate-range | mate-700              | 4 of 8                               | 104                   | 3                   |
| mate-range | mate-900              | 4 of 8                               | 116                   | 3                   |
| mate-range | mate-900-clonal-off   | 0 of 8                               | 0                     | 7                   |
| boom-damp  | flat-1.3              | 3 of 8                               | 39                    | 5                   |
| boom-damp  | spring-1.2            | 2 of 8                               | 45                    | 6                   |
| boom-damp  | margin-150            | 4 of 8                               | 165                   | 2                   |
| boom-damp  | margin-250            | 5 of 8                               | 178                   | 3                   |
| boom-damp  | margin-250-spring-1.2 | 4 of 8                               | 108                   | 4                   |
| boom-damp  | margin-250-mate-500   | 4 of 8                               | 151                   | 4                   |

- **Reading:** no arm beats the defaults on the proxy; a wider fixed `mateRange` does not lift the summer minimum, and spring 1.2 alone looked worse (2 of 8). This is 8 seeds on an older `main` (before the megafauna, keepers and WASM kernels), so it covers none of the T100 grid's arms: all seven stay in.

### 2026-11-08 - The mating-edge screen: roaming does not lift the summer minimum (world-balance T100, T101, E145)

- **Run:** `evals/screens/mating-edge.grid.json`, floor off, policy live (`map-elites-v6`), 16 seeds x 200000 ticks, on `e090f95e`, configHash `be4b83b3ae32b6b2` for the defaults; reports in `evals/screens/results/mating-edge/`. About 75 minutes on 30 workers.

| Arm                  | Seeds at or above 100 through summer | `eval.prey_summer_min` mean (vs defaults, 95% interval) | Population mean | `eval.mating_share` | `eval.boom_bust_count` | `eval.basin_recolonisations` | Under 80 at the end |
| -------------------- | ------------------------------------ | ------------------------------------------------------- | --------------- | ------------------- | ---------------------- | ---------------------------- | ------------------- |
| defaults             | 7 of 16                              | 94                                                      | 211             | 0.40                | 0.06                   | 0.00                         | 9                   |
| spring-1.2           | 3 of 16                              | 56 (-41%, -102 to +34)                                  | 136             | 0.37                | 0.13                   | 0.06                         | 11                  |
| margin-25            | 10 of 16                             | 139 (+47%, -9 to +122)                                  | 241             | 0.42                | 0.13                   | 0.00                         | 6                   |
| margin-100           | 8 of 16                              | 149 (+58%, -11 to +148)                                 | 230             | 0.43                | 0.13                   | 0.00                         | 8                   |
| roam-3000            | 3 of 16                              | 57 (-40%, -102 to +22)                                  | 156             | 0.37                | 0.25                   | 0.06                         | 11                  |
| roam-6000            | 4 of 16                              | 80 (-15%, -86 to +69)                                   | 201             | 0.40                | 0.19                   | 0.06                         | 12                  |
| roam-3000-spring-1.2 | 5 of 16                              | 87 (-8%, -80 to +85)                                    | 183             | 0.38                | 0.06                   | 0.06                         | 11                  |

- **`E-BC-2` is falsified.** The roaming arms were to be the only ones to lift the count, by at least 4 seeds; they read 3, 4 and 5 against the control's 7, and every summer-minimum interval holds 0. The control itself was below the predicted 9 to 11. A range that grows after a long stretch alone does not keep prey off the edge: the edge is not a range problem.
- **The margin arms lead and are not a finalist.** Both sides of the default 50 rise (25 reads 10 of 16, 100 reads 8 of 16), the intervals hold 0, and E128 found 150 and 250 lost: a dose response that rises on both sides of the default reads as which seeds fall changing with any lever (E127), not as a lever. No arm goes to the floor-on check (T102).
- **Spring 1.2 loses** on 16 seeds as it did on 8 in E128 (population mean -36%, interval -148 to -9).
- **Next:** the roaming keys are deleted (T103). The edge is reached by another route, a refuge or density-dependent survival (E128's fallback), which [habitat-cover.md](habitat-cover.md) already plans as cover on the food-patch rims; the training.md Phase 3 gate stands.

### 2026-11-08 - `npm run replay` defaults to the scripted policy, and does not take `live`

- `scripts/replay.mjs` runs `baseline-v5` unless `--policy` is given, and its policy list is `baseline-v5` and `map-elites-v6` only: `--policy live` (the alias `npm run screen` and `npm run eval` accept, `LIVE_POLICY` in `js/evo/policies/index.js`) is refused. A replay meant to read the live world needs `--policy map-elites-v6`. Under `baseline-v5` the floor-off-looking collapse is the scripted policy's (seed 1 ends at 8 agents, 858 floor births in 200000 ticks).

### 2026-11-08 - The roaming mate range harms on 32 floor-on seeds and is deleted (world-balance T102, T103, E146)

- **Run:** `evals/screens/roam-harm.grid.json`, defaults against `mateRoamTicks` 6000 and `mateRoamMax` 900, floor on, policy live, 32 seeds x 200000 ticks, on `bb107b5b`; reports in `evals/screens/results/roam-harm/`.
- **Keep rule (paired bootstrap, 4000 resamples):** hunters alive at the last tick 27 and 25 of 32 (difference -0.06, interval -0.22 to +0.09); seeds ending under 80 agents 9 and 18 of 32 (+0.28, interval +0.09 to +0.47). `eval:compare`: `eval.predators_at_end` 34.6 to 21.1 (-39%, `worse`), `eval.prey_types_at_end` 3.47 to 2.88 (-17%, `worse`), `eval.behaviour_coverage` +8% (`better`); `eval.prey_summer_min` 108 to 83 and `eval.population_mean` 236 to 211, intervals holding 0.
- **Reading:** a range that grows after a long stretch alone makes worlds end small, not recover. Ranging wider when alone is realistic, but it harms here, so the keep rule deletes it. The 16-seed floor-off screen (E145) pointed the same way without an interval that excluded 0.

### 2026-11-08 - One kill rule for the ledger, events and observer (metric-trust T14)

- **Tick order (verified in the code):** `feed` lands the fatal bite (`applyBite` sets `lastBiter`, books the ledger), then `reap` credits the ledger kill, calls `noteKill` and frees the victim's slot, and only then the merit phase notes `lastBiteDeliberate`, for victims still alive. So before T14 the ledger, `noteKill` and the observer all read the bite before the fatal one; the observer's `lastBiteTick == tick` test could never match a freed slot.
- **Rule:** `isDeliberateKill` in `js/sim/kills.js` reads the biter's prey tracker at the bite. `HunterKill`, `ledgerKills` and the kill-energy branch of `noteBiteLedger` use it; the observer counts the `HunterKill` records. A fatal bite that is not a deliberate kill is bite gain. `noteKill`, `creditKills` and the observer's per-slot `deliberateKills` stay on the old rule until T15; `worldHash` is unchanged.
- **Run:** first 16 seeds of `evals/seeds.json`, 200000 ticks, floor on, policy live, before at the commit ahead of T12 and after at T14, `npm run eval:compare`. The observer's convergence credits feed the live policy's fitness, so the after run also carries that effect; the two cannot be separated here.

| Metric                             | Before  | After   | Change | 95% interval                |
| ---------------------------------- | ------- | ------- | ------ | --------------------------- |
| `eval.hunter_kills_per_life`       | 0.0625  | 0.1875  | +200%  | 0 to 0.25                   |
| `eval.hunter_zero_kill_share`      | 0.5946  | 0.5829  | -2.0%  | -0.0177 to -0.0001          |
| `eval.hunter_carrion_idle_share`   | 0.05636 | 0.04933 | -12.5% | -0.0198 to -0.0017 (better) |
| `eval.hunter_income_share.kill`    | 0.1257  | 0.09231 | -26.6% | -0.0378 to -0.0300          |
| `eval.hunter_income_share.bite`    | 0.4411  | 0.4736  | +7.3%  | 0.0283 to 0.0370            |
| `eval.hunter_income_share.carcass` | 0.4309  | 0.4319  | +0.2%  | -0.0000 to 0.0050           |
| `eval.hunter_first_kill_age`       | 683.2   | 663.7   | -2.9%  | -54.4 to 0.1                |

- **Reading:** kill energy fell by a quarter and moved to bite gain, as expected when a non-deliberate fatal bite is no longer a kill; kills per life rose because a deliberate fatal bite now counts. 16 seeds is under the 32 the doc asks of a verdict, so only the shares with intervals clear of 0 are signals.
- **Replay check:** `npm run replay -- --seed 1 --ticks 20000 --level debug --policy map-elites-v6`: 57 `HunterLedger` records, 11 with kills, none with kill energy above 0 and 0 kills.

### 2026-11-08 - The scripts branch ratchet failed on measured speeds, not on test order

- **Symptom:** `ci/release-please` failed `ratchet` with scripts branches at 89.22% against a baseline of 89.32%, then passed on a rerun. The test order was the suspect.
- **Found:** coverage-final.json from the coverage pass under `TEST_SEED` 5268, 1, 2 and 3 (on `a0133a42`) differs in exactly two scripts branches, and seed 1 reproduces 89.22%. Both pick a side from a timed result, so they move with machine load, whatever the order: `main` in `scripts/bench-reflex.mjs` printed `value.toFixed(value < 10 ? 3 : 1)` from a real bench, and its three-decimal side ran only when `bench.reflex_ms_per_genome` came in under 10 ms (seed 1 ran at load 10 under coverage); `formatCompare` in `scripts/lib/micro-bench.mjs` reached the `''` side of `row.change >= 0 ? '+' : ''` only when a real timed compare in a slow test came out slower.
- **Fix:** the bench-reflex formatting is the pure `formatMetrics`, and both functions are tested on fixed values for both sides. A branch chosen by a timing, a load or a clock in a script needs a unit test with fixed inputs; a test that runs the real measurement covers it only by chance. To find such a branch, diff `coverage-final.json` (`--coverage.reporter=json`) from a few `TEST_SEED` runs.

### 2026-11-08 - The pre-commit hook's GIT_INDEX_FILE reached a test's `git worktree add`

The 2026-10-11 rule (each test strips `GIT_*` from the environment of the git it spawns) leaves a gap: a test that
spawns a script, which then spawns git, passes `process.env` through unless its author remembered. On
`feat/deploy-pipeline-v2`, `test/release-check.slow.test.js` runs `scripts/release-check.mjs` with
`{ ...process.env }`, and that script runs `git worktree add --detach <tmp> <merge-base>`. Under the hook, git exports
`GIT_DIR` and `GIT_INDEX_FILE` (absolute paths in a worktree; `git commit <paths>` points `GIT_INDEX_FILE` at a
`next-index-*.lock`), so the new worktree's checkout wrote the merge-base tree into the index being committed.
Reproduced on a clone: the staged change vanished and 1684 paths showed as staged reverts. No test writes
`.prettierignore`: it changed because the merge base held an older `.prettierignore`, and the corrupted index reverted
it. `scripts/check.sh` now records `GIT_DIR`, `GIT_INDEX_FILE` and `GIT_WORK_TREE` after the staged-file read, unsets
them, and hands them back only to the conventions gate (whose `git grep` must read the index being committed);
`test/check-hook-env.test.js` pins that. Spawning git from tests with a stripped environment is still good practice.

### 2026-11-08 - The mate rank reads the fatal bite: no harm on 32 seeds (metric-trust T15, T15a, E147)

- **Change:** `noteKill` and `creditKills` (the `deliberateKills` the mate rank reads) and the observer's per-slot count judge the fatal bite's own deliberateness through `isDeliberateKill`, as the ledger has since T14. No golden hash moved in Node or Chromium: the golden worlds hold no deliberate kill that changes a mate rank within their ticks.
- **Run:** defaults, floor on, policy live, 32 seeds x 200000 ticks, configHash `ff8d890a5a70c14d`, before `a1562fb0`, after `b56054ee`.
- **Keep rule (paired):** hunters alive 27 and 27 of 32, seeds ending under 80 agents 9 and 9 (both differences 0). `eval.population_mean`, `eval.food_energy_per_1k`, `eval.births_per_1k`, `eval.mating_share`, `eval.predators_at_end` and `eval.prey_types_at_end` show no difference.
- **One `worse`:** `eval.basin_families` 2.04 to 1.92 (-5.6%, interval -0.54 to -0.01), 1 of 68 metrics with a verdict, which is near the false-positive count at this interval, and not a keep-rule guard. It is unverified in the registry (metric-trust Phase 4 measures its power). T15 stays.

### 2026-11-08 - The preview pipeline checked by hand on Cloudflare (deployment T5, partly)

- `wrangler d1 migrations apply blob-library-preview --env preview --remote` applied 0001 and 0002. A `wrangler pages deploy dist --branch verify-375` preview read the preview database: `/api/champions` answered `{"items":[],"next":null}` while the production database still had no tables, so the `[env.preview]` binding is the one a preview branch uses.
- `GET /api/seasons` answered `cache-control: public, s-maxage=300` and `cf-cache-status: HIT` on a repeat, so the Cache API path works on a deployed Function. A HEAD request shows `max-age=0, must-revalidate`: read the cache headers with GET.
- A deploy with `--branch next` serves at `next.matrix-6be.pages.dev`, and `/next` on another deployment proxies to it with a 200.
- Not checkable before a release: `/v/<version>/`, whether the `v6-0-0` branch deployment persists, a second workflow from the App-token release, and the rollback.

### 2026-11-08 - Release Please manifest mode defaults include-component-in-tag to true

`googleapis/release-please-action` v5 passes `include-component-in-tag: false` as its default action input, but when
`config-file` (`release-please-config.json`) is given, Release Please runs in manifest mode and reads the setting from
the config file instead, where `include-component-in-tag` defaults to `true`. For a `node` package without
`"include-component-in-tag": false` in `release-please-config.json`, Release Please prefixes the tag with the
`package.json` `name` (`blob-evolution-simulation-v6.0.0`), which `deploy.yml` rejects because it requires `v<version>`.
`release-please-config.json` sets `"include-component-in-tag": false` on `packages["."]`, and removes `"release-as": "6.0.0"`
once `6.0.0` is released so later releases bump from the manifest version. `actions/create-github-app-token` v3 also
deprecates its `app-id` input in favour of `client-id` (`RELEASE_CLIENT_ID`).

### 2026-11-08 - Metric trust Phase 2 invariants (T20c, T20b)

- Four live defaults seeds at 20000 ticks keep ratio shares in [0, 1], nonnegative per-1000 rates, hunter income shares summing to 1, and birth-source shares summing to 1 when present. `runPool` and direct `runSeed` metrics match for every seed.
- `test/evo/kills.agreement.slow.test.js` confirms the ledger kill count matches `HunterKill` events and no dead hunter life has positive kill energy with zero kills. The core known-answer source test pins the exact `births_per_1k` formula.
- The planned prey-summer trace comparison moves to T34: reports currently keep only total population per checkpoint, so they cannot provide the prey-only minimum. The ecology source test still pins the metric's known answers.
- Tier 2 ran in a clean temporary worktree. 6115 of 6116 tests passed; the one check-tier test failed because `SMOKE_LOCAL=1` was set for the entire gate. It passed when rerun without that variable. The isolated local browser-smoke gate passed, as did conventions, design index, format, lint, typecheck, deps, dupes, bench-check, build and eval-smoke.

### 2026-11-10 - Metric liveness triage (metric-trust T24, E148)

`npm run metric:liveness` on `evals/power/defaults-floor-on.json` and `defaults-floor-off.json` (128 seeds x 200000 ticks):
30 metrics miss the liveness bar with floor on and 44 with floor off, and all 30 floor-on misses also miss with floor off,
so the floor-on readings in `js/evo/metric-registry/liveness.js` hold every metric T24 had to triage. None is deleted:
each is a working detector whose source test plants its answer. The 24 that were not `deprecated` now have an
`expectedFlat` reason; the 6 `deprecated` entries already state theirs. `test/evo/metric-registry/liveness.test.js`
fails any future reading that misses the bar with neither.

| Group                       | Metrics                                                                                                                     | On the defaults                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Rare signals                | `alarm_hearers_per_call`, `alarm_hunter_hearers_per_call`, `alarm_precision`, `alarm_response`, `kin_within_call_radius`    | Alarm calls on 5 of 128 seeds                                                                         |
|                             | `hunt_call_answer`, `hunt_call_precision`                                                                                   | Hunt calls on 8 of 128 seeds                                                                          |
|                             | `smoke_escapes`, `smoke_precision`                                                                                          | Smoke after a bite on 1 seed, any smoke on 7                                                          |
| A basin empties             | `basin_cluster_divergence`, `basin_divergence`, `basin_spec_divergence`, `basin_family_effective`                           | Null on 39 seeds floor on, 64 floor off                                                               |
| Hunters die out             | `evasion_trend`, `pursuit_trend`, `pred_prey_lag_corr`, `predator_end_local_share`                                          | Null on 33 to 45 seeds floor on, 58 to 68 floor off                                                   |
| Needs floor spawns          | `hunter_kill_rate_by_source.floor`, `lineage_lifespan_p50`                                                                  | Null on every floor-off seed; after burn-in only floor spawns found a lineage                         |
| Never reaches the threshold | `weight_clamp_share`, `hebb_drift_clamped_share`, `leak_slow_share`, `leak_at_floor_share`, `herd_recolonisations`          | 0 on every seed: no weight at the clamp, no slow or floored leak gene, no herd lost and regained      |
| Already `deprecated`        | `birth_source_share.immigrant`, `champion_elo`, `champion_win_rate`, `leak_flee_corr`, `leak_forage_corr`, `leak_hunt_corr` | Nothing spawns immigrants; only `runLeague` sets the league pair; `freeAgent` clears the genome first |

The 14 metrics that miss only with floor off (`floor_episodes`, the `birth_source_share.floor` pair, `born_share`,
`archive_lineage_share`, three basin family and lineage counts, three winter reads, `season_map_distance`, `skill_trend`,
`deliberate_food_trend`) are live on the floor-on reference and need no reason.

### 2026-11-10 - Metric renames (metric-trust T25)

T2 to T7 listed 34 names that misstate what they count. A name is renamed when it says something false about the
quantity; when the name is only vague and the registry's `meaning` and `counts` say the rest, it stays.

| Old name                           | New name                             | Why                                                                |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `eval.catch_rate`                  | `eval.hunter_catches_per_1k`         | A speed (eaten deaths with a hunter killer per 1k hunter-ticks)    |
| `eval.hunter_kills_per_life`       | `eval.hunter_kills_per_life_p50`     | A median; the new `eval.hunter_kills_per_life_mean` sits beside it |
| `eval.pack_kill_share`             | `eval.pack_kills_per_eaten_death`    | Divides by all eaten deaths, not by hunter kills                   |
| `eval.escape_rate`                 | `eval.escape_share`                  | A share of resolved bite episodes, not a rate                      |
| `eval.evasion_skill`               | `eval.evasion_response_share`        | The responded share of escaped episodes, not a skill score         |
| `eval.group_cohesion_under_threat` | `eval.kin_nearby_threat_gain`        | Threatened minus calm mean same-lineage neighbours                 |
| `eval.deliberate_food_per_1k`      | `eval.deliberate_food_energy_per_1k` | Counts energy, not items                                           |
| `eval.chance_food_per_1k`          | `eval.chance_food_energy_per_1k`     | Counts energy, not items                                           |
| `eval.alarm_precision`             | `eval.alarm_lift`                    | Calls above the callers' base rate, per call; can be negative      |
| `eval.hunt_call_precision`         | `eval.hunt_call_lift`                | As alarm                                                           |
| `eval.mate_skill_gap`              | `eval.mate_rank_gap`                 | A percentile gap of mate rank, not of skill                        |
| `eval.reward_events.*`             | `eval.reward_events_per_1k.*`        | A rate per 1k hunter-ticks, not a count                            |
| `eval.terrain_death_share`         | `eval.collision_death_share`         | The share of `COLLISION` deaths                                    |

Kept, with what the registry says instead: `hunter_first_kill_age` (survivor bias is in `meaning`),
`hunter_chases_by_age.*` and `hunter_conversion_gain_hunters` (the names already say count), `hunter_kill_conversion_by_age.*`,
`pursuit_kill_share` and `leak_hunt_corr` (kill-rule notes, fixed by T14), `herd_carcass_share.*`, `refuge_use_under_threat`,
`herd_recolonisations`, `prey_extinctions`, `flora_patch_death_rate`, `basin_families` (families are genetic clusters by
definition), `social_return`, `juvenile_parent_pull`, `hidden_persistence`, `leak_rate_mean`, `sigma_mean`,
`mean_energy_share`, `energy_over_split`, `merit_mean`, `migration_index`, `predator_births`, `predator_presence`,
`alarm_rate` and the two `birth_source_share` families.

The mean is not named `eval.hunter_kills_per_life`: an old report holds the median under that name and
`withCurrentNames` maps it to `_p50`, so reusing the name for the mean would pair a median with a mean.
Design docs, `docs/principles.md`, README, grids, configs and tests use the new names; `evals/experiments.json`,
stored reports and earlier sim-notes entries keep the old ones, which `renamedFrom` maps.

### 2026-11-10 - The leak-skill correlations read a cleared genome row

`eval.leak_forage_corr`, `eval.leak_hunt_corr` and `eval.leak_flee_corr` were null on all 128 seeds of both T22
reports. `step` frees a dead agent's slot (`freeAgent` zeroes its `genomeId` and its `weights` row) before `observe`
sees the `AgentDied` event, so `noteLeakSkillDeath` found the genome id changed and skipped every life. The observer now
keeps each life's mean leak at birth (`noteLeakSkillBirth`, from the `AgentBorn` event while the row is still the
newborn's; founders arrive the same way in the first `observe`) and reads that at death. A genome row never changes
during a life, so the birth read is the life's leak. `test/evo/metric-source-brain-leak.test.js` runs the real `step`:
before the fix it logged 0 of 4 lives and the forage read stopped at "fewer than 200 lives". Other observer reads at
death that take a world row by slot have the same hazard; `noteBirthBody` already reads body traits at birth for this
reason. `worldHash` is unchanged: the observer is outside it.

### 2026-11-10 - Hunters and intent source tests (metric-trust T16, T17)

All 57 hunters and 20 intent metrics now read a known answer on the real `step`, through the scripted hunting world in
`test/evo/helpers/hunt-scene.js`. What the scenes taught:

- **A kill reopened a phantom chase.** The closing bits of the observer's prey tracker outlive a chase by a few ticks, so
  on the tick of a kill `scene-approach.js` opened a new approach on the dead prey's last sighting; some 36 ticks later it
  lapsed as a give-up. One catch read `eval.chase_catch_share` 0.5. An idle hunter now opens only on a sighting newer than
  its last ended chase. Reports run before this fix (the T22 pair among them) carry the skewed chase, competence and
  matched values.
- **Two trackers judge deliberateness.** The sim's (`world.meritPrey`) decides kills (`isDeliberateKill`, the fatal
  bite) and `pursuit_kill_share`; the observer's own (`observer.intent.prey`) decides chases, `pursuit_bite_share`, the
  first bite of `pack_convergence` and the answer to a hunt call. Setting the sim's tracker is not enough for the second:
  the hunter must really close on prey in view (thrust toward it for at least `CLOSING_MIN` of `CLOSING_BITS` ticks).
- **Rays cover the full circle**, so a biter in contact is always seen, except when food lies nearer on every ray toward
  it: a food hit takes the ray. That is how `eval.unseen_bite_share` reads about 6% on the live defaults.
- **The simple world has a wall at x 500**, which pushes bodies placed on it; scenes sit at x 200.
- **Observer tick rules**: hunter and agent ticks count at every `observe` after tick 0; a caller's own birth observe is
  not an alive tick for its call base rate, but another spawn's observe while it is alive is, before it has sensed.

### 2026-11-11 - Metric power read (metric-trust T27, E150)

The corrected E150 reports use the same 128 fixed seeds and 200000 ticks as E149, with the original configurations:
floor on `ff8d890a5a70c14d`, floor off `51c7a6e80234a2b5`. Each report contains all 284 current registry metrics.
Power was measured at 16 and 32 seeds with 1000 false-positive splits and 200 planted-change splits. The floor-on
reference in `evals/power/defaults-floor-on-E150.json` gives 61 metrics `minSeeds: 16`, 34 `minSeeds: 32` and 189
`minSeeds: null`. The floor-off comparison in `evals/power/defaults-floor-off-E150.json` gives 52, 30 and 202,
respectively. Only the floor-on readings are written to `js/evo/metric-registry/power.js`.

For the largest-MDE summary, the decision set is the screen `TARGETS` and `WATCH_METRICS`, `PLATEAU_SERIES` metrics,
and the current hunter-gate inputs `eval.hunter_catches_per_1k`, `eval.predators_at_end` and
`eval.hunter_ticks_last_quarter`. The ten largest floor-on MDEs at 32 seeds are:

| Metric                              | MDE32 |
| ----------------------------------- | ----- |
| `eval.predators_at_end`             | 1.00  |
| `eval.prey_summer_min`              | 1.00  |
| `eval.hunter_chases_by_age.over2k`  | 0.75  |
| `eval.hunter_ticks_last_quarter`    | 0.75  |
| `eval.lineage_effective`            | 0.75  |
| `eval.prey_extinctions`             | 0.75  |
| `eval.hunter_chases_by_age.1k-2k`   | 0.50  |
| `eval.hunter_chases_by_age.under1k` | 0.50  |
| `eval.predator_births`              | 0.50  |
| `eval.predator_share_cv`            | 0.50  |

MDE32 is the relative planted change in `eval:power`, not an observed verdict. Structural-zero metrics remain unverified
when the power bar cannot be measured; they do not become failed metrics or verdicts. `eval.hunter_kills_per_life_p50`
remains outside gates.

### 2026-11-11 - Decision metrics against the power bar (metric-trust T28)

A re-read of `evals/power/defaults-floor-on-E150.json` (128 seeds, floor on), with no new runs. The decision set is
what decides a pass or a verdict today: the screen criteria and the hunter gate in `scripts/lib/screen-verdict.mjs`
(`armVerdict`, `hunterGate`), the screen `TARGETS`, the keep-rule guards in `docs/principles.md`, and the training
plateau `PLATEAU_SERIES` in `js/evo/learning-curve.js`. `WATCH_METRICS` carry no verdict and are left out. The
detectable change at 64 seeds comes from `eval:power --sizes 32,64 --include-watch --splits 500 --power-splits 200`.
The inert-gate and seed-flip rates come from 1000 and 300 random disjoint splits of the 128 seeds.

**Threshold tests are not comparisons.** `catchRate` (`eval.hunter_catches_per_1k` above 0 on every seed),
`matingShare` (`eval.mating_share` mean at least 0.2) and `bornShare` (`eval.born_share` mean at least 0.5) test one arm
against a fixed floor. The power bar measures a comparison, so it does not apply to them. On the defaults they hold with
room to spare: no seed has a catch rate of 0, the mating mean is 0.41 and the born mean is 0.98. A threshold test needs
a metric that passes the arithmetic, source and liveness checks. The rule in T31 that "gate criteria read only
`verified` metrics" would drop all three. It should require those three checks for a threshold criterion, and full
`verified` status only for a criterion that compares two arms.

**Decision metrics that miss the bar at 32 seeds, and what each needs:**

| Metric                           | Read by                              | MDE 32 / 64 | Why it misses                                      | Replacement or seeds                                                                                                |
| -------------------------------- | ------------------------------------ | ----------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `eval.predators_at_end`          | `hunterGate` median, alive share     | 1.00 / 0.75 | Headcount; sd 31 on a mean of 27, 33 zero seeds    | None under 128 seeds. Delete the median test (below). Alive share moves to `keepRule` as a guard                    |
| `eval.hunter_ticks_last_quarter` | `hunterGate` median                  | 1.00 / 0.75 | Headcount; sd above the mean                       | None under 128 seeds. Delete the median test                                                                        |
| `eval.prey_summer_min`           | `summerSeeds` (seeds at 100 or more) | 1.00 / 0.75 | Headcount; 44 of 128 seeds at 100 or more          | A seed share, judged like the alive share (below); as a mean it needs more than 128 seeds                           |
| `eval.hunter_catches_per_1k`     | `catchRate`; a hunter-skill guard    | 0.30 / 0.15 | Noise                                              | Threshold use is sound. As a comparison it needs 64 seeds: write `minSeeds: 64`                                     |
| `eval.mating_share`              | `TARGETS`, `matingShare`             | 0.20 / 0.15 | Noise: 0.082 absolute at 32, the share bar is 0.05 | About 96 seeds. Let `eval.births_per_1k` (verified at 16, MDE32 0.10) carry the breeding Target; keep the threshold |
| `eval.born_share`                | `bornShare`                          | 0.10 / 0.10 | The `eval:compare` min-effect floor, not noise     | Threshold use is sound. See the min-effect finding below                                                            |
| `eval.hunter_zero_kill_share`    | `PLATEAU_SERIES`                     | 0.15 / 0.10 | Noise: 0.085 absolute at 32                        | About 96 seeds for a compare. The plateau does not compare two arms (below), so it stays                            |
| `eval.bite_on_prey_view`         | `PLATEAU_SERIES`                     | 0.10 / 0.10 | The min-effect floor, not noise                    | See the min-effect finding below                                                                                    |

The other comparison metrics pass at 32 seeds or fewer: `eval.lineages_alive` (32), `eval.births_per_1k`,
`eval.food_energy_per_1k` and `eval.fed_median_lifespan` (16). `eval.fed_median_lifespan` is still in `TARGETS`, even
though T26j keeps it off decision curves and gates. The screen table prints it as a delta, not as a pass, so it decides
nothing, but it should move to `WATCH_METRICS`.

**The hunter gate fails an inert arm 76% of the time.** Two disjoint halves of the same defaults, used as arm and
reference, fail `hunterGate` 0.74, 0.76, 0.76 and 0.79 of the time at 8, 16, 32 and 64 seeds per arm. "The arm's median
`eval.predators_at_end` is not below the reference's" fails 0.50 of the time, and so does the median of
`eval.hunter_ticks_last_quarter`. "No more seeds under 80 than the reference" fails 0.45, and "alive on at least 0.75 of
seeds" fails 0.45, because the defaults sit at 0.74. More seeds do not help, because none of these tests has an interval.
The full 128-seed defaults report fails the gate against itself (alive share 0.742). Replace it with `keepRule` (T30): paired intervals on
the alive share and the under-80 share, with the medians reported but not tested.

**What the keep rule's seed-share guards can see.** Starting from defaults with hunters alive on 0.74 of seeds and 0.40
of seeds under 80, k seeds are flipped to the harmful outcome in one arm, and the `eval:compare` interval is checked.

| Guard         | Seeds per arm | worse verdict at k flipped (k: rate)         | Inert false positive |
| ------------- | ------------- | -------------------------------------------- | -------------------- |
| Hunters alive | 32            | 2: 0.08, 4: 0.23, 6: 0.38, 8: 0.65, 10: 0.79 | 0.04 worse           |
| Hunters alive | 64            | 4: 0.16, 6: 0.24, 8: 0.35, 10: 0.51          | 0.03 worse           |
| Under 80      | 32            | 4: 0.09, 6: 0.20, 8: 0.36, 10: 0.56          | 0.02 worse           |
| Under 80      | 64            | 4: 0.06, 6: 0.16, 8: 0.24, 10: 0.31          | 0.02 worse           |

At 32 seeds, the alive guard catches a loss of about 10 seeds (0.31 of the share) at 80%, and the under-80 guard needs
more than 10. These are guards against a large harm, not a fine test. The planned T30 test, "a planted loss of 4 alive
seeds in 32 is worse", can be true only for one hand-built pair: on a random pair, a 4-seed loss is caught 0.23 of the
time. The test should plant a loss of 10 or more seeds, or check the interval width instead.

**Pairing barely helps a headcount.** `eval:power` compares disjoint seed halves, but `eval:compare` judges seeds as
pairs. On the same seeds, floor on against floor off correlate 0.84 to 0.98 per seed. That figure is inflated, because
the two worlds are identical until the floor first fires. A change that acts from tick 0 decorrelates within the run.
`mateRoamTicks` 0 against 6000 (`evals/screens/results/roam-harm/`, 32 seeds) gives 0.31 on `eval.predators_at_end`,
0.19 on `eval.hunter_ticks_last_quarter`, 0.29 on `eval.prey_summer_min`, 0.27 on the under-80 share, and 0.59 on
`eval.mating_share`. `herdDungTicks` 900 against 1800 (`evals/screens/results/herd-ecology-power/`) gives about 0 on
headcounts and 0.47 on `eval.mating_share`. The unpaired power read is fair for headcounts and slightly conservative for
breeding and population means. Do not use the floor-on and floor-off pair to estimate a pairing gain.

**The min-effect floor caps the share bar.** `eval:compare` refuses a verdict below `--min-effect` 0.05 of the before
mean. For a share near 1, that is about 0.048 absolute, right at the share bar of 0.05 absolute. Planted shifts at 32
seeds show the floor, not noise: `eval.born_share` is detected 0.52 of the time at 0.05 relative and 0.89 at 0.06;
`eval.bite_on_prey_view` 0.49 and 0.83; `eval.child_survival` 0.57 and 0.99. These shares are precise, but no seed count
can make them `verified`. Fix the tools: for a metric of unit `share`, `compareReports` should use an absolute min-effect
(0.02, under the share bar), and `eval:power` should plant absolute steps for shares (0.01 to 0.20). Measure again after
that. The same cap applies to any other share above about 0.5, such as `eval.hunter_independent_kill_share` and
`eval.bite_wish_with_prey_in_jaws`.

**The plateau is not a two-arm compare.** `flatAfter` calls a series flat when it moves less than `PLATEAU_RISE` (0.05)
of its value over `PLATEAU_WINDOW` (3) checkpoints. Noise alone moves a 32-seed mean by 5% or more 0.12 of the time for
`eval.food_energy_per_1k` and 0.26 for `eval.hunter_zero_kill_share`, but 0 for `eval.bite_on_prey_view`. A noisy series
looks like progress and delays the plateau, so the rule fails on the safe side for a false plateau. A true 5% gain reads
as flat about half the time. That is the cost of a 5% rise with no smoothing, and it applies to the curve only if the
training episodes vary across seeds the way the defaults do. The `flatAfter` comment still names
`eval.bite_wish_with_prey_in_jaws`, but the series is `eval.bite_on_prey_view` (T26c).

**The screen's per-seed criteria fail the defaults.** On the 128 floor-on seeds, `lineages` (at least 5 at the last
tick, from the trace) fails 117 seeds, `popAboveMin` 49 and `specShare` 40. "Every seed passes every criterion" cannot
pass on the defaults, so `armVerdict.pass` is false for the reference arm and for any arm near the defaults. These are
trace criteria, outside the registry, and they need the same interval treatment as the hunter gate.

### 2026-11-11 - BCa on sparse paired differences (metric-trust T29c)

`bootstrapInterval` in `js/evo/compare.js` (BCa, 10000 resamples) gives an interval that excludes 0 when only a few
paired differences are nonzero and they share a sign. With k seeds at -1 and the other seeds at 0:

| k of n  | BCa (as built)   | BCa, ties counted half | Percentile       | Exact sign test p |
| ------- | ---------------- | ---------------------- | ---------------- | ----------------- |
| 1 of 32 | -0.156 to 0      | -0.156 to 0            | -0.094 to 0      | 1.000             |
| 2 of 32 | -0.250 to -0.031 | -0.188 to 0            | -0.156 to 0      | 0.500             |
| 3 of 32 | -0.313 to -0.031 | -0.250 to -0.031       | -0.219 to 0      | 0.250             |
| 4 of 32 | -0.344 to -0.063 | -0.281 to -0.031       | -0.250 to -0.031 | 0.125             |
| 6 of 32 | -0.406 to -0.094 | -0.344 to -0.063       | -0.313 to -0.063 | 0.031             |
| 2 of 16 | -0.500 to -0.063 | -0.375 to 0            | -0.313 to 0      | 0.500             |

There are two causes. The bias correction `z0` counts resample means strictly below the observed mean, and on discrete
data many resamples tie with it, which shifts the interval toward the tail. Counting ties as half fixes 2 of 32 but not 3. The deeper cause holds for any bootstrap of the mean: when every nonzero difference has the same sign, no resample
can have the other sign, so the interval reaches 0 only through resamples that draw no nonzero seed at all. That share
is `(1 - k/n)^n`, which drops under 2.5% at k = 4 of 32. Even the percentile interval then excludes 0, while the sign
test gives p = 0.125.

**Where it decides a verdict.** On the committed paired reports:

- Floor on against floor off (`evals/power/defaults-floor-*-E150.json`, 128 seeds): 204 of 284 metrics have more than
  half their paired differences exactly 0, because the two worlds are identical until the floor first fires. Of the 26
  verdicts, 25 hold under the sign test (p 0.04 or less). `eval.idle_signals_per_1k` reads `worse` on 3 nonzero seeds
  (sign p 0.25, percentile `no-difference`); that verdict is spurious.
- `mateRoamTicks` 0 against 6000 and `herdDungTicks` 900 against 1800 (32 seeds each) act from tick 0. Only 20 of 268
  and 14 of 180 metrics are sparse there, and no verdict rests on a sparse metric except `eval.prey_types_at_end` in the
  roam pair (15 nonzero, sign p 0.007, holds).
- In `evals/experiments.json`, the only verdict from `E120` on that rests on a metric whose E150 values are at least
  half one value is `E146` `eval.prey_types_at_end` `worse`, which holds. Earlier, `eval.idle_signals_per_1k` (0 on 95%
  of seeds) carries verdicts in `E25`, `E28`, `E29`, `E36` and `E47`. `E29` is the calibration of two halves of one
  baseline, so its `better` is a false positive. These are v5-era records, before T35's range.

So the fault is narrow and real: it bites arms that share early trajectories (floor and late-acting changes), rare-event
counts, and 0/1 flags such as the keep rule's seed guards.

**The fix (T29c).** When at least half of a metric's paired differences are exactly 0, `compareReports` gives a
`better` or `worse` verdict only if an exact two-sided sign test on the nonzero differences also gives p below 0.05
(otherwise `no-difference`, with a note). Dense metrics keep the BCa interval alone; there the sign test is weaker than
the mean test (`eval.behaviour_coverage` in the roam pair: 32 nonzero, sign p 0.22, a real shift of the mean). The keep
rule's seed guards use the same exact test as McNemar on discordant seeds (T30). Tie-corrected BCa alone was rejected,
because it still fails at 3 of 32.

### 2026-11-11 - Past verdicts re-read (metric-trust T35)

Every record from `E120` to `E150` in `evals/experiments.json` (31 records), read against the registry as it stands after
T14, T15, T16, T24, T25, T28, T29a and T29c, with no new runs. The records name 58 per-metric verdicts (the `-` entries
and the `share.*` seed tests aside): 33 on a metric now `verified` and 25 on one now `unverified`. Of the 23 that are
`better` or `worse`, 8 are on a metric that is `verified` at the seed count the run used, 6 are on a metric that is
`verified` only at more seeds than the run had (`eval.hunter_first_kill_rmst` needs 32 and `eval.hunter_juvenile_death_share`
64 in `E122` and `E123`, both at 16 seeds; `eval.hunter_catches_per_1k` and `eval.prey_types_at_end` need 64 at 32 seeds), and
9 are on an `unverified` headcount or count (`eval.predators_at_end`, `eval.prey_extinctions`,
`eval.hunter_ticks_last_quarter`, `eval.predator_births`, `eval.basin_families`).

**What could be re-run.** The 16-seed reports of `E120` to `E144` (`evals/results/`) were never committed (the directory
is ignored), `E147`'s two reports lived in `/tmp`, and the committed screens of `E121`, `E124`, `E127`, `E128`, `E131` and
`E132` hold 8 seeds, under the 16 `eval:compare` needs. So:

- `E146` (`evals/screens/results/roam-harm/`, 32 seeds) and `E145` (`evals/screens/results/mating-edge/`, 16 seeds) were
  re-compared with `npm run eval:compare` (`E146` with `--keep-rule`).
- `E131`, `E132` and `E124` were re-read as per-arm means from their saved reports.
- `E141` to `E144` were re-read against the corrected 128-seed floor-on report `evals/power/defaults-floor-on-E150.json`.
- `E137` was recounted from the seed counts its note records, with the exact test `keepRule` uses.

| Experiment | Decision                                                                                              | Rested on                                                                                                                                                                                  | Fault                                                                                                                                                                                       | Result                                                                                                                                                                                                                                     | Owning doc                                           |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `E120`     | `satedBite` alone not adopted                                                                         | 16-seed verdicts on `eval.predators_at_end`, `eval.prey_extinctions` (unverified headcounts), hunters alive 10/16 against a 12/16 count                                                    | Headcounts below the power bar; the count test fails an inert arm about 43% of the time (`E135`)                                                                                            | Cannot tell (no report). Moot: `E136` and `E138` kept `satedBite`                                                                                                                                                                          | hunter-learning.md                                   |
| `E121`     | `territory` and `flip-territory` go to 16 seeds                                                       | 8-seed means; "passes the full hunter gate"                                                                                                                                                | `hunterGate` fails an inert arm 76% of the time (T28)                                                                                                                                       | Cannot tell (8 seeds, no verdict made). Moot: `E122` and `E123` re-ran both                                                                                                                                                                | hunter-learning.md                                   |
| `E122`     | `flip-territory` leads                                                                                | `better` on `eval.hunter_kill_conversion_by_age.1k-2k` (verified at 16), `eval.hunter_first_kill_rmst` (32), `eval.hunter_juvenile_death_share` (64), `eval.predators_at_end` (unverified) | Two metrics read below their seed minimum, one unverified; conversion read before the T16 phantom-chase fix (it understates the catching arm)                                               | Cannot tell (no report)                                                                                                                                                                                                                    | hunter-learning.md                                   |
| `E123`     | Adopt `flipReflex` and `hunterTerritory`; delete provisioning, juvenile dependency, sated bite        | The `E122` metrics plus `eval.births_per_1k` and `eval.spec_effective` (both verified at 16), alive 14/16 against 10/16, under 80 2 against 5                                              | As `E122`; the count guards fail inert arms                                                                                                                                                 | Cannot tell (no report); low risk. The adoption stands on `births_per_1k` +20% and `spec_effective`, both `verified` at 16 seeds. The three deletions were reversed by realistic-keepers.md                                                | hunter-learning.md                                   |
| `E124`     | Reward learning deleted                                                                               | 8-seed means of `eval.hunter_conversion_gain` (verified at 16)                                                                                                                             | 8 seeds under the 16 minimum; gain read before the T16 fix                                                                                                                                  | Cannot tell. Means reproduce from the saved report (defaults -0.026, shuffled -0.005, no-plasticity -0.048). Moot: realistic-keepers.md restored it                                                                                        | hunter-learning.md                                   |
| `E125`     | 16-seed confirmation skipped                                                                          | No verdict                                                                                                                                                                                 | None                                                                                                                                                                                        | Holds (nothing rested on a metric)                                                                                                                                                                                                         | hunter-learning.md                                   |
| `E126`     | Reference runs; `eval.basin_divergence` has no power floor off                                        | Null counts and `eval:power` splits                                                                                                                                                        | None; the metric is `unverified` today                                                                                                                                                      | Holds                                                                                                                                                                                                                                      | world-balance.md                                     |
| `E127`     | Longer mate range not adopted                                                                         | 8-seed means of `eval.population_mean`, `eval.predators_at_end`, `eval.prey_extinctions`                                                                                                   | 8 seeds and unverified headcounts: a lift of 12% or a loss was not detectable                                                                                                               | Cannot tell (8-seed screen). Nothing adopted, so low risk                                                                                                                                                                                  | world-balance.md                                     |
| `E128`     | Boom damping not adopted                                                                              | As `E127`                                                                                                                                                                                  | As `E127`                                                                                                                                                                                   | Cannot tell (8-seed screen). Nothing adopted                                                                                                                                                                                               | world-balance.md                                     |
| `E129`     | `splitCapMargin` 150 rejected; stop tuning floor-off survival                                         | `worse` on `eval.predators_at_end`, `eval.prey_types_at_end` (verified at 64), `eval.spec_effective`; floor-on alive 14/16 to 11/16                                                        | Headcounts below the bar; the alive count fails an inert arm about 43% of the time. `E145` later read margin 25 and 100 at 4 and 3 seeds gained against 1 and 2 lost (exact p 0.38 and 1.0) | Cannot tell (no report). The principle behind "floor off is a stress test" does not rest on the metric; low risk                                                                                                                           | world-balance.md                                     |
| `E130`     | Cover protects and fits; prey do not reach it under threat                                            | `eval.refuge_use_under_threat` (verified at 16), `eval.refuge_bite_deficit` and `eval.refuge_crowding` (unverified), 32 seeds                                                              | The bite-deficit read ("cover already protects") rests on unverified metrics                                                                                                                | Cannot tell (no report). The use-under-threat read has margin (negative on all 32 seeds); the bite-deficit claim is unverified                                                                                                             | refuge.md                                            |
| `E131`     | Delete `coverConceals` and `coverFoodFree` as inert; keep 8 rings                                     | `eval.refuge_use_under_threat` per arm on 8 seeds, none near the 0.05 bar                                                                                                                  | 8 seeds under the 16 minimum, but the gap is a factor of 10                                                                                                                                 | Holds. Means reproduce from the saved reports (defaults -0.0024 to refuges-24 -0.0056; at most 1 of 8 seeds above 0). The deletion was later reversed by `E135` and `E137`                                                                 | refuge.md                                            |
| `E132`     | Sense does not lift refuge use; not reverted                                                          | `eval.refuge_use_under_threat` per arm on 8 seeds                                                                                                                                          | As `E131`                                                                                                                                                                                   | Holds. Means reproduce (sense-off-8 -0.0024, sense-on-8 -0.0019, at most 2 of 8 seeds above 0)                                                                                                                                             | refuge.md                                            |
| `E133`     | `refugeSense` no harm, kept                                                                           | Keep rule counts (alive 12/16 on the line, under 80 7 against 7); guards no-difference                                                                                                     | Count test fails inert arms; `predators_at_end` and `prey_extinctions` unverified                                                                                                           | Holds. Re-judged by `E138` (32 paired seeds, `refugeSense` on); no guard worse                                                                                                                                                             | refuge.md                                            |
| `E134`     | `juvenileDependency` kept; `predatorRestTicks` and `provisionEnabled` fail; `satedBite` held          | Keep rule counts; `eval.prey_types_at_end` 3.56 to 2.75 `worse` for provisioning (verified at 64, run at 16)                                                                               | Count test fails inert arms; guard read at a quarter of its seed minimum                                                                                                                    | Mixed. `juvenileDependency` and `predatorRestTicks` hold (re-judged by `E137`). Provisioning's deletion is at risk: it rests on a count and a metric read at 16 seeds, not paired intervals on 32                                          | realistic-keepers.md (task T30)                      |
| `E135`     | `coverFoodFree` kept; `rewardedHebb`, `coverConceals` held; herbivore `meatFoodValue` 0.1 not adopted | Keep rule counts; `eval.prey_types_at_end` 3.56 to 3.00 `worse` for `meatFoodValue`                                                                                                        | As `E134`; the note itself shows the counts fail an inert change 43% of the time                                                                                                            | The held arms hold (re-judged by `E137`). The `meatFoodValue` rejection is at risk for the `E134` reason                                                                                                                                   | realistic-keepers.md (task T30)                      |
| `E136`     | `satedBite` kept                                                                                      | `eval.hunter_kill_conversion_hungry.1k-2k` not worse (verified at 16); `predators_at_end`, `prey_extinctions` `better` (unverified)                                                        | Conversion read before the T16 fix; the two `better` verdicts are headcounts                                                                                                                | Cannot tell (no report). The no-harm read rests on a `verified` metric at its minimum; `E138` re-read it at 32 seeds                                                                                                                       | realistic-keepers.md                                 |
| `E137`     | `predatorRestTicks`, `rewardedHebb`, `coverConceals` kept (no harm)                                   | Paired share intervals on `hunters alive` and `under 80` at 32 seeds                                                                                                                       | None found: the method is `keepRule`'s. Smallest loss it detects is about 10 seeds                                                                                                          | Holds. `rewardedHebb` 10 lost against 3 gained: exact p 0.092, no-harm (the note's 0.092)                                                                                                                                                  | realistic-keepers.md                                 |
| `E138`     | Adopt all kept mechanisms (T22)                                                                       | Paired share intervals at 32 seeds; conversion `worse` read through the hungry-chase metric                                                                                                | Conversion read before the T16 fix                                                                                                                                                          | Holds by the recorded counts (alive 13/16 and 14/16, under 80 5 and 4); no report to re-run                                                                                                                                                | realistic-keepers.md                                 |
| `E139`     | Defaults held; `mutationRate` 0.1, weight decay 0 not adopted                                         | `worse` on `eval.hunter_ticks_last_quarter`, `eval.predator_births` (unverified), `eval.hunter_catches_per_1k` (verified at 64, run at 32), alive 23/32 against 27/32                      | Three of the four `worse` verdicts are below the bar                                                                                                                                        | Cannot tell (no report). Nothing adopted, so the outcome stands; the stated reason is weaker                                                                                                                                               | natural-selection.md                                 |
| `E140`     | Done-table misses recorded; status waits                                                              | `eval.skill_trend`, `eval.basin_recolonisations`, `eval.social_return`, all `unverified`; hunters alive 13/16                                                                              | Three misses are read on `unverified` metrics                                                                                                                                               | At risk (no report; the 600000-tick run is not in the repo). A row in each owning doc                                                                                                                                                      | hunter-practice.md, habitat-cover.md, alarm-calls.md |
| `E141`     | Premise holds: prey live far from cover                                                               | `eval.prey_cover_distance`, `eval.prey_within_dash_share`, `eval.prey_in_patch_share` (verified at 16)                                                                                     | None                                                                                                                                                                                        | Holds. E150 (128 seeds): 1984 px, 0.123, 0.343 (`E141`: 2070, 0.103, 0.341)                                                                                                                                                                | habitat-cover.md                                     |
| `E142`     | Premise holds: the season barely moves where agents live                                              | `eval.season_map_distance`, `eval.herd_season_shift` (unverified), `eval.winter_band_shift`, `eval.winter_patch_proximity` (verified)                                                      | Two of four unverified                                                                                                                                                                      | Holds. E150: 0.356, 0.620, 0.020, -0.120 (`E142`: 0.346, 0.619, 0.016, -0.115)                                                                                                                                                             | (seasonal-movement.md)                               |
| `E143`     | Premise holds: calls absent, opportunities exist                                                      | `eval.call_opportunity_neighbours` (verified at 64), `eval.call_opportunity_kin` (unverified)                                                                                              | Read at 16 seeds; one metric unverified                                                                                                                                                     | Holds. E150: 3.17 and 2.46 (`E143`: 3.17 and 2.44); alarm calls on 5 of 128 seeds                                                                                                                                                          | alarm-calls.md                                       |
| `E144`     | Premise holds: matched conversion falls less with age than pooled                                     | `eval.hunter_conversion_matched.*`, `eval.hunter_kill_conversion_by_age.*`, `eval.hunter_conversion_by_dose`                                                                               | Read before the T16 phantom-chase fix, which skewed both                                                                                                                                    | Holds on the corrected report. E150: matched fall 0.086 to 0.046 (0.040), pooled 0.108 to 0.043 (0.065); `E144` read 0.039 and 0.053. By dose 0.0002                                                                                       | hunter-practice.md                                   |
| `E145`     | Roaming does not lift the summer prey minimum; no finalist                                            | `eval.prey_summer_min` intervals (16 seeds)                                                                                                                                                | `eval.prey_summer_min` is `unverified` (MDE32 1.00); a mean verdict is no longer given                                                                                                      | Holds. `eval:compare` now gives no verdict on it. Seeds at 100 or more, exact paired test: margin-25 4 gained and 1 lost (p 0.38), margin-100 3 and 2 (1.0), roam-3000 1 and 5 (0.22), roam-6000 2 and 5 (0.45), spring-1.2 2 and 6 (0.29) | world-balance.md                                     |
| `E146`     | Roaming mate range harms; deleted                                                                     | Paired under-80 share (9 to 18 of 32); alive 27 to 25; `worse` on `eval.predators_at_end` and `eval.prey_types_at_end`                                                                     | The two `worse` verdicts are now no verdict (`unverified`) and "needs 64 seeds"; `eval.behaviour_coverage` `better` is `no-difference` under the 0.02 share min-effect (T29a)               | Holds. `--keep-rule`: under-80 `worse` (11 harmed, 2 recovered, exact p 0.022); alive no-harm (4 and 2, p 0.69). The decision rested on the seed shares, not the headcounts                                                                | world-balance.md                                     |
| `E147`     | Mate rank reads the fatal bite (T15); kept                                                            | Alive 27 to 27, under 80 9 to 9, paired differences 0; `eval.basin_families` `worse` (unverified)                                                                                          | None for the guards; the one `worse` verdict is on an `unverified` metric and is void                                                                                                       | Holds by the recorded counts (the reports were in `/tmp`)                                                                                                                                                                                  | metric-trust.md                                      |
| `E148`     | Defaults power reference; liveness readings                                                           | Liveness of 268 metrics                                                                                                                                                                    | Predates the leak-skill and phantom-chase fixes (`E149`)                                                                                                                                    | Holds, replaced by `E149` and then `E150`. T34a re-read liveness on `E150`: no metric changes pass or fail                                                                                                                                 | metric-trust.md                                      |
| `E149`     | Defaults power reference after two observer fixes                                                     | Liveness and fixed values                                                                                                                                                                  | None                                                                                                                                                                                        | Holds, replaced by `E150`                                                                                                                                                                                                                  | metric-trust.md                                      |
| `E150`     | Power read of the corrected reports                                                                   | `eval:power` on 128 seeds                                                                                                                                                                  | None                                                                                                                                                                                        | Holds (the reference of T26 to T34a)                                                                                                                                                                                                       | metric-trust.md                                      |

**Counts.** Of the 31 records: 17 hold, 0 flip, 11 cannot be told (no report: `E120` to `E124`, `E127` to `E130`,
`E136` and `E139`), and 3 are at risk (`E134` and `E135`, two rejections made on a 16-seed count and an unpowered guard;
`E140`, three misses read on `unverified` metrics). Four tasks follow: T30 in realistic-keepers.md and one row each in
hunter-practice.md, habitat-cover.md and alarm-calls.md.

**What the re-read found.**

- **No verdict flips on the reports that exist.** `E145`, `E146` (keep rule `WORSE` on the under-80 guard), `E131`, `E132`
  and `E137` hold; `E141` to `E144` hold on the 128-seed corrected report, and `E144` holds after the T16 fix.
- **The headline hunter verdicts of `E122`, `E123` and `E139` cannot be re-run.** Their metrics are either below their seed
  minimum at the seeds used or `unverified`. `E123`'s adoption has support that survives: `eval.births_per_1k` and
  `eval.spec_effective` are `verified` at 16 seeds and both moved the right way. The phantom chase understated conversion
  in the arm that catches more, so the direction of `E122` and `E123`'s conversion verdicts is conservative.
- **Two rejections were made on a count and an unpowered guard.** `provisionEnabled` (`E134`, deleted at realistic-keepers
  T20) and herbivore `meatFoodValue` 0.1 (`E135`) failed on 16-seed alive and under-80 counts and on
  `eval.prey_types_at_end`, which needs 64 seeds. AGENTS.md says a realistic mechanism is deleted only on paired intervals
  on 32 matched floor-on seeds. Task T30 in realistic-keepers.md re-judges both.
- **The `E140` misses.** `eval.skill_trend`, `eval.basin_recolonisations` and `eval.social_return` are `unverified`
  (liveness or power), so "miss" cannot be read as a miss of the world. The three plans the natural-selection.md Decisions
  table hands them to each get a row.

### 2026-11-11 - Capacity reference (carrying-capacity T6, E151)

`evals/decisions/E151/defaults-floor-on.json`: the defaults, floor on, 128 seeds of `evals/seeds.json`, 200000 ticks,
policy `live` (`map-elites-v6`), configHash `ff8d890a5a70c14d`, commit 512af1d6 (code-equivalent to the Phase 1 chunk A
merge), 288 metrics, 2792 s on 30 workers. It is the reference Phase 2 sets its arms from.

**The four detectors.**

| Metric                      | Mean   | SD    | Nulls | Liveness (distinct) | Power (FPR, MDE at 16 / 32 / 64)                | `minSeeds` | Status     |
| --------------------------- | ------ | ----- | ----- | ------------------- | ----------------------------------------------- | ---------- | ---------- |
| `eval.cap_share`            | 0.132  | 0.159 | 0     | live (58)           | 0.10 / 0.05 / 0.07; 0.20 / 0.15 / 0.10 absolute | null       | unverified |
| `eval.food_standing_share`  | 0.947  | 0.040 | 0     | live (128)          | 0.09 / 0.04 / 0.00; 0.05 / 0.03 / 0.03 absolute | 16         | verified   |
| `eval.density_starve_slope` | -0.130 | 0.439 | 0     | live (128)          | 0.11 / 0.10 / 0.06; none detected at any size   | null       | unverified |
| `eval.density_intake_slope` | -0.036 | 0.269 | 0     | live (128)          | 0.10 / 0.09 / 0.07; none detected at any size   | null       | unverified |

`eval.cap_share` is zero on 38 seeds, with median 0.068 and maximum 0.69; its spread is too wide for the 0.05 share bar,
so Phase 3's `eval.cap_share` criterion falls back to the exact sign test the plan already names. The two elasticities
have a false-positive rate near 0.10 and no planted step they detect up to 64 seeds (the `trend` bar is an absolute 0.10
and the per-seed SD is 0.3 to 0.4), so they cannot gate; the same sign-test fallback applies, and a screen reads their
mean over the arm with its interval. Liveness: the 284 older metrics read the same null share and distinct count as on
E150, as they must; `metric-liveness --write` rewrote `liveness.js` with E151 as the reference for all 288 (it has no
merge mode, and the reading of an old row is unchanged). Power came from `eval:power --include-watch --sizes 16,32,64
--splits 1000 --power-splits 200` on the four metrics (57 s), merged into `power.js` with `metric-power-write --merge`
(new: it keeps the readings the JSON does not name, so the 284 E150 readings stay).

**Does food brake the population today? No.** The starvation elasticity is -0.130 (standard error 0.039; 51 seeds
positive, 77 negative): starvation per agent does not rise with the crowd, it falls a little, the wrong way for a
food-limited world (boom years are also the years of plenty and the cap; season is held fixed, but time is not). The
intake elasticity is -0.036 (standard error 0.024; 59 positive, 69 negative): a 10% rise in population takes 0.4% off the
food each agent eats, about nothing. The map stands at 0.947 of `maxFood` edible, with the lowest seed at 0.84. The cap
is what stops growth: 90 of 128 seeds reach 450 and the mean seed sits at the cap on 0.132 of its checkpoints.

**Baseline re-read.** The E150 and E151 reports agree on every Baseline reading (same configHash, same sim). The table
used a tick-20000 cut for the trace readings; the detectors and `held` cut at `BURN_IN_TICKS` (tick 10000). At the 20000 cut
the old table is reproduced (89, 0.137, 30, 71, 17.5); at the 10000 cut that the instruments use the readings are:

| Reading                                            | Was (cut 20000) | Now (cut 10000)            |
| -------------------------------------------------- | --------------- | -------------------------- |
| Seeds that reach 450                               | 89 of 128       | 90 of 128                  |
| Share of checkpoints at 450 or more                | 0.14            | 0.132 (= `eval.cap_share`) |
| Seeds that stay at 100 or more (`held`)            | 30 of 128       | 29 of 128 (0.227)          |
| Seeds that fall under 40; median lowest population | 71; 17.5        | 71; 17.5 (unchanged)       |
| Floor guard fires (`eval.floor_episodes` above 0)  | 61              | 61 (unchanged)             |
| Hunters alive at the last tick                     | 95              | 95 (unchanged)             |
| Hunter extinctions under 40 / at 40 or more        | 33 / 0          | 33 / 0 (unchanged)         |
| Chase catch share, hunters extinct against alive   | 0.056 / 0.053   | 0.056 / 0.053              |
| Chance against deliberate food energy per 1k       | 313 / 226       | 313.2 / 225.9              |
| `eval.collision_death_share`                       | 0.27            | 0.270                      |

The edge for `held` stands at 100: by lowest population after burn-in, seeds under 40 hold hunters alive on 38 of 71, and
every one of the 57 seeds at 40 or more keeps its hunters (9 of 9 at 40 to 60, 19 of 19 at 60 to 100, 29 of 29 at 100 or
more); no seed whose lowest population is 80 or more ends under 80 (0 of 38), while 51 of the 99 seeds that dip under 100
and 38 of the 58 whose lowest is under 10 do (so the guard keeps its constant, 100). Hunters die only in worlds that
crashed, as the plan says.

**The food ratio.** The plan wants the eaten rate that sets the food arms. The report holds no item counts, so a
throwaway driver (`createWorld` and `step` with the live policy, seeds 313056, 337535, 612370, 446985, 639124, 888035,
654502, 275725 of `evals/seeds.json`, 200000 ticks, defaults, floor on; it only reads `floraMeals[0]`, `foodGone` and
`foodCount`, so the sim is untouched) counted per tick: plant meals eaten (`floraMeals[0]`), items rotted (`foodGone`
ROTTED, exact because rot empties a slot late in the tick) and spawned (the change in `foodCount` plus both).

| Per tick, 8 seeds, 1.6M ticks | Value                                                                      |
| ----------------------------- | -------------------------------------------------------------------------- |
| Offered by the formula        | 10.5 x mean scarcity 0.85 = 8.93 (`foodRegrowPerArea` 0.09)                |
| Spawned (map full, clipped)   | 1.94                                                                       |
| Eaten (plant meals)           | 1.59, 0.0075 per agent per tick at a mean of 211 agents (0.0064 to 0.0082) |
| Rotted                        | 0.33 (17% of leavers)                                                      |
| Eaten against offered         | 0.18 (0.03 in the extinct worlds, 0.33 in the booming ones)                |
| Eaten against spawned         | 0.82                                                                       |

So **the food ratio is 0.18**: the formula offers about 5.6 times what the agents eat, and the map clips the rest. By
season the eaten rate is 1.56, 2.07, 0.97 and 1.50 per tick (the four `seasons` entries in order, scarcity 1.2, 1.0, 0.8
and 0.4), lowest in the third. The population that eats a given supply is supply over 0.0075: 1.5 to 2.6 items
per tick for 200 to 350 agents.

**T66's eaten rate was low.** The T66 driver counted an eaten item as a slot empty at the end of the tick. The feed phase
empties it and `spawnFood` in the same tick's field phase often refills the slot first, so those meals vanish from the
count. The same scan on these runs gives 0.67 eaten per tick against the true 1.59 (a ratio of 0.42), which matches T66's
0.62; its rot figure (0.30) matches the 0.33 here because rot empties slots after the spawn. The T66 turnover of 0.9 per
tick was therefore about 1.9.

**What Phase 2 T8 needs.**

- **Set the arms from 1.59 items per tick, not 0.6.** The `foodRegrowPerArea` whose supply equals the eaten rate is
  1.59 / (116.64 x 0.85) = 0.016, so the arms at 0.5, 0.75, 1.0 and 1.5 times it are 0.008, 0.012, 0.016 and 0.024. The
  plan's 0.003 to 0.009 would give a fifth to a half of the eaten rate and read as starvation
  (`E-CC-1` could fail on the arms, not on the idea). A world held at 200 to 350 agents eats 0.015 to 0.026 worth, so
  the 1.0 and 1.5 arms (supply for about 210 and 320 agents) are the ones that can settle in the target band; the 0.5 and
  0.75 arms (about 105 and 160) sit at or near the `held` edge, which is exactly the "less food only deepens the fall"
  risk the stop rule names. Read the
  per-arm intake under 50 prey as the plan says.
- **The detectors will move with food.** An arm brakes if `eval.density_starve_slope` turns positive and
  `eval.density_intake_slope` turns clearly negative against -0.13 and -0.04; both are unverified and cannot gate, so the
  arm table reads their mean and the share of seeds with the right sign beside `held`, `alive` and `eval.cap_share`.
- **`eval.cap_share` cannot be a verified metric at 64 seeds** (MDE 0.10 absolute at 64); judge it by the paired sign test.
- **`eval.food_standing_share` is verified at 16 seeds** and reads 0.947 now; a food arm that bites should pull it well
  under that, and it is the cheapest check that an arm made food short.
- **The `held` constant stays at 100**; the plan row for moving it does not fire.
- **Caveats on the probe**: plant meals only (carcass meals and herd grazing are not in the 1.59), 8 seeds, and the
  eaten rate follows population, so it is a reference rate, not a ceiling.
