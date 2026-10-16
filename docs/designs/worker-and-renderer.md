# Worker and renderer

**Status:** Proposed - Phase 1 runs the sim core and the live policy in a Web Worker behind a validated message protocol.
**Validated:** bd49bce (2026-10-11)
**Priority:** 3 - the browser is where the simulation is watched, and it needs the core and the live policy first
**Depends on:** [headless-sim-core.md](headless-sim-core.md), [evolution-rework.md](evolution-rework.md), [dev-workflow-and-gate.md](dev-workflow-and-gate.md), [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)

The browser app runs the simulation in a dedicated worker and only draws on the main thread:

- The worker owns the world, the live policy (`LIVE_POLICY`), the observer and the archive. It steps on a fixed
  timestep and posts snapshots as transferable buffers.
- The main thread interpolates between the two newest snapshots and draws them with one instanced mesh per shape.
  Draw code allocates nothing per frame.
- The app is built for watching: agents are coloured by lineage and shaped by specialisation, an event ticker
  announces what changes (a new leading lineage, a lineage dying out, a hunting streak), the camera can follow an
  agent, and an inspector shows a selected agent's brain at work.
- It replaces the legacy app (`js/*.js`), deleted in Phase 3, and the defects recorded in [legacy-audit.md](legacy-audit.md) under
  LOOP-1, LOOP-2, LIFE-4, REN-1 to REN-4, SEL-6, DET-2, DET-3 and DET-5.

## Modules

| Module                                 | Exports                                                          | Does                                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `js/worker/protocol.js`                | `MESSAGE_TYPES`, `validateMessage`                               | Every message's shape; throws naming the type and field on a bad message                                                                                                 |
| `js/worker/pacing.js`                  | `createPacer`, `ticksDue`                                        | Accumulator, slice cap, drop rule and next-slice delay                                                                                                                   |
| `js/worker/buffer-pool.js`             | `createBufferPool`, `takeBuffer`, `giveBuffer`                   | The three snapshot buffers and which side holds each                                                                                                                     |
| `js/worker/live-stats.js`              | `createLiveStats`, `collectStats`, `tickerEvents`                | Stats and ticker items from observer state, events and policy log records                                                                                                |
| `js/worker/inspect.js`                 | `inspectAgent`                                                   | The selected agent's rows and counters into a preallocated message buffer                                                                                                |
| `js/worker/sim-host.js`                | `createSimHost`                                                  | Wires world, policy, observer, pacer, pool, stats and inspect over injected `post`, `now`, `schedule` and policy; calls the policy's `onEvent` and `afterStep` each tick |
| `js/worker/sim-worker.js`              | none                                                             | Binds `createSimHost` to `self`, `performance.now`, `setTimeout` and `MessageChannel`                                                                                    |
| `js/worker/archive-store.js` (Phase 3) | `openStore`, `loadArchive`, `saveArchive`                        | IndexedDB `BlobEvolutionDB` version 2, over an injected `indexedDB` factory                                                                                              |
| `js/app/main.js`                       | none                                                             | Page entry: wires the worker client, renderer, picking and UI                                                                                                            |
| `js/app/seed.js`                       | `chooseSeed`                                                     | `?seed=<n>` from the URL, else `crypto.getRandomValues`                                                                                                                  |
| `js/app/worker-client.js`              | `createWorkerClient`                                             | Sends commands; holds the previous and newest snapshot; returns the older buffer on each new one                                                                         |
| `js/app/interpolate.js`                | `interpolateInto`                                                | Blends two snapshots into instance data at `alpha`                                                                                                                       |
| `js/app/frame-stats.js`                | `createFrameStats`, `recordFrame`, `frameReport`                 | Frame-time ring and its p50, p95 and p99                                                                                                                                 |
| `js/app/picking.js`                    | `pickAgent`                                                      | Hit-test over interpolated positions; returns a `genomeId`                                                                                                               |
| `js/app/renderer/colors.js`            | `lineageColor`                                                   | Lineage hue and energy lightness into an RGB triple                                                                                                                      |
| `js/app/renderer/scene.js`             | `createScene`                                                    | Three.js renderer, camera and layers; `draw(alpha)`                                                                                                                      |
| `js/app/renderer/agents-layer.js`      | `createAgentsLayer`                                              | Five `InstancedMesh` (one per shape) with `instanceColor`                                                                                                                |
| `js/app/renderer/world-layers.js`      | `createFoodLayer`, `createObstacleLayer`, `createPheromoneLayer` | Instanced food and obstacles; pheromones as a `DataTexture` quad                                                                                                         |
| `js/app/renderer/overlays.js`          | `createOverlays`                                                 | Trails, the selected agent's rays and event sparkles on preallocated rings                                                                                               |
| `js/app/camera.js`                     | `createCameraController`, `followStep`                           | Pan, zoom and follow, copied from `Camera` in `js/camera.js`                                                                                                             |
| `js/app/ui/controls.js`                | `mountControls`                                                  | Pause, step, speed, seed, new world, copy stats, download archive, debug bundle                                                                                          |
| `js/app/ui/stats-panel.js`             | `mountStatsPanel`                                                | Population per specialisation, lineages, births, deaths, requested and actual speed                                                                                      |
| `js/app/ui/charts.js`                  | `mountCharts`, `riverSeries`                                     | Population by specialisation over time and the lineage river (top 8 lineages' share)                                                                                     |
| `js/app/ui/ticker.js`                  | `mountTicker`, `formatTickerItem`                                | The event ticker                                                                                                                                                         |
| `js/app/ui/inspector-data.js`          | `inspectorView`                                                  | Inspect message to heatmap cells and labelled counters                                                                                                                   |
| `js/app/ui/inspector.js`               | `mountInspector`                                                 | Draws `inspectorView`                                                                                                                                                    |
| `js/app/ui/toast.js`                   | `createToaster`                                                  | Toasts over an injected `document`, touched only when the first toast shows                                                                                              |
| `js/app/debug-bundle.js`               | `buildDebugBundle`                                               | Seed, config overrides, policy, starting archive and the replay command as JSON                                                                                          |

Every `js/worker/` module except `sim-worker.js` has `test/worker/<module>.test.js`; the pure `js/app/` modules
(`seed`, `worker-client`, `interpolate`, `frame-stats`, `picking`, `colors`, `camera`, `charts`, `ticker`,
`inspector-data`, `toast`, `debug-bundle`) have `test/app/<module>.test.js`. `js/app/` imports nothing from
`js/sim/`, `js/evo/` or `js/worker/` except `js/worker/protocol.js`.

## Protocol

| Direction      | Type                     | Fields                                                                                                                                                      |
| -------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| main to worker | `init`, `reset`          | `seed`, `config` (overrides); `reset` reuses the buffers                                                                                                    |
| main to worker | `setSpeed`               | `ticksPerSecond`, one of 0.25, 0.5, 1, 2, 4, 8 or 16 times 60                                                                                               |
| main to worker | `pause`, `resume`        | none                                                                                                                                                        |
| main to worker | `step`                   | `ticks`; accepted only while paused                                                                                                                         |
| main to worker | `returnBuffer`           | `buffer`                                                                                                                                                    |
| main to worker | `select`                 | `genomeId`, or 0 to clear                                                                                                                                   |
| main to worker | `exportArchive`, `flush` | none; `flush` saves the archive now (sent on `pagehide`)                                                                                                    |
| worker to main | `ready`                  | `configHash`, `rulesHash`, `layout` (`snapshotLayout` offsets), `policy`, `seed`                                                                            |
| worker to main | `snapshot`               | `buffer` (transferred), `tick`, `agentCount`, `foodCount`, `obstacleCount`                                                                                  |
| worker to main | `stats`                  | Every 250 ms of wall time: the Stats table                                                                                                                  |
| worker to main | `field`                  | Every 250 ms: the danger, attack and hunt pheromone grids as one `Float32Array` copy                                                                        |
| worker to main | `ticker`                 | `items`: `{ tick, kind, text, genomeId?, lineageId? }`                                                                                                      |
| worker to main | `inspect`                | With each snapshot while an agent is selected: its inputs, hidden and outputs and counters; `{ gone: true }` once it dies, after which the selection clears |
| worker to main | `archive`                | `json` (`encodeArchive`)                                                                                                                                    |
| worker to main | `log`                    | A `simLog` record at info level or above                                                                                                                    |
| worker to main | `error`                  | `message`, `stack`, `seed`, `tick`, `configHash`                                                                                                            |

Both sides run `validateMessage` on every message they receive.

## Worker loop

- **Buffers.** The worker allocates three snapshot buffers of `snapshotLayout(config).bytes` at `init`. After a slice
  that ran a tick, it writes `writeSnapshot` into a buffer it holds and transfers it. The main thread keeps the
  previous and the newest snapshot; when a new one arrives it returns the previous one at once. So the worker always
  holds at least one buffer; if it holds none, it skips that snapshot.
- **Pacing.** Each slice adds `(now - last) x ticksPerSecond / 1000` to the ticks owed, caps owed at
  `2 x maxTicksPerSlice` (counting the excess as dropped), and runs up to `maxTicksPerSlice` (8). `ticksPerSecond`
  is a request: stats report the actual rate, and the UI shows both.
- **Scheduling.** While ticks are owed, the next slice is posted through a `MessageChannel`; when none are owed, it
  is a `setTimeout` for the time until one is due; while paused, nothing is scheduled.
- **Errors.** On an exception the host posts `error`, logs `WorkerError` and stops stepping.

| Stat                                                                | Holds                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| `tick`, `ticksPerSecond`, `requestedTicksPerSecond`, `droppedTicks` | Progress and pace                                     |
| `population`, `bySpec`                                              | Counts                                                |
| `births`, `deaths`, `deathsByCause`                                 | Since the last stats message                          |
| `lineages`                                                          | Count alive, and the top 8 by size with their share   |
| `archive`                                                           | Occupied cells per specialisation, newest replacement |
| `seed`, `configHash`, `policy`                                      | Identity of the run                                   |

Lineage counts are rebuilt from the alive agents at each stats message. Ticker items come from the event ring, the
counts, and the policy's `log` records:

| Ticker kind   | When                                                                                         |
| ------------- | -------------------------------------------------------------------------------------------- |
| `new-leader`  | A lineage becomes the largest, leading by at least 2, not having led in the last 10000 ticks |
| `extinct`     | A lineage that reached 10 agents loses its last one                                          |
| `hunt-streak` | A predator's fifth kill                                                                      |
| `elder`       | An agent reaches 90% of `maxAgeTicks`                                                        |
| `elite`       | An `ArchiveReplaced` record                                                                  |
| `floor`       | A `PopulationFloor` event after tick 10000                                                   |

## Renderer

- `three` is upgraded to its current release in T8 and pinned exactly; the version and API changes go into
  [sim-notes.md](sim-notes.md).
- Agents: one `InstancedMesh` per shape (circle, triangle, hexagon, diamond, square, as in `AGENT_CONFIGS`), sized for
  `maxAgents`, `count` set per frame. `lineageColor` gives hue `fract(lineageId x 0.618034)` and lightness
  `0.35 + 0.4 x energy / maxEnergy`.
- Food and obstacles are one `InstancedMesh` each from the snapshot; pheromones are one quad textured by a
  `DataTexture` refreshed from each `field` message.
- Smoke clouds are one `InstancedMesh` of translucent discs from the snapshot's cloud section; `AlarmCalled` and
  `PackCalled` ticker events draw expanding rings ([predator-prey.md](predator-prey.md)).
- `interpolateInto(prev, next, alpha, out)` matches agents by slot and `genomeId` through a preallocated slot map,
  blends positions and angles (shortest arc), and places new agents at their newest position. `alpha` is the time
  since `next` arrived over the interval between `prev` and `next`, clamped to 0..1; with one snapshot it is 1.
- `pickAgent` tests the click against interpolated positions and sizes and returns the nearest agent's `genomeId`.
- Trails keep the last 32 positions of up to 64 agents (the selected agent and the leading lineage's) in a
  preallocated ring; rays draw only for the selected agent; sparkles mark ticker events.
- `index.html` keeps `#canvas-container` as the canvas parent. The worker starts with
  `new Worker(new URL('../worker/sim-worker.js', import.meta.url), { type: 'module' })`, and `vite.config.js` sets
  `worker.format` to `es`.
- In dev builds `window.__perf()` returns `{ app: 'v6', frameMs: { p50, p95, p99 }, ticksPerSecond, droppedTicks }`
  from `frame-stats.js`, where a frame is the interval between `requestAnimationFrame` callbacks.

## Persistence (Phase 3)

- `archive-store.js` opens IndexedDB `BlobEvolutionDB` version 2 inside the worker. The upgrade from version 1
  deletes `genePools` and creates `archive` (one record, key `all`: the `encodeArchive` JSON) and `meta` (key `run`:
  `rulesHash`, `layout`, `savedTick`).
- At `init` the worker loads the stored archive and passes it to the policy factory
  (`createMapElitesV1({ config, log, archive })`). A stored archive whose `rulesHash` or `layout` differs is
  discarded and logged as `ArchiveDiscarded`. With none, it fetches `/champions/v1/index.json` and places each
  champion with `seedArchive`, skipping (and logging `ArchiveDiscarded` for) any whose `rulesHash` or `layout`
  differs; a missing file leaves the archive empty.
- The worker saves 60 s of wall time after the first change since the last save, on `flush`, and on `exportArchive`.
- The worker keeps the archive JSON it started from; the debug bundle carries that starting archive, not the live
  one.

## Phases

### Phase 1 - Sim worker and protocol

**Targets:** none - nothing is drawn from the worker yet; Phase 2 measures the browser metrics

`protocol.js`, `pacing.js`, `buffer-pool.js`, `live-stats.js`, `inspect.js`, `sim-host.js`, `sim-worker.js` and
`worker-client.js`, with the tooling widened to `js/worker/` and `js/app/`.

### Phase 2 - Renderer and app shell

**Targets:** browser.frame_p95_ms, browser.main_long_tasks, browser.gc_pause_ms

- The remaining `js/app/` modules; `index.html` loads `js/app/main.js`, and the legacy app moves to `legacy.html`,
  served by `npm run dev` only and not part of the production build.
- `scripts/browser-perf.mjs` gains `--app v6|legacy` (default `v6`) and `--agents <n>`: for `v6` it skips the
  WebGPU check, reads `window.__perf()`, counts long tasks with its `PerformanceObserver` as before, and through a
  Chromium trace (category `disabled-by-default-v8.gc`) sums the durations of `MinorGC` and `MajorGC` events on the
  `CrRendererMain` thread into `browser.gc_pause_ms`.
- Budgets on the dev machine over 60 s at speed 1: at 500 agents, `browser.frame_p95_ms` at most 18,
  `browser.main_long_tasks` 0 after the first 5 s and `browser.gc_pause_ms` under 50; at the legacy app's agent count
  (100), `browser.frame_p95_ms` below `bench/legacy-baseline.json`.
- The `browser-smoke` allowlist (`test/browser/known-console-errors.json`) is emptied.

### Phase 3 - Persistence v2 and legacy removal

**Targets:** none - cleanup

`archive-store.js`, champion seeding and the `flush` on `pagehide`. Deleted: `legacy.html`; every file in `js/*.js`
and `js/constants/`; `public/database-worker.js`; all `*.README.md` files under `js/` and the repo root,
`js/README.md`, `css/style.css`, `css/toast.css`, `css/README.md`, `COLLISION_LOGIC.md`, `QUICKSTART.md`,
`start-server.bat` and `start-server.ps1`. The app's styles live in `css/app.css` from Phase 2. The legacy entries
leave `.prettierignore`, the ESLint ignores, `vite.config.js` (`manualChunks` stays for `three`) and the legacy line
budget; lint, typecheck and Prettier cover all of `js/`.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | Worker in `js/worker/` (imports `js/sim/`, `js/evo/`); UI and drawing in `js/app/` (imports `three` and `js/worker/protocol.js` only). `js/sim/` and `js/evo/` unchanged. T1 widens `tsconfig.json`, ESLint (worker and browser globals), `.prettierignore`, the coverage ratchet scopes (`js/worker`, `js/app`, ratchet only), jscpd and the mirrored-test convention (with `sim-worker.js` exempt), and adds the dependency-cruiser rules `app-boundary` (the import rule above) and `worker-no-dom`, with `no-circular` and `no-unresolvable` covering both directories. Legacy files deleted in Phase 3 as listed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Unit tests              | `test/worker/protocol.test.js` (each type accepts its shape, rejects a missing or wrong field by name, `step` only while paused), `pacing.test.js` (fake clock: owed ticks follow the rate, the cap and drop count, delays when nothing is owed, nothing while paused), `buffer-pool.test.js` (three buffers, never more than two on the main side, skip when none held), `live-stats.test.js` (each ticker kind fires once at its condition), `inspect.test.js` (rows for a live agent, `gone` after death), `sim-host.test.js` (fake port: snapshots alternate buffers, stats every 250 ms, error stops stepping), `archive-store.test.js` (injected `fake-indexeddb`, pinned: v1 to v2 drops `genePools`, mismatched `rulesHash` discarded, champion seeding, debounce and `flush`). `test/app/`: `worker-client` (returns the previous buffer on each new snapshot), `interpolate` (alpha 0 and 1, single snapshot, shortest arc, new and vanished agents, zero allocation over 1000 calls), `frame-stats`, `picking`, `colors`, `camera` (`followStep` converges), `charts` (`riverSeries`), `ticker`, `inspector-data`, `toast` (no document access before the first toast), `seed`, `debug-bundle` |
| Headless e2e            | `test/worker/sim-host.test.js` runs the core's golden world through `createSimHost` with `cloneWithNoisePolicy` for 5000 ticks in uneven slices and asserts the golden `worldHash`. `test/browser/app.spec.js` (Playwright, Phase 2): the page loads, the tick advances, a speed change raises the actual rate, clicking an agent opens the inspector; Phase 3: a reload restores the archive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Performance budget      | Before: `bench/legacy-baseline.json` ([dev-workflow-and-gate.md](dev-workflow-and-gate.md) Phase 2). After, on the dev machine over 60 s at speed 1: at 500 agents `browser.frame_p95_ms` at most 18, `browser.main_long_tasks` 0 after 5 s, `browser.gc_pause_ms` under 50; at 100 agents `browser.frame_p95_ms` below the legacy value. Recorded in `bench/browser-baseline.json`. The worker's top speed is bounded by step cost (about 2x at 500 agents); stats show the actual rate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Evolution metrics       | N/A - the worker runs `LIVE_POLICY` unchanged; evolution quality is measured headless by [evolution-evals.md](evolution-evals.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Determinism             | The seed comes from `chooseSeed` and shows in the controls. Stepping is deterministic from seed, config overrides and the starting archive; wall time decides only how many ticks run per slice. A Chromium run replays bit-exact in Node with the debug bundle's command, `npm run replay -- --seed <n> --config <file> --policy <name> --archive <file> --ticks <tick>`; runs from other browsers replay statistically only. `replay.mjs` gains `--archive`; the bundle's policy is a name registered in `js/evo/policies/index.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Config and persistence  | No new `createConfig` keys; worker constants (`maxTicksPerSlice` 8, stats every 250 ms, save debounce 60 s) are named exports. IndexedDB `BlobEvolutionDB` goes from version 1 to 2: `genePools` deleted, `archive` and `meta` created. `public/champions/v1/` seeds an empty archive                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Logging and diagnostics | The worker forwards `simLog` records at info and above as `log` messages to the console. New events: `WorkerStarted` (seed, configHash, policy), `WorkerError` (message, stack, seed, tick), `TicksDropped` (count, ticksPerSecond; at most once per 10 s), `ArchiveLoaded` (source `store`, `champions` or `empty`; cells), `ArchiveDiscarded` (reason), `ArchiveSaved` (cells, bytes). The debug bundle holds everything the replay command needs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Browser compatibility   | Verified: current desktop Chromium (Playwright in CI and the perf script) and current desktop Firefox (a manual walk of the Verification steps): module workers, transferable `ArrayBuffer`s, WebGL2 through `three`'s `WebGLRenderer`, IndexedDB in workers. No WebGPU. Safari and mobile are not verified; the app shows a message when `Worker` or WebGL2 is missing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Docs                    | `AGENTS.md` Where-things-are (`js/worker/`, `js/app/`; legacy rows removed in Phase 3) and Commands (`browser-perf --app`); `README.md` describes the new app; the `create-pr` skill names `bench/browser-baseline.json` for browser Targets; [dev-workflow-and-gate.md](dev-workflow-and-gate.md) and [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md) scope notes widen to `js/`; [sim-notes.md](sim-notes.md) records the `three` upgrade. This doc becomes `Implemented` when Phase 3 lands                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Verification            | `scripts/check.sh` green including `browser-smoke`; the Chromium and Firefox walk in Verification below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Task breakdown

### Phase 1 - Sim worker and protocol

| #   | Task                                                                                                                                 | Nature       | Depends on             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ---------------------- |
| T1  | Widen tsconfig, ESLint, Prettier, coverage, jscpd, dependency-cruiser and the mirrored-test convention to `js/worker/` and `js/app/` | [mechanical] | -                      |
| T2  | Add `js/worker/protocol.js` with tests                                                                                               | [judgement]  | T1                     |
| T3  | Add `js/worker/pacing.js` and `js/worker/buffer-pool.js` with tests                                                                  | [judgement]  | T1                     |
| T4  | Add `js/worker/live-stats.js` and `js/worker/inspect.js` with tests                                                                  | [judgement]  | T1                     |
| T5  | Add `js/worker/sim-host.js` with tests and the golden-hash run                                                                       | [judgement]  | T2, T3, T4             |
| T6  | Add `js/worker/sim-worker.js`, `js/app/worker-client.js` with tests, and `worker.format` in `vite.config.js`                         | [mechanical] | T5                     |
| T7  | Conformance review of Phase 1                                                                                                        | [judgement]  | T1, T2, T3, T4, T5, T6 |

### Phase 2 - Renderer and app shell

| #   | Task                                                                                                                                                               | Nature       | Depends on                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------- |
| T8  | Upgrade `three` to its current release, pinned; record it in [sim-notes.md](sim-notes.md)                                                                          | [mechanical] | T7                              |
| T9  | Add `js/app/interpolate.js`, `frame-stats.js`, `picking.js`, `seed.js` and `renderer/colors.js` with tests                                                         | [judgement]  | T7                              |
| T10 | Add `js/app/renderer/` (scene, agents, world layers, overlays) and `js/app/camera.js` with its test                                                                | [judgement]  | T8, T9                          |
| T11 | Add `js/app/ui/` and `js/app/debug-bundle.js` with tests                                                                                                           | [judgement]  | T7                              |
| T12 | Add `js/app/main.js` and `css/app.css`; point `index.html` at them keeping `#canvas-container`; move the legacy app to `legacy.html`; add `window.__perf`          | [judgement]  | T10, T11                        |
| T13 | Extend `scripts/browser-perf.mjs` (`--app`, `--agents`, GC trace); record `bench/browser-baseline.json`; empty the smoke allowlist; add `test/browser/app.spec.js` | [judgement]  | T12                             |
| T14 | Update `AGENTS.md`, `README.md` and the `create-pr` skill                                                                                                          | [mechanical] | T13                             |
| T15 | Conformance review of Phase 2                                                                                                                                      | [judgement]  | T8, T9, T10, T11, T12, T13, T14 |

### Phase 3 - Persistence v2 and legacy removal

| #   | Task                                                                                                                                               | Nature       | Depends on    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------- |
| T16 | Add `js/worker/archive-store.js` with tests; load, seed, save and `flush` in the host; send `flush` on `pagehide`; add `--archive` to `replay.mjs` | [judgement]  | T15           |
| T17 | Delete the legacy files listed in Phase 3 and their tooling entries; cover all of `js/` with lint, typecheck and Prettier                          | [mechanical] | T16           |
| T18 | Update `AGENTS.md`, [dev-workflow-and-gate.md](dev-workflow-and-gate.md) and [quality-gates-and-test-tiers.md](quality-gates-and-test-tiers.md)    | [mechanical] | T17           |
| T19 | Conformance review of Phase 3                                                                                                                      | [judgement]  | T16, T17, T18 |

## Verification

1. `scripts/check.sh` is green, including `browser-smoke` with an empty allowlist.
2. `npm run dev` in Chromium: agents move, the tick and actual speed rise in the stats panel, and the ticker posts a
   `new-leader` item within a few minutes.
3. Set speed 4: the stats panel shows 4x requested and the actual rate the machine sustains, and frames stay smooth.
4. Click an agent: the inspector's heatmaps update, the camera follows it, its rays draw; when it dies the
   selection clears.
5. `node scripts/browser-perf.mjs --agents 500` and `--agents 100` write `bench/browser-baseline.json` within the
   Phase 2 budgets.
6. Phase 3: reload and the console shows `ArchiveLoaded` with source `store`; run the debug bundle's replay command
   in Node to the same tick without error.
7. Repeat steps 2 to 4 in Firefox.
