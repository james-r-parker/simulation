import { describe, expect, it } from 'vitest';
import { SEX, drawSex } from '../../js/sim/sex.js';
import { lifeWorld } from './helpers/life-world.js';

/**
 * @param {any} w the world
 * @returns {number[]} the lifecycle stream state
 */
function lifecycleState(w) {
    return Array.from(w.rng.lifecycle.s);
}

describe('drawSex', () => {
    it('draws nothing and leaves the slot female when sexes are off', () => {
        const w = lifeWorld();
        const before = lifecycleState(w);
        drawSex(w, 0);
        expect(w.sex[0]).toBe(SEX.FEMALE);
        expect(lifecycleState(w)).toEqual(before);
    });

    it('draws one lifecycle value per call and splits about evenly when sexes are on', () => {
        const w = lifeWorld({ sexesEnabled: true, maxAgents: 64 });
        let males = 0;
        for (let i = 0; i < 64; i++) {
            const before = lifecycleState(w);
            drawSex(w, i);
            expect(lifecycleState(w)).not.toEqual(before);
            males += w.sex[i];
        }
        expect(males).toBeGreaterThan(16);
        expect(males).toBeLessThan(48);
    });

    it('is deterministic for a seed', () => {
        const a = lifeWorld({ sexesEnabled: true, seed: 5 });
        const b = lifeWorld({ sexesEnabled: true, seed: 5 });
        for (let i = 0; i < 8; i++) {
            drawSex(a, i);
            drawSex(b, i);
        }
        expect(Array.from(a.sex)).toEqual(Array.from(b.sex));
    });
});
