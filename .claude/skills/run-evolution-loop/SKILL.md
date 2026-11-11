---
name: run-evolution-loop
description: Use when an evolution or performance change needs measuring - after changing fitness, selection, mutation, the archive, sensors, brains or the trainer, when asked "did that make it better", "run the evals", "compare against the baseline", "why did fitness move", or before marking a phase with Targets as built. Also use to propose re-ranking the Build queue from results.
---

# run-evolution-loop

> Note: `npm run eval`, `eval:compare`, `evals/experiments.json` and `npm run bench` exist. The anti-exploit suite and
> `npm run league` arrive with `evolution-evals.md` Phases 3 and 4.

## Overview

One cycle: check the detector, hypothesise, run, check the eval, turn the outcome into tasks, record, act, measure, rebaseline. `evals/experiments.json` is the only
record of what was tried and what it did.

**Core principle:** check the eval before blaming (or crediting) the simulation. Evolution is noisy: a change that
looks better on 2 seeds is usually seed luck, and a fitness score that jumped is often an exploit. A fix aimed at
noise or an exploit is wasted work.

## 0. Check the detector first

Before theorising about the sim, rule out the measure. Ask of every number that surprised you:

1. **Does it count what it claims?** A rate, a share and a count differ; a metric may include what the name leaves out.
2. **Is the fixture's premise true?** A drill, reflex case or scripted scene stands for a situation; check the situation
   exists (replay one trial and look).
3. **Does a pass on it predict the outcome it stands for?** A detector that scores 1.00 beside an outcome edge of 0.00,
   or that moves while the outcome does not, is not measuring the outcome.
4. **Is it `verified`, and at how many seeds?** `docs/designs/metrics.md` gives each metric's status and `minSeeds`. An
   `unverified` metric gets no `eval:compare` verdict; a claim on it needs its missing check fixed first, or the clip.

A detector fault becomes a task on the detector, and the sim theory waits until the detector is fixed and the run is
repeated. Three cases from 2026-11-07:

- The `prey-too-big` drill's prey was bitable (a forager's size is capped by its store), so a predator that never bit
  won it (fixed in #347).
- `catch_rate` rose 0.55 to 0.65 in T12 iteration 2 arm b while the `prey-ahead` drill edge stayed 0.00: it is a speed
  (kills per 1,000 hunter-ticks), so it rises with prey density whether or not the hunters got better.
- The reflex `approach-prey` scored 1.00 alongside a `prey-ahead` edge of 0.00: approaching is not catching.

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

- A Target with a 32-seed minimum (`eval.floor_episodes`, the lineage metrics, `eval.predator_share_cv`) runs **32 seeds**
  per arm; `npm run eval:power -- <report>` decides which metrics are watch-only, so run it on the report and do not
  claim a verdict on a metric it lists as watch-only.
- Every finalist also runs `npm run ladder`, so the skill ladder shows the change did not break deliberate behaviour.
- Screens (`npm run screen`) use 4 seeds and are not verdicts; a finalist runs the 16-seed arms above.
- Never fewer than **16 seeds** per arm (the `eval` default; `eval:compare` refuses fewer); the same seed list on both arms (`--seeds` takes a count from the fixed
  benchmark seed list, so two runs with the same count share seeds).
- Run both arms on the same machine, from builds that do not change during the run:

    ```bash
    git worktree add <scratch>/before origin/main
    (cd <scratch>/before && npm ci && npm run eval -- --seeds 16 --ticks 200000 --policy <beforePolicy> --out ../before.json)
    npm run eval -- --seeds 16 --ticks 200000 --policy <afterPolicy> --out <scratch>/after.json
    ```

- A policy arm other than `live` runs with `--policy <name>`. `map-elites-v6` is the `fitnessV6` candidate of
  [fitness-and-selection.md](fitness-and-selection.md); `LIVE_POLICY` stays `map-elites-v1q` until that doc's Phase 4
  decides. Compare it with `map-elites-v1q` on the same seeds.
- To vary the policy rather than the world, pass `policyOptions`: `npm run eval -- --policy map-elites-v6
--policy-options <file.json>`, or a `policyOptions` object on the `base` and on each arm of a screen grid
  (`npm run screen`; the arm's is laid over the base's, with `fitnessOverrides` merged weight by weight). The keys are
  `fitnessOverrides` (any `FITNESS_V6` weight), `descriptor` (`v1` or `v6`), `archiveShare` and `cloneShareEnd`; the
  last two also work on `map-elites-v1` and `v1q`. A bad key or value stops the run before any worker starts
  (`validatePolicyOptions`). The options are part of an arm's resume key and are stored in the report; an eval with
  options gets `-p<hash>` in its default output name. `eval:compare` accepts reports whose options differ and prints
  `policyOptions differ`, so read that line before calling a difference the treatment. `npm run replay` does not take
  policy options yet.
- `bench.*` metrics: `npm run bench` on an otherwise idle machine; compare with `bench/baseline.json`.
- Do not run long evals while the user is using the machine for something else - ask first.

## 3. Check the eval

For every metric that moved:

1. **Noise.** `npm run eval:compare -- <before>.json <after>.json --targets <m,...> --fail-on-worse` reports a BCa
   bootstrap 95% interval and a verdict per metric, marks the targets and exits 1 if a target is `worse` (`--json`
   for the verdicts to record). `no-difference` means no difference - do not round it up to "slightly better". A verdict needs the interval to
   exclude 0 and a mean change of at least 5% of the before mean (`--min-effect`, shown as the `effect` column), so a
   tiny but precise shift stays `no-difference`. A metric of unit `share` uses an absolute 0.02 instead
   (`--share-min-effect`); a metric with at least half its paired differences exactly 0 also needs an exact sign test
   under 0.05; a metric that is not `verified` prints `unverified`. Run at least the seeds the registry's `minSeeds`
   gives each target. With
   about 25 metrics, one `better` or `worse` off the targets is expected by chance at 95% (see `E0`).
2. **Exploits.** A fitness jump without a matching move in `eval.food_energy_per_1k` or `eval.median_lifespan` is a
   suspected exploit. Replay the best agent (`npm run replay -- --policy <name> --seed <s> --ticks <t> --follow <genome-id>`) and
   watch what it actually does; spinning, wall-hugging and contact farming all score without eating.
3. **Unfair comparisons.** Different config hashes, seeds or tick counts between the arms make the comparison
   invalid; `eval:compare` refuses them (exit 2, `CompareRefused <field>`) - never force it. `--allow-config-diff
<key>` is for a change that is the config key itself; `--allow-seed-diff` is only for calibration.

## Outcome to task

Every eval, screen, ladder, probe, long run, training, drill and reflex outcome ends with this record, written in the
doc of the work it judges before the next run starts. A finding that skips it does not become a task. The trainer's
own minimum evidence is in [training.md](../../../docs/designs/training.md), "From outcome to task".

0. **Detector.** Step 0 above passed, or its fault is the first task.
1. **Observation.** The detector numbers with the seeds, trials and arm that produced them. A number with no bar
   beside it (random brains, a memoryless reference, the baseline arm) is not an observation.
2. **Theory.** The mechanism that would explain it, as one sentence a fixture can falsify. How nature meets the same
   problem comes first ([principles.md](../../../docs/principles.md), "How the principles are used"), and the doc names
   the biology. A theory about what a brain does (never bites, always bites) is checked with a diagnostic before any run
   that depends on it.
3. **Principle check.** A table row per theory naming the scenes and selection rules it serves and each of these it must
   not break. One failed line refuses the theory.
    - Detector, not reward: no fitness, merit, archive-rank, offer-filter or mate-rank term pays for an act or for a
      detector score ("measure scenes, reward them almost never"; selection rule 9).
    - The hunt chain fails closed: a chase that never bites or a bite that bounces stays a failed gene (rule 6); nothing
      is rescued, restocked or pardoned (rules 1 and 4).
    - Senses stay local: the brain can sense what the lesson needs (a ray class, a body input), and no input is added
      to fit a task.
    - No scripted mode, no timer, no restocking, and no free action ("What to refuse").
    - The change is to the world a run happens in (a config, a curriculum stage), never to who breeds.
4. **Prediction and detector.** Written before the run: the detector (a drill, a reflex case, a curve metric or an
   `eval.*` metric), its direction and size, and the minimum evidence. A world-metric claim uses at least 16 seeds per
   arm and `eval:compare` (section 2). Every arm of a run, not only the headline arm, is judged on at least 3 seed
   offsets: two arms identical up to a point on one archive (a shared prefix stage and the same seeds) are one
   experiment until they diverge, and a single archive is a lead, never a verdict.
5. **Task rows.** Each surviving theory becomes `[judgement]` or `[mechanical]` rows in the doc's Task breakdown under a
   new phase, with a Chunks table. A diagnostic that tells two theories apart is a row before the run it gates. Code,
   runs and the final write-up are separate rows; a long run is never in a code chunk ([AGENTS.md](../../../AGENTS.md),
   "Delegating to subagents").

A refused theory is written into the doc's Decisions table with the line it failed and the reason, and never becomes a
task. The run's result closes the record: a final row records whether the prediction held and appends the next record's
tasks, so the loop continues from data.

## Calibration

Calibration compares `baseline-v5` on seeds 1-16 with seeds 17-32 (`npm run eval -- --seed-offset 16 --out
evals/baselines/baseline-v5-o16.json`, then `eval:compare --allow-seed-diff`); it must give no verdict on any Target metric. Rerun it when the metrics, the
bootstrap or the default config change, as a new entry.

## 4. Record

Fill in the experiment entry: `before` and `after` report paths, the per-metric verdicts, `effect` (`better`,
`worse`, `no-difference`, `exploit`), and a one-line `note`. The `conventions` gate checks the file against its
schema.

## 5. Act

| Result                                   | Do                                                                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `better` on the targets, nothing `worse` | Keep the change; attach the compare output to the PR (`create-pr`, Measurements)                                                                                                                                     |
| `no-difference`                          | Revert unless the change is a simplification, a speed-up with no metric loss, or a realistic mechanism whose `--keep-rule` output on 64 matched floor-on seeds reads no guard `WORSE` (principles.md, the keep rule) |
| `worse` on any target                    | Do not merge; record it and go back to the hypothesis                                                                                                                                                                |
| `exploit`                                | Add the exploiting behaviour to the anti-exploit suite as a failing test, then fix the fitness                                                                                                                       |

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

- Fewer than 16 seeds, fewer than a target's registry `minSeeds`, or different seeds on the two arms.
- A keep or delete decision on fewer than 64 matched floor-on seeds, or without `--keep-rule`. Read the smallest loss
  each guard prints: a guard that cannot see a loss of a quarter of the seeds has not shown no harm. A new brain input
  or a slower step is a cost and needs a scene metric to move. A kept mechanism keeps its switch until its bundle has
  been read once with it off, then the switch is deleted (`docs/principles.md`, the keep rule).
- A sim theory built on a number whose detector was never checked (step 0).
- An arm judged on a single archive or one seed offset.
- A prediction written after the result.
- Calling `no-difference` an improvement.
- A fitness gain with no gain in food or lifespan, accepted without a replay.
- A baseline regenerated in the same PR as the change it judges.
- Comparing `bench.*` numbers recorded on different machines.
