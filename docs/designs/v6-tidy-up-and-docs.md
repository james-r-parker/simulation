# v6 tidy-up and docs

**Status:** Proposed - Phase 1 sweeps out every remaining trace of the legacy app; Phase 2 rewrites the docs and the README with screenshots.
**Validated:** 9f73367 (2026-10-15)
**Priority:** 4 - the last stage of v6: nothing legacy is left and every doc describes the app as built
**Depends on:** [worker-and-renderer.md](worker-and-renderer.md), [improvement-loop.md](improvement-loop.md)

The final stage of the v6 modernisation. [worker-and-renderer.md](worker-and-renderer.md) Phase 3 deletes the legacy
app's files; this doc removes everything the legacy app left behind in the tooling, tests and docs, makes sure none
of it can come back, and leaves the repo documented for a reader who has never seen the old app.

## Legacy sweep

Everything that exists only because the legacy app existed goes:

| What                                         | Where it lives                                                                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The legacy line budget and its convention    | `legacyLines` in `scripts/quality-baseline.json`; the budget check in `scripts/check-conventions.sh`                                                                |
| The dev-only frame probe for the legacy loop | `js/dev/perf-probe.js`, its test, and the `js/dev` entries in `eslint.config.js` and `tsconfig.json`                                                                |
| `--app legacy` in the browser measurement    | `scripts/browser-perf.mjs`; the legacy fallback-adapter wording; its tests                                                                                          |
| Legacy-only ignores and scopes               | `.prettierignore`, the ESLint ignores, the dependency-cruiser exclusions, the jscpd and coverage scopes                                                             |
| Allowlisted legacy console errors            | `test/browser/known-console-errors.json` entries for the legacy GPU paths                                                                                           |
| Legacy wording in instructions               | `AGENTS.md` (the "legacy implementation" paragraph, Where-things-are rows, the legacy-files size limit, Debugging), `CLAUDE.md`, the skills under `.claude/skills/` |
| Root docs written for the legacy app         | `DEPLOY.md` rewritten for the new build; any `*.README.md` left anywhere                                                                                            |
| Dependencies only the legacy app used        | `package.json`; each removal checked against `rg` over `js/`, `scripts/` and `test/`                                                                                |

`bench/legacy-baseline.json` stays: it is the measured "before" that the v6 browser numbers are compared with, and
the README quotes it. [legacy-audit.md](legacy-audit.md) stays as a `Reference` doc: it records why each part was
replaced.

A new `conventions` rule keeps the legacy app out: it fails when any of the deleted paths reappears, when a file
under `js/` sits directly in `js/` rather than in `js/sim/`, `js/evo/`, `js/worker/` or `js/app/`, or when
`AGENTS.md`, `README.md` or a skill uses the word "legacy" outside a link to `legacy-audit.md` or
`bench/legacy-baseline.json`.

## Docs

- Every design doc ends `Implemented`, `Reference` or `Superseded`; the Build queue in
  [README.md](README.md) is empty. The `audit-docs` skill runs over every doc, and every fix it proposes is applied
  or recorded as a `Reference` note.
- `README.md` at the repo root is rewritten for someone meeting the project for the first time:
    - what Blob Evolution is and what to watch for, with a hero screenshot;
    - screenshots of the main view, the stats panel with population and lineage charts, the inspector on a selected
      agent, and the event ticker;
    - how to run it (`npm ci`, `npm run dev`), train champions (`npm run train`), run evals and replays;
    - how it is built: the sim core, evolution, the worker and the renderer, in one diagram and a paragraph each,
      linking the design docs;
    - the before-and-after numbers: `bench/legacy-baseline.json` against `bench/browser-baseline.json`, and the
      eval baselines;
    - links to `AGENTS.md` for contributors and agents.
- `AGENTS.md`, `CLAUDE.md`, `DEPLOY.md`, `docs/designs/sim-notes.md` and every skill describe the repo as it is.

### Screenshots

`scripts/screenshots.mjs` (`npm run screenshots`) makes the README's images reproducible:

- It builds the app, serves it with `vite preview`, and opens it in Chromium through Playwright, or a running Chrome
  with `--cdp=<url>` like `scripts/browser-perf.mjs`.
- It loads `?seed=<n>` (default 7) at a fixed viewport of 1600 x 900, runs the world at top speed until a fixed tick,
  pauses, and captures each view: `docs/images/overview.png`, `stats.png`, `inspector.png` (it selects the
  oldest living agent) and `ticker.png`.
- Images are PNG, each under 400 KB; the script fails naming any file over that size.
- The same seed and tick give the same world, so a rerun changes the images only when the app's look changes.

## Phases

### Phase 1 - Legacy sweep

**Targets:** none - removal and a guard; no behaviour changes

- Everything in the Legacy sweep table removed, and the new `conventions` rule with its tests.
- `scripts/check.sh` green with lint, typecheck and Prettier covering every file under `js/`, `scripts/` and `test/`.

### Phase 2 - Docs and screenshots

**Targets:** none - documentation

- `scripts/screenshots.mjs` and the four images in `docs/images/`.
- The rewritten `README.md`, and every doc and skill brought up to date; the Build queue empty.

## Delivery requirements

| Concern                 | Requirement                                                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture            | No new runtime code. Phase 1 deletes the files in the Legacy sweep table and adds a rule to `scripts/check-conventions.sh`. Phase 2 adds `scripts/screenshots.mjs` and `docs/images/*.png`                                                                                                                            |
| Unit tests              | Phase 1: `test/check-conventions.test.js` - a recreated legacy path, a file directly under `js/`, and "legacy" in `AGENTS.md` outside the allowed links each fail `conventions` in a temporary copy of the repo; the allowed links pass. Phase 2: `test/screenshots.test.js` pins argument parsing and the size check |
| Headless e2e            | N/A - no simulation change; the golden test from [headless-sim-core.md](headless-sim-core.md) must still pass unchanged, proving the sweep touched no sim behaviour                                                                                                                                                   |
| Performance budget      | N/A - no runtime change; `bench-check` and the browser numbers from [worker-and-renderer.md](worker-and-renderer.md) must stay within their budgets                                                                                                                                                                   |
| Evolution metrics       | N/A - no change to agents, fitness or selection; `eval-smoke` must still pass                                                                                                                                                                                                                                         |
| Determinism             | Screenshots use a fixed seed, tick and viewport so reruns are stable; no simulation RNG change                                                                                                                                                                                                                        |
| Config and persistence  | No `createConfig` keys or IndexedDB change. `package.json` loses dependencies only the legacy app used and gains the `screenshots` script; `scripts/quality-baseline.json` loses `legacyLines`                                                                                                                        |
| Logging and diagnostics | `scripts/screenshots.mjs` prints each image path, its size and the tick it was taken at, and exits 1 naming a missing view or an oversized image                                                                                                                                                                      |
| Browser compatibility   | Screenshots are taken in Chromium; WebGL is enough, so Playwright's Chromium works without a GPU                                                                                                                                                                                                                      |
| Docs                    | `README.md` rewritten with screenshots; `AGENTS.md`, `CLAUDE.md`, `DEPLOY.md`, `docs/designs/sim-notes.md`, every skill and every design doc's status brought up to date; this doc becomes `Implemented` when Phase 2 lands                                                                                           |
| Verification            | `scripts/check.sh` green at tiers 2 and 3; the steps in Verification below                                                                                                                                                                                                                                            |

## Task breakdown

### Phase 1 - Legacy sweep

| #   | Task                                                                                                                                                               | Nature       | Depends on         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------ |
| T1  | Inventory every legacy trace with `rg -i legacy` and the Legacy sweep table; list each in the PR body with its fate                                                | [judgement]  | -                  |
| T2  | Remove the legacy tooling: `legacyLines` and its check, `js/dev/perf-probe.js`, `--app legacy`, the legacy ignores and scopes, the console-error allowlist entries | [mechanical] | T1                 |
| T3  | Remove dependencies only the legacy app used, each checked with `rg`                                                                                               | [mechanical] | T1                 |
| T4  | Add the `conventions` guard against legacy paths, stray `js/` files and "legacy" wording, with `test/check-conventions.test.js`                                    | [judgement]  | T2                 |
| T5  | Update `AGENTS.md`, `CLAUDE.md` and the skills to drop legacy wording                                                                                              | [mechanical] | T2, T3             |
| T6  | Conformance review of Phase 1                                                                                                                                      | [judgement]  | T1, T2, T3, T4, T5 |

### Phase 2 - Docs and screenshots

| #   | Task                                                                                                                                                         | Nature      | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------- |
| T7  | Add `scripts/screenshots.mjs`, `npm run screenshots` and `test/screenshots.test.js`; commit the four images                                                  | [judgement] | T6         |
| T8  | Rewrite `README.md` with the screenshots, the architecture diagram and the before-and-after numbers                                                          | [judgement] | T7         |
| T9  | Run the `audit-docs` skill over every doc and apply its fixes; update `DEPLOY.md` and `docs/designs/sim-notes.md`; move every design doc to its final status | [judgement] | T8         |
| T10 | Conformance review of Phase 2                                                                                                                                | [judgement] | T7, T8, T9 |

## Verification

1. `rg -il legacy -g '!docs/designs/legacy-audit.md' -g '!bench/legacy-baseline.json'` finds nothing outside the
   allowed links, and `scripts/check.sh --only=conventions` fails when `js/game.js` is recreated.
2. `scripts/check.sh --tier 3` is green and the golden `worldHash` is unchanged.
3. `npm run screenshots` twice in a row leaves `git status` clean.
4. `README.md` shows the four screenshots on GitHub, and every link in it resolves.
5. [docs/designs/README.md](README.md) has an empty Build queue.
