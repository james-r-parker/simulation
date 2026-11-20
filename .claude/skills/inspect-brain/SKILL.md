---
name: inspect-brain
description: Use when a champion fails a drill and its neural pathways need inspection or a causal edit test.
---

# inspect-brain

## Purpose

Use a deterministic brain dossier to explain a failed drill. The dossier is diagnostic: edited weights stay in memory and do not enter a champion file, genome, archive, fitness or selection.

## Steps

1. **Choose a replay.** Record the champion name, registered drill, seed and trial count. Check the available names in `DRILLS` in `js/evo/drill-scenarios.js`. Do not invent a drill variant or sprint setting when it is not registered.

2. **Write the dossier.** Run the inspection with a named champion and no more than four workers:

    ```bash
    npm run inspect -- --champions <champion-dir> --name <champion-name> --drill <drill> \
      --seed <seed> --trials 32 --trace-trials 4 --workers 4 --out .sim/inspect/<case>
    ```

    The output contains `ablation.md`, `weights.md`, `summary.md`, and one `trace-<trial>.jsonl` per traced trial. The `.sim` output is scratch evidence, not a deliverable.

3. **Read outcomes before weights.** Start with `ablation.md`: compare the intact win share with each silenced hidden unit, its paired flips, and `mcnemarP`. Then read `summary.md` and the traces to see when the prey is visible, which inputs are active, and how `THRUST`, `TURN` and `BITE` change. Read `weights.md` to connect those activations to `wIn`, `wRec`, `wOut` and `wSkip`. A large weight alone does not show that a path is active or causal.

4. **State one falsifiable claim.** Name the champion, drill, seed and trials; the unit or input path; the output it should change; and the expected direction. For a skip-path claim, use the active pooled input and its `wSkip` coefficient together. For a hidden-path claim, use the unit trace and its outgoing weights.

5. **Test the claim on matched trials.** Put one or more supported operations in an edits JSON file. For example, silence one unit:

    ```json
    [{ "op": "silence", "unit": 7 }]
    ```

    Or set a single skip weight to zero:

    ```json
    [{ "op": "set", "block": "wSkip", "row": 12, "col": 0, "value": 0 }]
    ```

    Replay with the same champion, drill, seed and trial count, adding `--edit <edits.json>` and a new `--out` directory. `edit.md` reports the edit and the `compareTrials` row against the intact trials. Do not compare runs with different seeds or staging.

6. **Report the result accurately.** Include the intact and edited win shares, `change`, both flip lists and `mcnemarP`. A claim is supported only when the paired change is in the predicted direction; describe the p-value as evidence strength, not proof. Report an unchanged or opposite result as unconfirmed. Do not infer causation from weight size or a single trace.

7. **Record verified findings.** Add a dated `### YYYY-MM-DD - <topic>` entry to `docs/notes/<YYYY-MM>.md` and run `node scripts/notes-index.mjs --write`. Include the champion, drill, seed, trial count, claim, edit or ablation, and the complete relevant `compareTrials` row. State unavailable drills or staging settings as unknown instead of substituting another scenario.

## Constraints

- `js/evo/` stays DOM-free and deterministic; it uses the simulation RNG, never wall-clock time or `Math.random`.
- `js/evo/drill-trace.js` is read-only. Use the dossier's `onTick` trace hook for per-tick brain state.
- Use at most four workers. Training runs share the machine.
- Never copy an edited genome into `.sim/champions/`, `public/champions/` or the archive.
- The diagnostic informs **A real chase**, the hunt scene in `docs/principles.md`; it does not change that scene's rules or selection metrics.
