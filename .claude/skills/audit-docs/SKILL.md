---
name: audit-docs
description: Use when checking whether docs (AGENTS.md, README.md, docs/designs/*.md, .claude/skills/*/SKILL.md) are in sync with the code - after adding or changing a config key, npm script, gate command, log event or saved format, before a PR that changes documented behaviour, or as a periodic review. Triggers on "audit the docs", "are the docs up to date", "doc drift", "check docs against code".
---

# audit-docs

## Overview

Docs rot where they duplicate the code. This skill compares every documented fact against its source of truth and
proposes edits.

**Core principle:** read-only until the human approves. Produce evidence-backed findings and a checklist; apply
nothing until the user ticks it.

## Source-of-truth map

| Fact                | Source of truth                                                               | Mirrors to check                                       |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| Config keys         | `createConfig` defaults in `js/sim/config.js` (legacy: `js/constants/*`)      | Design docs' Config and persistence rows; README       |
| npm scripts         | `package.json` `scripts`                                                      | AGENTS.md Commands table; skills                       |
| Gate commands       | `scripts/check.sh`, `scripts/check-conventions.sh`, `.github/workflows/*.yml` | AGENTS.md; `dev-workflow-and-gate.md`; skills          |
| Design status       | Each doc's `**Status:**` line                                                 | `docs/designs/README.md` (generated)                   |
| Log events          | `simLog` event names in `js/sim/`                                             | Design docs' Logging and diagnostics rows; `debug-sim` |
| Metrics             | The Metrics table in `evolution-evals.md` and the eval/bench scripts          | `**Targets:**` lines; `run-evolution-loop`             |
| Saved formats       | IndexedDB version and stores, champion file version                           | Design docs' Config and persistence rows               |
| Dependency versions | `package.json` (exact pins)                                                   | `docs/designs/sim-notes.md`                            |

Skip rows whose source does not exist yet, and say so in the report.

## Steps

1. `git fetch origin` and note `git rev-parse --short origin/main`.
2. **Diff each map row.** Extract the list from the source, extract the list from each mirror, compare.
    - npm scripts: `node -p "Object.keys(require('./package.json').scripts).join('\n')"`
    - gate flags and gates: `sed -n '2,15p' scripts/check.sh` and its `GATES=` line
    - config keys: `rg -n 'createConfig' js/sim` then read the defaults object
    - log events: `rg -no "simLog\.\w+\('(\w+)'" js` once `simLog` exists
3. **Design index:** `node scripts/designs-index.mjs --check`. If stale, the fix is `--write` - never a hand edit.
4. **Dead references:** every file path and symbol named in the docs must exist. Use `fd` for paths and
   `rg -n '\b<symbol>\b' js scripts test` or `sg` for symbols. The index gate already rejects design-doc links that
   do not resolve; check AGENTS.md, README.md and the skills by hand.
5. **Implemented docs contradicted by code:** for each `Implemented` doc, spot-check its tables (config keys, events,
   metrics, states) against the code.
6. **Stale stamps:** for each `Proposed` / `In progress` doc, count `git log --oneline <sha>..origin/main`. Flag
   large drift, or any drift touching files the doc names; suggest `resume-plan`.
7. **Line-number references:** `rg -n '\.(js|mjs|md|json|html|css|sh):[0-9]+' AGENTS.md README.md .claude/skills`.
   Replace each with a symbol reference. The index gate already covers `docs/designs`.
8. **Skills:** every command and flag in `.claude/skills/*/SKILL.md` must exist in `package.json`,
   `scripts/check.sh` or the workflow - or be marked as arriving with a named design doc phase.
9. **Report** (format below), then wait for approval.
10. **Apply** only the approved items, then run `scripts/check.sh --fix --docs` (or `scripts/check.sh --fix` if a
    non-Markdown file changed).

## Output format

Group findings under four headings:

- **Stale** - the doc says something the code no longer does.
- **Missing** - the code has something no doc mentions where one should.
- **Removable** - duplicated lists that should point at the source of truth instead.
- **Orphaned** - references to files, symbols, commands or docs that no longer exist.

Each finding:

```
- [ ] <short title>
  Doc:  <file> - <section or table>
  Code: <file> - <symbol>
  Evidence: <what differs>
  Edit: <the concrete replacement text or deletion>
```

End with the approval checklist (the `- [ ]` items) and ask which to apply.

## Duplicated lists rot

Every hand-maintained copy of a list is a future stale finding. Prefer:

- pointing at the source (`see createConfig in js/sim/config.js`) over copying the list
- generated output (like the design index) over hand-written tables
- one canonical table, linked from elsewhere

The legacy per-file `js/*.js.README.md` docs are duplicated lists of this kind; they go with their modules.

## Red flags

- Editing any file before the user approves.
- Findings without evidence on both sides (doc location and code location, by file and symbol).
- Citing code by line number in a finding.
- Hand-editing `docs/designs/README.md`.
- Rewriting an `Implemented` doc to match code that looks like a bug - report it as a possible bug instead.
- "Fixing" a mirror by adding another copy of the list.
