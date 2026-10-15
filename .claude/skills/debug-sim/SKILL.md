---
name: debug-sim
description: Use when the simulation misbehaves or a bug report arrives - agents freeze, die en masse, never eat, stop evolving, fitness explodes, the frame rate drops, the archive will not load, a test is flaky, a replay diverges - or when asked to "check the logs", "why did it do that", "debug this", "reproduce". Also use before changing behaviour you do not fully understand.
---

# debug-sim

> For the legacy app (`js/*.js` outside `js/sim` and `js/evo`), use step 5 only: the browser console and the dev
> performance monitor.

## Overview

The headless sim is deterministic: the same seed and config replay the same world, tick for tick. Headless runs write
one structured JSON event per line to `.sim/logs/<run-id>.jsonl`; in the browser the same events go to the console.

**Core principle:** evidence before edits. Find the event, replay it from seed and config, turn the replay into a
failing test, then fix. A fix without a reproducing test is a guess.

## Steps

1. **Find the run.** Every headless run (`eval`, `train`, `replay`, a test that opts in) logs its `seed`,
   `configHash`, `configOverrides`, `policy` and `runId` in its first `RunStarted` event; an eval's own log
   (`.sim/logs/eval-<id>.jsonl`) starts with `EvalStarted`.

    ```bash
    ls -t .sim/logs/ | head -3
    jq -c 'select(.event == "RunStarted")' .sim/logs/<run-id>.jsonl
    ```

2. **Find the event.** Start from failures and warnings, then follow one agent by slot or genome id:

    ```bash
    jq -c 'select(.level == "error" or .level == "warn")' .sim/logs/<run-id>.jsonl
    jq -c 'select(.genomeId == "<id>")' .sim/logs/<run-id>.jsonl
    jq -r '.event' .sim/logs/<run-id>.jsonl | sort | uniq -c | sort -rn
    ```

    Event names are stable; the Logging and diagnostics row of each design doc lists the ones it adds.

3. **Replay.** Reproduce from the seed and config, stopping just after the event's tick:

    ```bash
    npm run replay -- --seed <seed> --config <config.json> --ticks <tick + 1> --dump <tick> --level debug --check-invariants
    ```

    `--dump <tick>` writes the world state at that tick to `.sim/dumps/<runId>-<tick>.json` for inspection;
    `--check-invariants` stops at the first broken invariant and logs `InvariantViolated`. `--policy` arrives with
    `evolution-evals.md`; until then replay runs the `clone-with-noise` reference policy. To watch metrics, run
    `bash -lic 'npm run aspire:dashboard'` and set `OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318`. A replay that diverges from the
    logged run is itself the bug: something read `Math.random`, wall-clock time or iteration order of a `Map` keyed by
    object - check the `conventions` gate output and the RNG streams the code uses.

4. **Write the failing test.** Put the seed, config overrides and tick count in a test under `test/sim/` or
   `test/evo/` that asserts the correct behaviour and fails today. Prefer a minimal world (a few agents, scripted
   positions) over the full replay once the cause is understood.

5. **Performance problems.** For `bench.*`, run `npm run bench` and read the per-phase split (`environment`, `hash`, `sense`,
   `brain`, `physics`, `lifecycle`, `field`). For the browser, open DevTools Performance, record 10 s, and look for long tasks on the main
   thread and a GC sawtooth; `window.__perf()` in dev builds (`dev-workflow-and-gate.md` Phase 2) returns the frame-time breakdown. A regression is
   confirmed only against a baseline recorded on the same machine.

6. **Fix**, run `scripts/check.sh --fix`, and confirm the test now passes and the golden `worldHash` test either
   still passes or changes for a reason the commit body states.

## Red flags

- Editing code before reproducing the problem.
- A fix with no test, or a test that passes before the fix.
- "Flaky" accepted as an explanation - in a deterministic sim, flakiness is a determinism bug.
- Updating the golden `worldHash` without saying why in the commit.
- Logging per agent per tick to find a bug, and leaving it in.
