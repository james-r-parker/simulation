// reads: evals/fair-chase/control.json, evals/fair-chase/courser.json, evals/fair-chase/even.json, evals/fair-chase/long.json, evals/fair-chase/stalker.json
// The Phase 1 cross-check of docs/designs/role-budget.md ("Cross-check against the sim"): the hunter budget against the
// scripted chase of audit:chase, over the defaults and the five arms of evals/fair-chase/.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { DISTANCE_SHARES, FAIR_BAND, playPair } from '../../js/evo/chase-envelope.js';
import { budgetChase } from '../../js/evo/role-budget-chase.js';
import { chaseCells, kinematicRows } from '../../js/evo/role-budget-check.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';
import { roleParams } from '../../js/evo/role-budget-params.js';

const ARMS = ['control', 'courser', 'even', 'long', 'stalker'];
const arm = (/** @type {string} */ name) => JSON.parse(readFileSync(`evals/fair-chase/${name}.json`, 'utf8'));
const configs = [['defaults', arenaConfig()], ...ARMS.map((name) => [name, arenaConfig(arm(name))])];
const pair = { hunter: 'predator', prey: 'forager' };
/** Each scene is played once however many tests read it. */
const memo = /** @type {Map<string, any>} */ (new Map());
const once = (/** @type {string} */ key, /** @type {() => any} */ make) => {
    if (!memo.has(key)) {
        memo.set(key, make());
    }
    return memo.get(key);
};
const cellsOf = (/** @type {string} */ name, /** @type {any} */ config, /** @type {boolean} */ straight) =>
    once(`cells:${name}:${straight}`, () => chaseCells(config, { ...pair, straight }));
const oracleOf = (/** @type {string} */ name, /** @type {any} */ config) =>
    once(`oracle:${name}`, () => playPair(config, { pursuer: 1, evader: 0 }, { trials: 2, seed: 1, straight: false }));
// the slow scenes of 6 configs: each test plays at most a minute of them
vi.setConfig({ testTimeout: 300_000 });

/** @param {number} share a catch share @returns {boolean} whether it is inside the fair band of `audit:chase` */
const inBand = (share) => share >= FAIR_BAND.low && share <= FAIR_BAND.high;

/** The share of cells in which the hunter killed, per start distance, by `kills`. */
const byDistance = (/** @type {any[]} */ cells, /** @type {'formula' | 'sim'} */ side) =>
    DISTANCE_SHARES.map((_, d) => {
        const row = cells.filter((c) => c.distance === DISTANCE_SHARES[d] * 400);
        return row.filter((c) => c[side] !== null).length / row.length;
    });

describe('the kinematics against the body table', () => {
    it.each(configs)('%s: no speed, turn radius or energy reading outside its tolerance', (_, config) => {
        expect(kinematicRows(/** @type {any} */ (config)).filter((r) => r.drift)).toEqual([]);
    });
});

describe('the straight bound against the straight oracle', () => {
    it.each(configs)(
        '%s: never says impossible where the oracle catches, and kills within 2 ticks',
        (/** @type {any} */ name, /** @type {any} */ config) => {
            const cells = cellsOf(/** @type {string} */ (name), config, true);
            expect(cells.filter((/** @type {any} */ c) => c.drift)).toEqual([]);
            expect(cells.filter((/** @type {any} */ c) => c.sim !== null && c.formula === null && !c.edge)).toEqual([]);
        },
    );
});

describe('the broken bound against the breaking oracle', () => {
    it.each(configs)(
        '%s: the fair band by start distance agrees, away from the view edge',
        (/** @type {any} */ name, /** @type {any} */ config) => {
            const cells = cellsOf(/** @type {string} */ (name), config, false);
            expect(cells.filter((/** @type {any} */ c) => c.drift)).toEqual([]);
            const formula = byDistance(cells, 'formula');
            const sim = byDistance(cells, 'sim');
            // the last start distance sits at the hunter's view, where the sprint gate is a float coin toss
            for (let d = 0; d < DISTANCE_SHARES.length - 1; d++) {
                expect(inBand(formula[d])).toBe(inBand(sim[d]));
            }
        },
    );

    it('agrees in sign with the catch share of audit:chase (2 trials a cell, jittered start): none where the formula kills nowhere, and the reverse', () => {
        for (const [name, config] of configs) {
            const formula = byDistance(cellsOf(/** @type {string} */ (name), config, false), 'formula');
            const { byDistance: shares } = oracleOf(/** @type {string} */ (name), config);
            for (let d = 0; d < DISTANCE_SHARES.length - 1; d++) {
                if (formula[d] === 0) {
                    expect(shares[d], `${name} at ${DISTANCE_SHARES[d]}`).toBeLessThanOrEqual(0.25);
                }
                if (shares[d] === 0) {
                    expect(formula[d], `${name} at ${DISTANCE_SHARES[d]}`).toBeLessThanOrEqual(0.25);
                }
            }
        }
    });
});

describe('the margin against the catch share over the arms', () => {
    it('ranks the arms as the oracle does, inside the 0.2 an audit share of 2 trials a cell can move by', () => {
        const rows = configs.map(([name, config]) => {
            const c = /** @type {any} */ (config);
            const budget = budgetChase(roleParams(c, 'predator'), roleParams(c, 'forager'), MODEL_DEFAULTS);
            const { byDistance: shares } = oracleOf(/** @type {string} */ (name), c);
            const share =
                shares.slice(0, -1).reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / 4;
            return { name, margin: budget.catchMargin, bearings: budget.bearings?.share ?? 0, share };
        });
        for (const a of rows) {
            for (const b of rows) {
                if (a.bearings > b.bearings + 0.25 || (a.margin >= 0 && b.margin < 0)) {
                    expect(a.share + 0.2, `${a.name} over ${b.name}`).toBeGreaterThanOrEqual(b.share);
                }
            }
        }
    });
});
