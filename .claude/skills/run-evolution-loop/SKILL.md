---
name: run-evolution-loop
description: Use when an evolution or performance change needs measuring - after changing fitness, selection, mutation, the archive, sensors, brains or the trainer, when asked "did that make it better", "run the evals", "compare against the baseline", "why did fitness move", or before marking a phase with Targets as built. Also use to propose re-ranking the Build queue from results.
---

# run-evolution-loop

> Note: `npm run eval`, `eval:compare`, `evals/experiments.json` and `npm run bench` exist. The anti-exploit suite and
> `npm run league` arrive with `evolution-evals.md` Phases 3 and 4.

## Overview

One cycle: hypothesise, run, check the eval, record, act, measure, rebaseline. `evals/experiments.json` is the only
record of what was tried and what it did.

**Core principle:** check the eval before blaming (or crediting) the simulation. Evolution is noisy: a change that
looks better on 2 seeds is usually seed luck, and a fitness score that jumped is often an exploit. A fix aimed at
noise or an exploit is wasted work.

## 1. Hypothesise

Before changing anything, add an entry to `evals/experiments.json` with:

- `id` (`E<n>`), `date`, `branch`
- `hypothesis`: what the change does and why it should help
- `prediction`: which metrics move, in which direction, and roughly by how much
- `targets`: the `**Targets:**` metric names from the design doc phase, if any
- `beforePolicy` and `afterPolicy`: the policy names; readers treat a missing one as `live`

Ids are `E<n>`, unique and increasing; `E0` is the calibration (below).

Write the prediction first. A prediction written after the result is not a prediction.

## 2. Run

- Never fewer than **8 seeds** per arm; the same seed list on both arms (`--seeds` takes a count from the fixed
  benchmark seed list, so two runs with the same count share seeds).
- Run both arms on the same machine, from builds that do not change during the run:

    ```bash
    git worktree add <scratch>/before origin/main
    (cd <scratch>/before && npm ci && npm run eval -- --seeds 8 --ticks 200000 --policy <beforePolicy> --out ../before.json)
    npm run eval -- --seeds 8 --ticks 200000 --policy <afterPolicy> --out <scratch>/after.json
    ```

- `bench.*` metrics: `npm run bench` on an otherwise idle machine; compare with `bench/baseline.json`.
- Do not run long evals while the user is using the machine for something else - ask first.

## 3. Check the eval

For every metric that moved:

1. **Noise.** `npm run eval:compare -- <before>.json <after>.json --targets <m,...> --fail-on-worse` reports a BCa
   bootstrap 95% interval and a verdict per metric, marks the targets and exits 1 if a target is `worse` (`--json`
   for the verdicts to record). `no-difference` means no difference - do not round it up to "slightly better". With
   about 25 metrics, one `better` or `worse` off the targets is expected by chance at 95% (see `E0`).
2. **Exploits.** A fitness jump without a matching move in `eval.food_energy_per_1k` or `eval.median_lifespan` is a
   suspected exploit. Replay the best agent (`npm run replay -- --policy <name> --seed <s> --ticks <t> --follow <genome-id>`) and
   watch what it actually does; spinning, wall-hugging and contact farming all score without eating.
3. **Unfair comparisons.** Different config hashes, seeds or tick counts between the arms make the comparison
   invalid; `eval:compare` refuses them (exit 2, `CompareRefused <field>`) - never force it. `--allow-config-diff
<key>` is for a change that is the config key itself; `--allow-seed-diff` is only for calibration.

## Calibration

`E0` in the ledger compares `baseline-v5` on seeds 1-8 with seeds 9-16 (`npm run eval -- --seed-offset 8`, then
`eval:compare --allow-seed-diff`); it must give no verdict on any Target metric. Rerun it when the metrics, the
bootstrap or the default config change, as a new entry.

## 4. Record

Fill in the experiment entry: `before` and `after` report paths, the per-metric verdicts, `effect` (`better`,
`worse`, `no-difference`, `exploit`), and a one-line `note`. The `conventions` gate checks the file against its
schema.

## 5. Act

| Result                                   | Do                                                                                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `better` on the targets, nothing `worse` | Keep the change; attach the compare output to the PR (`create-pr`, Measurements)               |
| `no-difference`                          | Revert unless the change is a simplification or a speed-up with no metric loss                 |
| `worse` on any target                    | Do not merge; record it and go back to the hypothesis                                          |
| `exploit`                                | Add the exploiting behaviour to the anti-exploit suite as a failing test, then fix the fitness |

## 6. Rebaseline

When a change lands on `main` and moves a baseline metric, regenerate the baseline it was compared with
(`evals/baselines/<name>.json`, `bench/baseline.json`) in a PR of its own, with the compare output in the body.
Rebaseline PRs wait for user approval.

## 7. Rank

When results show a planned phase would help more (or less) than its rank suggests, propose a re-rank: a PR that
rewrites the `**Priority:**` lines, with the evidence in the body. It waits for approval. A reason starting `pinned`
keeps its rank.

## Report

End each cycle with: the experiment id, the hypothesis, each target's verdict with its interval, exploits found, what
was kept or reverted, and what waits for approval.

## Red flags

- Fewer than 8 seeds, or different seeds on the two arms.
- A prediction written after the result.
- Calling `no-difference` an improvement.
- A fitness gain with no gain in food or lifespan, accepted without a replay.
- A baseline regenerated in the same PR as the change it judges.
- Comparing `bench.*` numbers recorded on different machines.
