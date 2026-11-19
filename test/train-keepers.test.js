import { describe, expect, it } from 'vitest';
import { KEEP_MAX, fromKept, gateDrills, keeperReadings, loadKeepers, toKept } from '../scripts/lib/train-keepers.mjs';

const subject = (/** @type {number} */ id, /** @type {number} */ lowerBound) =>
    /** @type {any} */ ({
        name: `s${id}`,
        id,
        spec: 1,
        style: 'balanced',
        lowerBound,
        weights: Float32Array.from([id, 0.25]),
        act: null,
    });

describe('train-keepers', () => {
    it('keeps the best KEEP_MAX by lower bound as plain data and restores drill subjects', () => {
        const many = Array.from({ length: KEEP_MAX + 3 }, (_, i) => subject(i, i / 100));
        const kept = toKept(many);
        expect(kept).toHaveLength(KEEP_MAX);
        expect(kept[0].id).toBe(KEEP_MAX + 2);
        expect(JSON.parse(JSON.stringify(kept))).toEqual(kept);
        const back = fromKept(kept);
        expect(back[0].weights).toBeInstanceOf(Float32Array);
        expect(Array.from(back[0].weights)).toEqual(kept[0].weights);
        expect(back[0].act).toBeNull();
    });

    it('reads the drills of a gate, once each, ignoring other readings; a missing save loads as none', () => {
        const gate = [
            { read: 'drill.food-ahead.edgeLow' },
            { read: 'drill.food-ahead.winShareLow' },
            { read: 'retention.all' },
        ];
        expect(gateDrills(gate)).toEqual(['food-ahead']);
        expect(loadKeepers(undefined)).toEqual({});
        expect(loadKeepers({ a: [] })).toEqual({ a: [] });
    });

    it('drills nothing for a stage with no kept passers or no gate', async () => {
        const stages = [{ name: 'a', gate: [{ read: 'drill.food-ahead.edgeLow' }] }, { name: 'b' }];
        const at = { stages, seed: 1, trials: 1, workers: 1, log: /** @type {any} */ (null) };
        expect(await keeperReadings({}, at)).toEqual({});
        expect(await keeperReadings({ a: [], b: toKept([subject(1, 0.1)]) }, at)).toEqual({});
    });
});
