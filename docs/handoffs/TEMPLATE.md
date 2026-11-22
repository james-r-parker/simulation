# Handoff <YYYY-MM-DD> - <stream>

The prompt for one stream: a lane given to a session of the coordinator's model family. Copy this file to
`docs/handoffs/<YYYY-MM-DD>-<stream>.md`, fill every field, commit it, then start the stream. Read `AGENTS.md` and
`docs/principles.md` first, then the plan the stream builds (the `resume-plan` skill).

## Goal and done

The plan doc, the task ids, and the reading that ends the stream (a PR merged, a metric read, a run's verdict).

## Owns

The paths the stream may edit. Two live streams own no path in common; a path two streams need goes to one of them and
the other waits for its branch to be merged into the batch.

## Worker budget

The `--workers` number for the stream's long runs, taken from `npm run state` (workers free) when the stream starts.

## Experiment ids

Allocate with `scripts/experiment.mjs new` (once the experiment ledger is built; until then the coordinator names the
next id). A stream of another model family records no experiment.

## Before it stops

Commit on the chunk branch (cut from the coordinator's batch branch); do not push or open a PR - the coordinator merges
it into the batch (`AGENTS.md`, user 2026-11-22). Write what is running (run names from `scripts/run-detached.sh`) and what is next into this
handoff file. Never end a turn with a background job running.

## Ruled out

The levers already falsified for this work, by experiment id, so the stream does not repeat them.
