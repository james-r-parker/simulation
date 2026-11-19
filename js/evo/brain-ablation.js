// Runs matched intact and edited drill trials and measures paired outcome changes.

import { brainLayout } from '../sim/brain-layout.js';
import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { applyEdits, silenceHook } from './brain-edit.js';
import { playTrial, viewOf } from './memory-probe-run.js';

/**
 * Runs a drill's exact seeded trials intact or with one hidden unit silenced.
 * @param {{subject: Record<string, any>, drill: Record<string, any>, unit: number | null, seed: number, trials: number,
 *   config?: Record<string, any>}} options the subject, drill and replay settings
 * @returns {Array<{trial: number, won: boolean, trace: Record<string, any> | null}>} the paired trial results
 */
export function ablateUnit({ subject, drill, unit, seed, trials, config = {} }) {
    if (!Number.isInteger(trials) || trials < 1) {
        throw new RangeError(`ablateUnit: trials must be a positive integer, got ${trials}`);
    }
    const arena = { ...config, ...drill.arena };
    const staged = { ...subject, spec: subject.spec ?? drill.spec };
    const base = createConfig(arena);
    const view = viewOf(staged, base);
    const rng = fork(createRng(seed), `drill:${drill.name}`);
    const edited =
        unit === null
            ? staged
            : { ...staged, weights: applyEdits(staged.weights, brainLayout(base), [{ op: 'silence', unit }]) };
    const hook = unit === null ? undefined : silenceHook([unit]);
    return Array.from({ length: trials }, (_, trial) => {
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
        return { trial, ticks, won, trace: plan.trace?.(won) ?? null };
    });
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
