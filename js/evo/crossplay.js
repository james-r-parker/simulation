// Cross-play (docs/designs/training-stages.md, Cross-play): a checkpoint's predator genome against another checkpoint's
// forager genome, both driven by their brains, in the staged arena of the `prey-ahead` drill. The matrix of kill shares
// tells an arms race (each side better against the other's past) from a cycle. A detector only: nothing here reaches
// fitness, merit, mate rank or archive rank. Pure: no files, no clock.

import { createConfig } from '../sim/config.js';
import { createRng, fork } from '../sim/rng.js';
import { wilsonInterval } from './binomial.js';
import { DRILLS } from './drill-scenarios.js';
import { GROUP_ARENA_RULES, TRIO, huntPlan } from './memory-probe-group.js';
import { playTrial, viewOf } from './memory-probe-run.js';
import { PREDATOR_SPEC } from './memory-probe-scenarios.js';

/** Trials per cell. */
export const CROSS_TRIALS = 64;
/** A newer side counts as worse than the older one when its share is worse by more than this. */
export const CYCLE_MARGIN = 0.1;
/** The seed of a cell's first trial; trial `t` runs on world seed `CROSS_SEED + t`, the same for every cell. */
export const CROSS_SEED = 1;

const PREY_AHEAD = /** @type {import('./drill-scenarios.js').Drill} */ (DRILLS.find((d) => d.name === 'prey-ahead'));

/**
 * @typedef {object} Player one checkpoint's champions
 * @property {import('./memory-probe-run.js').Subject} predator the predator genome
 * @property {import('./memory-probe-run.js').Subject} forager the forager genome
 */

/**
 * @typedef {object} CrossMatrix
 * @property {number} trials trials per cell
 * @property {(number | null)[][]} kills `kills[i][j]`: trials in which checkpoint `i`'s predator killed checkpoint `j`'s
 *   forager (null: not played yet)
 * @property {(number | null)[][]} packKills the same with three sibling clones of the predator and a prey one bite
 *   cannot kill
 */

/**
 * @param {number} [trials] trials per cell (default `CROSS_TRIALS`)
 * @returns {CrossMatrix} an empty matrix
 */
export function createMatrix(trials = CROSS_TRIALS) {
    return { trials, kills: [], packKills: [] };
}

/**
 * Plays one cell: `trials` seeded plans, the same for every cell, a predator subject against a forager opponent.
 * @param {Player['predator']} predator the predator
 * @param {Player['forager']} forager the forager
 * @param {{trials?: number, config?: Record<string, any>, group?: boolean}} [options] trials (default `CROSS_TRIALS`),
 *   the arena's config overrides, and whether to play the group cell (the trio against a prey one bite cannot kill)
 * @returns {number} the trials in which the forager died to the predator's own bite (the pack cell: died at all)
 */
export function playCell(predator, forager, options = {}) {
    const { trials = CROSS_TRIALS, config = {}, group = false } = options;
    const view = viewOf({ spec: PREDATOR_SPEC, weights: null }, createConfig(config));
    const opponent = /** @type {const} */ ({ role: 'prey', subject: forager });
    let kills = 0;
    for (let t = 0; t < trials; t++) {
        const seed = CROSS_SEED + t;
        const rng = fork(createRng(seed), 'crossplay');
        const plan = group ? huntPlan(rng, view, TRIO) : PREY_AHEAD.plan(rng, view);
        const arena = group ? { ...config, ...GROUP_ARENA_RULES } : config;
        const won = playTrial({
            plan,
            subject: predator,
            controlSpec: { name: 'intact' },
            seed,
            config: arena,
            opponent,
        });
        kills += won ? 1 : 0;
    }
    return kills;
}

/**
 * Plays checkpoint `index`'s row and column of the matrix: its predator against every forager up to its own, and every
 * earlier predator against its forager. The matrix grows to `index + 1` rows and columns; a cell already played is kept.
 * @param {CrossMatrix} matrix the matrix (updated)
 * @param {readonly Player[]} players the checkpoints' champions, oldest first
 * @param {{index: number, config?: Record<string, any>, group?: boolean, onCell?: (cell: {predator: number, forager: number, trials: number, kills: number}) => void}} at
 *   the checkpoint to play, the arena's config, whether to play the group cells too and a per-cell hook (the log)
 * @returns {CrossMatrix} the matrix
 */
export function extendMatrix(matrix, players, { index, config = {}, group = false, onCell }) {
    const fill = (/** @type {(number | null)[][]} */ table, /** @type {number} */ size) => {
        while (table.length < size) {
            table.push([]);
        }
        for (const row of table) {
            while (row.length < size) {
                row.push(null);
            }
        }
    };
    fill(matrix.kills, index + 1);
    fill(matrix.packKills, index + 1);
    const cells = [
        ...Array.from({ length: index + 1 }, (_, j) => [index, j]),
        ...Array.from({ length: index }, (_, i) => [i, index]),
    ];
    for (const [i, j] of cells) {
        for (const packed of group ? [false, true] : [false]) {
            const table = packed ? matrix.packKills : matrix.kills;
            if (table[i][j] === null) {
                const kills = playCell(players[i].predator, players[j].forager, {
                    trials: matrix.trials,
                    config,
                    group: packed,
                });
                table[i][j] = kills;
                onCell?.({ predator: i, forager: j, trials: matrix.trials, kills, ...(packed ? { group: true } : {}) });
            }
        }
    }
    return matrix;
}

/**
 * @typedef {object} Pooled
 * @property {number} kills pooled kills
 * @property {number} trials pooled trials
 */

/**
 * @param {CrossMatrix} matrix the matrix
 * @param {readonly number[]} rows predator checkpoints
 * @param {readonly number[]} cols forager checkpoints
 * @returns {Pooled} the kills and trials pooled over the cells
 */
export function pool(matrix, rows, cols) {
    let kills = 0;
    for (const i of rows) {
        for (const j of cols) {
            kills += /** @type {number} */ (matrix.kills[i][j]);
        }
    }
    return { kills, trials: rows.length * cols.length * matrix.trials };
}

/**
 * @param {number} n the count
 * @returns {number[]} `[0, 1, ... n - 1]`
 */
function upTo(n) {
    return Array.from({ length: n }, (_, i) => i);
}

/**
 * @param {Pooled} a pooled kills
 * @param {Pooled} b pooled kills
 * @returns {{difference: number, low: number}} `a`'s kill share minus `b`'s, and `a`'s Wilson low bound minus `b`'s Wilson
 *   high bound
 */
function shareGap(a, b) {
    return {
        difference: a.kills / a.trials - b.kills / b.trials,
        low: wilsonInterval(a.kills, a.trials).low - wilsonInterval(b.kills, b.trials).high,
    };
}

/**
 * The latest predators' mean kill share over all earlier forager columns, minus the first predators' over the same
 * columns, with the Wilson low bound of the difference over the pooled trials.
 * @param {CrossMatrix} matrix the matrix
 * @returns {{progress: number, low: number} | null} null under 2 checkpoints
 */
export function hunterProgress(matrix) {
    const n = matrix.kills.length;
    if (n < 2) {
        return null;
    }
    const cols = upTo(n - 1);
    const { difference, low } = shareGap(pool(matrix, [n - 1], cols), pool(matrix, [0], cols));
    return { progress: difference, low };
}

/**
 * The first foragers' mean kill share suffered over all earlier predator rows, minus the latest foragers' over the same
 * rows, with the low bound built the same way.
 * @param {CrossMatrix} matrix the matrix
 * @returns {{progress: number, low: number} | null} null under 2 checkpoints
 */
export function preyProgress(matrix) {
    const n = matrix.kills.length;
    if (n < 2) {
        return null;
    }
    const rows = upTo(n - 1);
    const { difference, low } = shareGap(pool(matrix, rows, [0]), pool(matrix, rows, [n - 1]));
    return { progress: difference, low };
}

/**
 * The low bound of how much less often the latest foragers die to a stage's hunters than that stage's own foragers did:
 * the Wilson low bound of the stage foragers' suffered share minus the high bound of the latest foragers'.
 * @param {Pooled} stage the stage's hunters against the stage's foragers
 * @param {Pooled} latest the stage's hunters against the latest foragers
 * @returns {number} the low bound; above 0 when the latest foragers survive better
 */
export function preyVsStageLow(stage, latest) {
    return shareGap(stage, latest).low;
}

/**
 * Of the pairs of adjacent checkpoints, the share in which the newer side does worse than the older side against the other
 * role's pooled past by more than `CYCLE_MARGIN`: the newer predators kill fewer of the earlier foragers than the older
 * predators did, or the newer foragers die more often to the earlier predators than the older foragers did.
 * @param {CrossMatrix} matrix the matrix
 * @returns {number | null} the share of such pairs; null under 2 checkpoints
 */
export function cycleShare(matrix) {
    const n = matrix.kills.length;
    if (n < 2) {
        return null;
    }
    let cycles = 0;
    for (let k = 0; k < n - 1; k++) {
        const past = upTo(k + 1);
        const share = (/** @type {Pooled} */ p) => p.kills / p.trials;
        const hunterWorse = share(pool(matrix, [k + 1], past)) < share(pool(matrix, [k], past)) - CYCLE_MARGIN;
        const preyWorse = share(pool(matrix, past, [k + 1])) > share(pool(matrix, past, [k])) + CYCLE_MARGIN;
        cycles += hunterWorse || preyWorse ? 1 : 0;
    }
    return cycles / (n - 1);
}

/**
 * @param {CrossMatrix} matrix the matrix
 * @returns {{hunterProgressLow: number | null, preyProgressLow: number | null, cycleShare: number | null}} the three
 *   numbers of the doc, as the gate reads them (`crossplay.<key>`)
 */
export function crossplayNumbers(matrix) {
    return {
        hunterProgressLow: hunterProgress(matrix)?.low ?? null,
        preyProgressLow: preyProgress(matrix)?.low ?? null,
        cycleShare: cycleShare(matrix),
    };
}
