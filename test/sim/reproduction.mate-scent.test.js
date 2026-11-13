// The receptive-mate scent (docs/designs/low-density-edge.md, Phase 5): a ready female leaves `mateScentDeposit` on
// `world.mate` at her cell each tick `mate` runs, whether or not she finds a male.
import { describe, expect, it } from 'vitest';
import { mate } from '../../js/sim/reproduction.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const READY = { mateOut: 1, energy: 700, spec: 2 };
const FEMALE = 0;
const MALE = 1;

/**
 * @param {any} w the world
 * @returns {number} the sum of the mate grid
 */
function scent(w) {
    return w.mate.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
}

/**
 * @param {any} w the world
 * @param {number} slot the agent
 * @returns {number} the mate grid cell under the agent
 */
function cellUnder(w, slot) {
    const size = w.config.pheromoneCellSize;
    const { cols } = w.pheromoneGrid;
    return Math.floor(w.y[slot] / size) * cols + Math.floor(w.x[slot] / size);
}

/**
 * Runs one `mate` pass over one agent alone.
 * @param {Record<string, number>} fields the agent's fields
 * @param {Record<string, any>} [over] config overrides
 * @returns {{ w: any, slot: number }}
 */
function oneAgent(fields, over = { mateScentDeposit: 0.5 }) {
    const w = lifeWorld(over);
    const slot = addBlob(w, { ...READY, x: 230, y: 470, ...fields });
    buildHash(w.hash, w);
    mate(w, recordingPolicy([]));
    return { w, slot };
}

describe('the receptive-mate scent', () => {
    it('is left by a ready female at her cell, with no male in reach', () => {
        const { w, slot } = oneAgent({ sex: FEMALE });
        expect(w.mate[cellUnder(w, slot)]).toBe(0.5);
        expect(scent(w)).toBe(0.5);
    });

    it('is left by a ready female that mates this tick', () => {
        const w = lifeWorld({ mateScentDeposit: 0.5 });
        const her = addBlob(w, { ...READY, sex: FEMALE });
        addBlob(w, { ...READY, sex: MALE });
        buildHash(w.hash, w);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[her]).toBeGreaterThan(0);
        expect(w.mate[cellUnder(w, her)]).toBe(0.5);
        expect(scent(w)).toBe(0.5);
    });

    it('is not left by a female whose brain does not want to mate', () => {
        expect(scent(oneAgent({ sex: FEMALE, mateOut: -1 }).w)).toBe(0);
    });

    it('is not left by a female who is not ready (pregnant)', () => {
        expect(scent(oneAgent({ sex: FEMALE, pregnancy: 10 }).w)).toBe(0);
    });

    it('is not left by a ready male', () => {
        expect(scent(oneAgent({ sex: MALE }).w)).toBe(0);
    });

    it('is nothing at mateScentDeposit 0, the default', () => {
        expect(scent(oneAgent({ sex: FEMALE }, {}).w)).toBe(0);
    });

    it('caps at pheromoneMax', () => {
        const w = lifeWorld({ mateScentDeposit: 4, pheromoneMax: 5 });
        const her = addBlob(w, { ...READY, sex: FEMALE });
        buildHash(w.hash, w);
        mate(w, recordingPolicy([]));
        mate(w, recordingPolicy([]));
        expect(w.mate[cellUnder(w, her)]).toBe(5);
    });
});
