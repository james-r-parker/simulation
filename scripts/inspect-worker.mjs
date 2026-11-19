// Runs one brain inspection job in a worker: an intact score, one unit ablation, a trace or an edited replay.

import { isMainThread } from 'node:worker_threads';
import { DRILLS } from '../js/evo/drill-scenarios.js';
import { ablateUnit, editTrials } from '../js/evo/brain-ablation.js';
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
        return {
            unit: task.unit,
            trials: ablateUnit({
                subject: task.subject,
                drill,
                unit: task.unit,
                seed: task.seed,
                trials: task.trials,
                config: task.config,
            }),
        };
    }
    if (task.kind === 'trace') {
        return traceTrial({ ...task, drill });
    }
    if (task.kind === 'edit') {
        return {
            trials: editTrials({
                subject: task.subject,
                drill,
                edits: task.edits,
                seed: task.seed,
                trials: task.trials,
                config: task.config,
            }),
        };
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
