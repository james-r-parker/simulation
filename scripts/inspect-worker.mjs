// Runs one brain inspection job in a worker: an intact score, one unit ablation, a trace or an edited replay.

import { isMainThread } from 'node:worker_threads';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { ablateUnit } from '../js/evo/brain-ablation.js';
import { applyEdits, silenceHook } from '../js/evo/brain-edit.js';
import { createTraceRecorder } from '../js/evo/brain-trace.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { createRng, fork } from '../js/sim/rng.js';
import { playTrial, viewOf } from '../js/evo/memory-probe-run.js';
import { serveTasks } from './lib/worker-pool.mjs';

/**
 * Dispatches one inspection job.
 * @param {Record<string, any>} task the job and its replay data
 * @returns {Record<string, any>} the job result
 */
export function runInspectTask(task) {
    const drill = DRILLS.find((item) => item.name === task.drill);
    if (drill === undefined) {
        throw new Error(`inspect: unknown drill "${task.drill}"`);
    }
    if (task.kind === 'ablation') {
        return { unit: task.unit, trials: ablateUnit({ ...task, drill }) };
    }
    if (task.kind === 'trace') {
        return traceTrial({ ...task, drill });
    }
    if (task.kind === 'edit') {
        return editTrials({ ...task, drill });
    }
    throw new Error(`inspect: unknown task kind "${task.kind}"`);
}

/**
 * Records one intact trial at the selected position in the drill's seeded sequence.
 * @param {Record<string, any>} task the subject and replay settings
 * @returns {Record<string, any>} the brain trace and drill trace fields
 */
function traceTrial({ subject, drill, seed, trial, config }) {
    const { arena, staged, base, plan } = taskPlan({ subject, drill, seed, trial, config });
    const layout = brainLayout(base);
    const recorder = createTraceRecorder({
        maxTicks: plan.maxTicks,
        inputCount: layout.inputCount,
        hidden: layout.hidden,
    });
    const won = playTrial({
        plan,
        subject: staged,
        controlSpec: { name: 'intact' },
        seed: seed + trial,
        config: arena,
        onTick: recorder.onTick,
    });
    return { trial, won, trace: recorder.finish(won), drillTrace: plan.trace?.(won) ?? null };
}

/**
 * Replays arbitrary edits over the same plans and world seeds as the intact run.
 * @param {Record<string, any>} task the subject, edits and replay settings
 * @returns {{trials: Array<{trial: number, won: boolean, trace: Record<string, any> | null}>}} edited results
 */
function editTrials({ subject, drill, seed, trials, config, edits }) {
    const { arena, staged, base, view, rng } = replayContext({ subject, drill, seed, config });
    const edited = { ...staged, weights: applyEdits(staged.weights, brainLayout(base), edits) };
    const silenced = edits.filter((edit) => edit.op === 'silence').map((edit) => edit.unit);
    const hook = silenced.length === 0 ? undefined : silenceHook(silenced);
    const results = [];
    for (let trial = 0; trial < trials; trial++) {
        const plan = drill.plan(rng, view);
        let ticks = 0;
        const won = playTrial({
            plan,
            subject: edited,
            controlSpec: { name: 'intact' },
            seed: seed + trial,
            config: arena,
            onTick(world, slots, tick) {
                ticks += 1;
                hook?.(world, slots, tick);
            },
        });
        results.push({ trial, ticks, won, trace: plan.trace?.(won) ?? null });
    }
    return { trials: results };
}

/**
 * Builds the arena, subject and drill plan at the requested trial index.
 * @param {Record<string, any>} task the subject and replay settings
 * @returns {Record<string, any>} normalized trial state
 */
function taskPlan({ subject, drill, seed, trial, config }) {
    const context = replayContext({ subject, drill, seed, config });
    let plan = null;
    for (let index = 0; index <= trial; index++) {
        plan = drill.plan(context.rng, context.view);
    }
    return { ...context, plan };
}

/**
 * Builds the effective config, staged subject, view and drill stream.
 * @param {Record<string, any>} task the subject and replay settings
 * @returns {Record<string, any>} shared state for drill trial generation
 */
function replayContext({ subject, drill, seed, config }) {
    const arena = { ...config, ...drill.arena };
    const staged = { ...subject, spec: subject.spec ?? drill.spec };
    const base = createConfig(arena);
    const view = viewOf(staged, base);
    const rng = fork(createRng(seed), `drill:${drill.name}`);
    return { arena, staged, base, view, rng };
}

if (!isMainThread) {
    serveTasks(runInspectTask);
}
