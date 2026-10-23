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
