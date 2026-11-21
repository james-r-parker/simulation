import { describe, expect, it } from 'vitest';
import { LANES } from '../../js/sim/body-lanes.js';
import { LANE_ID, REF, compileRef, numberOf } from '../../js/sim/effect-refs.js';

describe('LANE_ID', () => {
    it('is the position of each lane in the catalogue', () => {
        expect(Object.keys(LANE_ID)).toEqual(LANES.map((lane) => lane.name));
        expect(LANE_ID.maxThrust).toBe(LANES.findIndex((lane) => lane.name === 'maxThrust'));
    });
});

describe('compileRef and numberOf', () => {
    const world = {
        laneArrays: LANES.map((_, i) => Float64Array.of(i, i + 100)),
        effectConfig: Float64Array.of(0.25, 4),
    };

    it('reads a literal, a lane at the slot, or a config number, each scaled and offset', () => {
        const keys = /** @type {string[]} */ ([]);
        expect(compileRef(7, keys).kind).toBe(REF.LITERAL);
        expect(numberOf(world, 0, compileRef(7, keys))).toBe(7);
        const id = LANE_ID.maxTurn;
        expect(numberOf(world, 1, compileRef('maxTurn', keys))).toBe(id + 100);
        expect(numberOf(world, 0, compileRef({ key: 'maxTurn', scale: -1 }, keys))).toBe(-id);
        expect(numberOf(world, 0, compileRef({ key: 'maxTurn', scale: 2, offset: 1 }, keys))).toBe(2 * id + 1);
        expect(keys).toEqual([]);
    });

    it('lists a config key once, in the order it is first read, and reads it from effectConfig', () => {
        const keys = /** @type {string[]} */ ([]);
        const a = compileRef('rallyThrust', keys);
        const b = compileRef({ key: 'rallyBurn', offset: -1 }, keys);
        const again = compileRef('rallyThrust', keys);
        expect(keys).toEqual(['rallyThrust', 'rallyBurn']);
        expect([a.kind, again.index]).toEqual([REF.CONFIG, 0]);
        expect(numberOf(world, 1, a)).toBe(0.25);
        expect(numberOf(world, 1, b)).toBe(3);
    });
});
