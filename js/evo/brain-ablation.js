// Runs matched intact and edited drill trials and measures paired outcome changes.

import { brainLayout } from '../sim/brain-layout.js';
import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { applyEdits, silenceHook } from './brain-edit.js';
import { playTrial, viewOf } from './memory-probe-run.js';

/**
 * Runs a drill's exact seeded trials intact or with one hidden unit silenced.
 * @param {{subject: import('./memory-probe-run.js').Subject, drill: import('./drill-staging.js').Drill,
 *   unit: number | null, seed: number, trials: number, config?: Record<string, any>}} options the subject, drill and replay settings
 * @returns {Array<{trial: number, ticks: number, won: boolean, trace: Record<string, any> | null}>} the paired trial results
 */
export function ablateUnit({ subject, drill, unit, seed, trials, config = {} }) {
    return replayTrials({ subject, drill, unit, edits: null, seed, trials, config });
}

/**
 * Runs a drill's exact seeded trials with arbitrary in-memory edits.
 * @param {{subject: import('./memory-probe-run.js').Subject, drill: import('./drill-staging.js').Drill,
 *   edits: Array<Record<string, any>>, seed: number, trials: number, config?: Record<string, any>}} options the replay data
 * @returns {Array<{trial: number, ticks: number, won: boolean, trace: Record<string, any> | null}>} edited outcomes
 */
export function editTrials({ subject, drill, edits, seed, trials, config = {} }) {
    return replayTrials({ subject, drill, unit: null, edits, seed, trials, config });
}

/**
 * Replays one drill stream with either a unit silence or an arbitrary edit list.
 * @param {{subject: import('./memory-probe-run.js').Subject, drill: import('./drill-staging.js').Drill,
 *   unit: number | null, edits: Array<Record<string, any>> | null, seed: number, trials: number,
 *   config: Record<string, any>}} run replay settings
 * @returns {Array<{trial: number, ticks: number, won: boolean, trace: Record<string, any> | null}>} the trial rows
 */
function replayTrials({ subject, drill, unit, edits, seed, trials, config }) {
    checkTrialCount(trials);
    const arena = { ...config, ...drill.arena };
    const staged = { ...subject, spec: subject.spec ?? drill.spec };
    const base = createConfig(arena);
    const weights = editedWeights(staged, brainLayout(base), unit, edits);
    const edited = weights === staged.weights ? staged : { ...staged, weights };
    const silenced =
        edits?.filter((edit) => edit.op === 'silence').map((edit) => edit.unit) ?? (unit === null ? [] : [unit]);
    const hook = silenced.length === 0 ? undefined : silenceHook(silenced);
    const view = viewOf(staged, base);
    const rng = fork(createRng(seed), `drill:${drill.name}`);
    return Array.from({ length: trials }, (_, trial) =>
        playOne({ drill, subject: edited, seed, trial, arena, view, rng, hook }),
    );
}

/**
 * Applies edits once, before any matched world starts.
 * @param {import('./memory-probe-run.js').Subject} subject the subject
 * @param {Readonly<Record<string, any>>} layout the brain layout
 * @param {number | null} unit an optional unit to silence
 * @param {Array<Record<string, any>> | null} edits optional edit operations
 * @returns {Float32Array | null} the row to use for the replay
 */
function editedWeights(subject, layout, unit, edits) {
    if (unit === null && edits === null) {
        return subject.weights;
    }
    if (subject.weights === null) {
        throw new RangeError('brain ablation: a genome weight row is required for edits');
    }
    const operations = edits ?? [{ op: 'silence', unit }];
    return applyEdits(subject.weights, layout, operations);
}

/**
 * Runs one trial and records its result and elapsed simulation ticks.
 * @param {Record<string, any>} data the drill, subject and replay context
 * @returns {{trial: number, ticks: number, won: boolean, trace: Record<string, any> | null}} its result
 */
function playOne({ drill, subject, seed, trial, arena, view, rng, hook }) {
    const plan = drill.plan(rng, view);
    let ticks = 0;
    const won = playTrial({
        plan,
        subject,
        controlSpec: { name: 'intact' },
        seed: seed + trial,
        config: arena,
        onTick(world, slots) {
            ticks += 1;
            hook?.(world, slots);
        },
    });
    return { trial, ticks, won, trace: plan.trace?.(won) ?? null };
}

/**
 * Requires at least one trial.
 * @param {number} trials requested count
 * @returns {void}
 */
function checkTrialCount(trials) {
    if (!Number.isInteger(trials) || trials < 1) {
        throw new RangeError(`ablateUnit: trials must be a positive integer, got ${trials}`);
    }
}

/**
 * Compares two equal-length paired trial result arrays.
 * @param {Array<{won: boolean}>} before intact trial results
 * @param {Array<{won: boolean}>} after edited trial results
 * @returns {Record<string, any>} win shares, paired flips and the exact McNemar p value
 * @throws {RangeError} when paired result lengths differ
 */
export function compareTrials(before, after) {
    if (before.length !== after.length) {
        throw new RangeError(`compareTrials: paired result lengths differ (${before.length} and ${after.length})`);
    }
    const beforeOnly = [];
    const afterOnly = [];
    let beforeWins = 0;
    let afterWins = 0;
    for (let trial = 0; trial < before.length; trial++) {
        beforeWins += Number(before[trial].won);
        afterWins += Number(after[trial].won);
        if (before[trial].won && !after[trial].won) {
            beforeOnly.push(trial);
        } else if (!before[trial].won && after[trial].won) {
            afterOnly.push(trial);
        }
    }
    const trials = before.length;
    const beforeWinShare = trials === 0 ? 0 : beforeWins / trials;
    const afterWinShare = trials === 0 ? 0 : afterWins / trials;
    return {
        trials,
        beforeWins,
        afterWins,
        beforeWinShare,
        afterWinShare,
        change: afterWinShare - beforeWinShare,
        beforeOnly,
        afterOnly,
        mcnemarP: mcnemarP(beforeOnly.length, afterOnly.length),
    };
}

/**
 * Computes the exact two-sided McNemar p value for discordant paired outcomes.
 * @param {number} beforeOnly trials won only before the edit
 * @param {number} afterOnly trials won only after the edit
 * @returns {number} exact two-sided binomial p value
 */
export function mcnemarP(beforeOnly, afterOnly) {
    const flips = beforeOnly + afterOnly;
    if (flips === 0) {
        return 1;
    }
    const tail = Math.min(beforeOnly, afterOnly);
    let probability = 1;
    for (let i = 0; i < flips; i++) {
        probability *= 0.5;
    }
    let cumulative = probability;
    for (let k = 1; k <= tail; k++) {
        probability *= (flips - k + 1) / k;
        cumulative += probability;
    }
    return Math.min(1, 2 * cumulative);
}
