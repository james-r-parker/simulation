// What a list of effects compiles into (js/sim/effect-compile.js): lane lookups, gates and follow-on effects.

import { describe, expect, it } from 'vitest';
import { GATE, GATE_COUNT, compileGates, compileThen, laneIdOf } from '../../js/sim/effect-compile.js';
import { LANE_ID } from '../../js/sim/effects.js';

/**
 * @param {Record<string, any>} over fields of an effect
 * @returns {any} an effect that closes nothing and fades by a `ticks` timer
 */
const effect = (over) => ({ name: 'a', gates: [], fades: { kind: 'ticks', key: 'k' }, ...over });

describe('laneIdOf', () => {
    it('is the lane index, and refuses a name that is not a lane', () => {
        expect(laneIdOf('x', 'maxThrust')).toBe(LANE_ID.maxThrust);
        expect(() => laneIdOf('x', 'nope')).toThrow(/x names nope, which is not a lane/);
    });
});

describe('compileGates', () => {
    it('lists, for each gate, the effects that close it in registry order, and refuses an unknown gate', () => {
        const gates = compileGates([effect({ gates: ['EAT', 'BITE'] }), effect({ name: 'b', gates: ['EAT'] })]);
        expect(gates).toHaveLength(GATE_COUNT);
        expect(gates[GATE.EAT]).toEqual([0, 1]);
        expect(gates[GATE.BITE]).toEqual([0]);
        expect(() => compileGates([effect({ gates: ['NOPE'] })])).toThrow(/not a gate/);
    });
});

describe('compileThen', () => {
    it('gives the index of each follow-on, -1 for none, and refuses an unlisted one or a timer that is not `ticks`', () => {
        expect(compileThen([effect({ then: 'b' }), effect({ name: 'b' })])).toEqual([1, -1]);
        expect(() => compileThen([effect({ then: 'zzz' })])).toThrow(/hands over/);
        expect(() =>
            compileThen([effect({ then: 'b', fades: { kind: 'held', key: 'k' } }), effect({ name: 'b' })]),
        ).toThrow(/hands over/);
    });
});
