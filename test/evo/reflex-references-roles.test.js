import { describe, expect, it } from 'vitest';
import { BODY_INPUT, OUTPUT_COUNT, CH_MEGAFAUNA, CH_THREAT, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { ROLE_CASES } from '../../js/evo/reflex-cases-roles.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { createReflexWorld, evalReflex } from '../../js/evo/reflex-eval.js';
import { hasRoleReference, roleReference } from '../../js/evo/reflex-references-roles.js';
import { constantBrains, evalCase, referenceFor, reflexRandomBrains } from '../../js/evo/reflex-score.js';
import { SEQUENCE_TICKS } from '../../js/evo/reflex-stage.js';
import { buildCaseTable } from '../../js/evo/reflex-table.js';

const { rayCount } = createConfig();
const BODY = rayCount * RAY_CHANNELS;

/**
 * @param {import('../../js/evo/reflex-table.js').CaseTable} table a table
 * @param {number} sequence a sequence index
 * @param {number} tick a tick
 * @returns {Float32Array} that raw input row
 */
function rowOf(table, sequence, tick) {
    const at = (sequence * SEQUENCE_TICKS + tick) * table.rawInputCount;
    return table.rows.subarray(at, at + table.rawInputCount);
}

/**
 * @param {Float32Array} row a raw row
 * @param {number} channel a ray channel offset
 * @returns {number[]} the rays that carry it
 */
const raysWith = (row, channel) =>
    Array.from({ length: rayCount }, (_, k) => k).filter((k) => row[k * RAY_CHANNELS + channel] > 0);

describe('the table rows of the role cases', () => {
    it('carry the heard alarm as the sim writes it: loudness, and a side that follows the bearing', () => {
        for (const name of ['turn-to-alarm', 'flee-on-alarm']) {
            const table = buildCaseTable(caseNamed(name), { trials: 4 });
            table.sequences.forEach(({ staging }, sequence) => {
                const row = rowOf(table, sequence, 0);
                expect(row[BODY + BODY_INPUT.HEARD_ALARM]).toBe(1);
                expect(Math.sign(row[BODY + BODY_INPUT.HEARD_ALARM + 2])).toBe(Math.sign(staging.bearing));
                expect(row[BODY + BODY_INPUT.HEARD_ALARM + 1]).toBeCloseTo(Math.cos(staging.bearing), 5);
                expect(raysWith(row, CH_THREAT)).toEqual([]);
            });
        }
    });

    it('carry the herd animal on the megafauna channel of the forward ray, from the first tick to the last', () => {
        const table = buildCaseTable(caseNamed('clear-the-herd'), { trials: 4 });
        table.sequences.forEach(({ staging }, sequence) => {
            const side = Math.sign(staging.bearing);
            for (const tick of [0, SEQUENCE_TICKS - 1]) {
                const rays = raysWith(rowOf(table, sequence, tick), CH_MEGAFAUNA);
                expect(rays.length).toBeGreaterThan(0);
                const nearest = side > 0 ? rays[0] : rays[rays.length - 1];
                expect(side > 0 ? nearest <= rayCount / 4 : nearest >= (3 * rayCount) / 4).toBe(true);
            }
        });
    });

    it('carry the threat on one ray for the scout and nothing on the empty staging', () => {
        const table = buildCaseTable(caseNamed('call-on-threat'), { trials: 4 });
        table.sequences.forEach(({ staging }, sequence) => {
            const rays = raysWith(rowOf(table, sequence, 0), CH_THREAT);
            expect(rays.length).toBe(staging.kind === 'threat' ? 1 : 0);
        });
    });
});

describe('roleReference', () => {
    it('is a scripted subject with no weights, named for its case', () => {
        const subject = roleReference('hold-the-bite');
        expect(subject).toMatchObject({ name: 'role-hold-the-bite', weights: null });
        expect(typeof subject.act).toBe('function');
    });

    it('knows the six role cases and no other, and refuses an unknown name', () => {
        expect(ROLE_CASES.every((c) => hasRoleReference(c.name))).toBe(true);
        expect(hasRoleReference('flee-threat')).toBe(false);
        expect(() => roleReference('flee-threat')).toThrow(/no reference for "flee-threat"; known: sprint-on-prey/);
    });

    it('stands still and calls nothing on a row with nothing in view and nothing heard', () => {
        for (const reflexCase of ROLE_CASES) {
            const world = createReflexWorld({}, 1, reflexCase.spec);
            world.inputs.fill(0);
            roleReference(reflexCase.name).act?.(world);
            const outputs = Array.from(world.outputs.subarray(0, OUTPUT_COUNT)).filter((v) => v !== 0);
            expect(outputs, reflexCase.name).toEqual([1]);
        }
    });

    it('is what referenceFor gives a role case, and the memoryless controller for the others', () => {
        expect(referenceFor(caseNamed('clear-the-herd')).name).toBe('role-clear-the-herd');
        expect(referenceFor(caseNamed('flee-threat')).name).toBe('memoryless');
    });
});

describe('each role case is valid on seed 1', () => {
    for (const reflexCase of ROLE_CASES) {
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

    it('evalCase gives a role case its bars without any subject to score', () => {
        const { scores, bars } = evalCase(caseNamed('turn-to-alarm'), []);
        expect(scores).toEqual([]);
        expect(bars).toMatchObject({ reference: 1, valid: true });
    });

    it('a reference that does the opposite thing fails: a flight is not a turn to the call', () => {
        const table = buildCaseTable(caseNamed('flee-on-alarm'), { trials: 16 });
        const [wrong] = evalReflex([roleReference('turn-to-alarm')], [table]);
        expect(wrong['flee-on-alarm'].passShare).toBe(0);
    });
});
