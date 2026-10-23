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
