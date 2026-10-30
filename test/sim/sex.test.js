import { describe, expect, it } from 'vitest';
import { drawSex } from '../../js/sim/sex.js';
import { lifeWorld } from './helpers/life-world.js';

/**
 * @param {any} w the world
 * @returns {number[]} the lifecycle stream state
 */
function lifecycleState(w) {
    return Array.from(w.rng.lifecycle.s);
}

describe('drawSex', () => {
    it('draws one lifecycle value per call and splits about evenly', () => {
        const w = lifeWorld({ maxAgents: 64 });
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
        const a = lifeWorld({ seed: 5 });
        const b = lifeWorld({ seed: 5 });
        for (let i = 0; i < 8; i++) {
            drawSex(a, i);
            drawSex(b, i);
        }
        expect(Array.from(a.sex)).toEqual(Array.from(b.sex));
    });
});
