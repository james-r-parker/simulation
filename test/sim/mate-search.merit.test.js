import { describe, expect, it } from 'vitest';
import { findMale } from '../../js/sim/mate-search.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

/**
 * A female (slot 0) and males with the given energy and merit, in range of her, with the hash built.
 * @param {{ energy: number, merit: number }[]} males the males, slots 1 to n
 * @param {Record<string, any>} over config overrides
 * @returns {any}
 */
function placed(males, over) {
    const w = lifeWorld({ maxAgents: 16, mateRange: 100, sexesEnabled: true, ...over });
    const f = addBlob(w, { mateOut: 1, energy: 700, spec: 2, sex: 0 });
    w.x[f] = 500;
    w.y[f] = 500;
    w.size[f] = 25;
    males.forEach(({ energy, merit }, i) => {
        const s = addBlob(w, { mateOut: 1, energy, spec: 2, sex: 1 });
        w.x[s] = 520 + i * 10;
        w.y[s] = 500;
        w.size[s] = 25;
        w.merit[s] = merit;
    });
    buildHash(w.hash, w);
    return w;
}

const RICH_POOR = [
    { energy: 900, merit: 0 },
    { energy: 500, merit: 5000 },
];

describe('findMale by merit', () => {
    it('picks the richest male when merit is off, whatever the weight and merit values', () => {
        const w = placed(RICH_POOR, { meritEnabled: false, meritMateWeight: 1 });
        expect(findMale(w, 0, 1)).toBe(1);
    });

    it('picks the same male as the energy rule at weight 0', () => {
        const w = placed(RICH_POOR, { meritEnabled: true, meritMateWeight: 0 });
        expect(findMale(w, 0, 1)).toBe(1);
    });

    it('picks the high-merit male at weight 1', () => {
        const w = placed(RICH_POOR, { meritEnabled: true, meritMateWeight: 1 });
        expect(findMale(w, 0, 1)).toBe(2);
    });

    it('blends energy and merit by the weight', () => {
        const low = placed(RICH_POOR, { meritEnabled: true, meritMateWeight: 0.01 });
        const high = placed(RICH_POOR, { meritEnabled: true, meritMateWeight: 0.5 });
        expect(findMale(low, 0, 1)).toBe(1);
        expect(findMale(high, 0, 1)).toBe(2);
    });

    it('ranks by decayed merit: an old credit loses to a fresh one', () => {
        const w = placed(
            [
                { energy: 700, merit: 4000 },
                { energy: 700, merit: 2000 },
            ],
            { meritEnabled: true, meritMateWeight: 1, meritHalfLife: 100 },
        );
        w.meritStamp[1] = 0;
        w.meritStamp[2] = 300;
        w.tick = 300;
        expect(findMale(w, 0, 1)).toBe(2);
    });

    it('breaks a score tie toward the lower slot', () => {
        const w = placed(
            [
                { energy: 700, merit: 800 },
                { energy: 700, merit: 800 },
            ],
            { meritEnabled: true, meritMateWeight: 0.5 },
        );
        expect(findMale(w, 0, 1)).toBe(1);
    });

    it('does not write merit or its stamp', () => {
        const w = placed(RICH_POOR, { meritEnabled: true, meritMateWeight: 0.5, meritHalfLife: 100 });
        w.tick = 250;
        const merit = Array.from(w.merit);
        const stamp = Array.from(w.meritStamp);
        findMale(w, 0, 1);
        expect(Array.from(w.merit)).toEqual(merit);
        expect(Array.from(w.meritStamp)).toEqual(stamp);
    });
});
