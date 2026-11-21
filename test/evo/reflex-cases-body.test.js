import { describe, expect, it } from 'vitest';
import { BODY_INPUT, CH_PREY, CH_THREAT, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { reflexBars } from '../../js/evo/reflex-bars.js';
import { BODY_CASES } from '../../js/evo/reflex-cases-body.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { evalReflex } from '../../js/evo/reflex-eval.js';
import { roleReference } from '../../js/evo/reflex-references-roles.js';
import { constantBrains, referenceFor, reflexRandomBrains } from '../../js/evo/reflex-score.js';
import { SEQUENCE_TICKS } from '../../js/evo/reflex-stage.js';
import { RAY_LANES, buildCaseTable } from '../../js/evo/reflex-table.js';

const { rayCount } = createConfig();
const BODY = rayCount * RAY_CHANNELS;
const BARS = reflexBars(createConfig());
const out = (/** @type {Record<string, number>} */ o) => ({ thrust: 0, turn: 0, sprint: 0, bite: 0, alarm: 0, ...o });
const staging = (/** @type {string} */ kind, bearing = 0) => /** @type {any} */ ({ kind, bearing });
const byName = (/** @type {string} */ name) => caseNamed(name);

/**
 * @param {import('../../js/evo/reflex-table.js').CaseTable} table a table
 * @param {number} sequence a sequence index
 * @returns {{row: Float32Array, lane: (name: string, k: number) => number}} the first tick's raw row and a reader of its lanes
 */
function tickOf(table, sequence) {
    const at = sequence * SEQUENCE_TICKS * table.rawInputCount;
    const rayAt = sequence * SEQUENCE_TICKS * RAY_LANES.length * rayCount;
    return {
        row: table.rows.subarray(at, at + table.rawInputCount),
        lane: (name, k) => table.rays[rayAt + RAY_LANES.indexOf(/** @type {any} */ (name)) * rayCount + k],
    };
}

/**
 * @param {Float32Array} row a raw row
 * @param {number} channel a ray channel offset
 * @returns {number[]} the rays that carry it
 */
const raysWith = (row, channel) =>
    Array.from({ length: rayCount }, (_, k) => k).filter((k) => row[k * RAY_CHANNELS + channel] > 0);

describe('BODY_CASES', () => {
    it('are the four cases of T21a, one for each spec that faces them, frozen and in ROLE_CASES', () => {
        expect(BODY_CASES.map((c) => [c.name, c.spec])).toEqual([
            ['pick-the-weak', 1],
            ['flee-what-closes', 0],
            ['flee-what-closes:reproducer', 2],
            ['flee-what-closes:scout', 3],
            ['mind-the-numbers', 1],
            ['answer-the-call', 1],
        ]);
        expect(Object.isFrozen(BODY_CASES)).toBe(true);
        for (const c of BODY_CASES) {
            expect(byName(c.name)).toBe(c);
        }
    });
});

describe('pick-the-weak', () => {
    it('shows two prey, the smaller and slower one on the side of the bearing, in both orientations', () => {
        const table = buildCaseTable(byName('pick-the-weak'), { trials: 6 });
        expect(table.sequences.some(({ staging: s }) => s.mirror === -1)).toBe(true);
        table.sequences.forEach(({ staging: s }, sequence) => {
            const { row, lane } = tickOf(table, sequence);
            const rays = raysWith(row, CH_PREY);
            expect(rays).toHaveLength(2);
            const side = (/** @type {number} */ k) => (k <= rayCount / 2 ? 1 : -1);
            const weak = rays.find((k) => side(k) === Math.sign(s.bearing));
            const strong = rays.find((k) => side(k) !== Math.sign(s.bearing));
            expect(lane('raySize', /** @type {number} */ (weak))).toBeLessThan(
                lane('raySize', /** @type {number} */ (strong)),
            );
            expect(lane('raySpeed', /** @type {number} */ (weak))).toBeLessThan(
                lane('raySpeed', /** @type {number} */ (strong)),
            );
        });
    });

    it('passes a turn towards the weaker only, so a constant turn does not', () => {
        const { check } = byName('pick-the-weak');
        const s = staging('pair', 0.4);
        expect(check(out({ turn: 1 }), s)).toBe(true);
        expect(check(out({ turn: -1 }), s)).toBe(false);
        expect(check(out({ turn: 0 }), s)).toBe(false);
        expect(check(out({ turn: -1 }), staging('pair', -0.4))).toBe(true);
    });
});

describe('flee-what-closes', () => {
    for (const name of ['flee-what-closes', 'flee-what-closes:reproducer', 'flee-what-closes:scout']) {
        it(`${name}: the threat closes in the first row and leaves in the second, one threat on one ray`, () => {
            const table = buildCaseTable(byName(name), { trials: 4 });
            table.sequences.forEach(({ staging: s }, sequence) => {
                const { row, lane } = tickOf(table, sequence);
                const rays = raysWith(row, CH_THREAT);
                expect(rays).toHaveLength(1);
                const closing = lane('rayClosing', rays[0]);
                expect(s.kind === 'closing' ? closing > 0 : closing < 0).toBe(true);
            });
            expect(table.sequences.map(({ staging: s }) => s.kind).slice(0, 4)).toEqual([
                'closing',
                'leaving',
                'closing',
                'leaving',
            ]);
        });
    }

    it('passes thrust and a turn away while the threat closes, and no thrust while it leaves', () => {
        const { check } = byName('flee-what-closes');
        const closing = staging('closing', 0.4);
        expect(check(out({ thrust: 1, turn: -1 }), closing)).toBe(true);
        expect(check(out({ thrust: 1, turn: 1 }), closing)).toBe(false);
        expect(check(out({ thrust: 0, turn: -1 }), closing)).toBe(false);
        expect(check(out({ thrust: 0 }), staging('leaving', 0.4))).toBe(true);
        expect(check(out({ thrust: 1 }), staging('leaving', 0.4))).toBe(false);
        expect(BARS.role.turnAway.scout).toBeGreaterThan(0);
    });
});

describe('mind-the-numbers', () => {
    it('shows one prey, then prey in about half the view with threats on rays of their own', () => {
        const table = buildCaseTable(byName('mind-the-numbers'), { trials: 4 });
        table.sequences.forEach(({ staging: s }, sequence) => {
            const { row } = tickOf(table, sequence);
            const prey = raysWith(row, CH_PREY);
            const threats = raysWith(row, CH_THREAT);
            if (s.kind === 'lone') {
                expect([prey.length, threats.length]).toEqual([1, 0]);
            } else {
                expect(prey.length).toBeGreaterThanOrEqual(rayCount / 2 - 1);
                expect(threats.length).toBeGreaterThan(0);
                expect(prey.filter((k) => threats.includes(k))).toEqual([]);
            }
        });
    });

    it('passes a sprint on the lone prey and a held sprint in the crowd, so the rows must differ', () => {
        const { check } = byName('mind-the-numbers');
        expect(check(out({ sprint: 1 }), staging('lone'))).toBe(true);
        expect(check(out({ sprint: 0 }), staging('lone'))).toBe(false);
        expect(check(out({ sprint: 0 }), staging('crowd'))).toBe(true);
        expect(check(out({ sprint: 1 }), staging('crowd'))).toBe(false);
        expect(BARS.role.sprint.mid).toBeGreaterThan(BARS.role.sprint.far);
    });
});

describe('answer-the-call', () => {
    it('stages a loud hunt call from a bearing, no alarm and nothing in view', () => {
        const table = buildCaseTable(byName('answer-the-call'), { trials: 4 });
        table.sequences.forEach(({ staging: s }, sequence) => {
            const { row } = tickOf(table, sequence);
            expect(row[BODY + BODY_INPUT.HEARD_HUNT]).toBe(1);
            expect(Math.sign(row[BODY + BODY_INPUT.HEARD_HUNT + 2])).toBe(Math.sign(s.bearing));
            expect(row[BODY + BODY_INPUT.HEARD_ALARM]).toBe(0);
            expect(raysWith(row, CH_PREY)).toEqual([]);
            expect(raysWith(row, CH_THREAT)).toEqual([]);
        });
    });

    it('passes a turn to the call with thrust, and not a turn from it or standing', () => {
        const { check } = byName('answer-the-call');
        const s = staging('hunt', 1);
        expect(check(out({ turn: 1, thrust: 1 }), s)).toBe(true);
        expect(check(out({ turn: -1, thrust: 1 }), s)).toBe(false);
        expect(check(out({ turn: 1, thrust: 0 }), s)).toBe(false);
    });
});

describe('each body case is valid on seed 1', () => {
    for (const reflexCase of BODY_CASES) {
        it(`${reflexCase.name}: the reference passes, constant brains and a sample of random brains do not`, () => {
            const table = buildCaseTable(reflexCase, { seed: 1, trials: 16 });
            const random = reflexRandomBrains(reflexCase).slice(0, 8);
            const constants = constantBrains();
            const results = evalReflex([referenceFor(reflexCase), ...constants, ...random], [table]);
            const [reference, ...others] = results.map((r) => r[reflexCase.name].passShare);
            expect(reference).toBe(1);
            expect(Math.max(...others.slice(0, constants.length))).toBeLessThanOrEqual(0.5);
            expect(others.slice(constants.length).reduce((a, b) => a + b, 0) / random.length).toBeLessThanOrEqual(0.5);
        });
    }

    it('a reference that ignores what the case is about fails it', () => {
        const fails = (/** @type {string} */ reference, /** @type {string} */ name) => {
            const table = buildCaseTable(byName(name), { trials: 16 });
            return evalReflex([roleReference(reference)], [table])[0][name].passShare;
        };
        expect(fails('sprint-on-prey', 'mind-the-numbers')).toBe(0);
        expect(fails('turn-to-alarm', 'answer-the-call')).toBe(0);
        expect(fails('flee-what-closes', 'pick-the-weak')).toBe(0);
        expect(fails('flee-on-alarm', 'flee-what-closes')).toBe(0);
    });
});
