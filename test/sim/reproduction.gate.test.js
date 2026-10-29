import { describe, expect, it } from 'vitest';
import { tallyReady, splitGatedShare } from '../../js/sim/merit-tally.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { mate, splitAll, splitGateOpen } from '../../js/sim/reproduction.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const GATED = { splitDeliberateMin: 100, meritSplitFloorPop: 0, splitMinEnergy: 200 };

/**
 * @param {Record<string, any>} over config overrides
 * @param {number} intake the blob's deliberate intake
 * @returns {{w: any, slot: number}} a world with one ready blob
 */
function gated(over, intake) {
    const w = lifeWorld({ ...GATED, ...over });
    const slot = addBlob(w, { energy: 1000, deliberateIntake: intake });
    return { w, slot };
}

describe('splitGateOpen', () => {
    it('is closed below the threshold with the gate on and the population at the floor', () => {
        const { w, slot } = gated({}, 99.9);
        expect(splitGateOpen(w, slot)).toBe(false);
    });

    it('opens when splitDeliberateMin is 0', () => {
        const { w, slot } = gated({ splitDeliberateMin: 0 }, 0);
        expect(splitGateOpen(w, slot)).toBe(true);
    });

    it('opens when the population is below meritSplitFloorPop, and not at it', () => {
        const { w, slot } = gated({ meritSplitFloorPop: 2 }, 0);
        expect(w.population).toBe(1);
        expect(splitGateOpen(w, slot)).toBe(true);
        addBlob(w, { energy: 1000 });
        expect(w.population).toBe(2);
        expect(splitGateOpen(w, slot)).toBe(false);
    });

    it('opens at deliberateIntake exactly equal to the threshold', () => {
        const { w, slot } = gated({}, 100);
        expect(splitGateOpen(w, slot)).toBe(true);
    });
});

describe('split gate in splitAll', () => {
    it('blocks the split and costs nothing, leaving the agent ready', () => {
        const { w, slot } = gated({}, 50);
        const before = [w.energy[slot], w.cooldown[slot], w.pregnancy[slot], w.population, w.nextId];
        splitAll(w, recordingPolicy([]));
        splitAll(w, recordingPolicy([]));
        expect([w.energy[slot], w.cooldown[slot], w.pregnancy[slot], w.population, w.nextId]).toEqual(before);
        w.deliberateIntake[slot] = 100;
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(2);
    });

    it('splits an agent at the threshold and the child starts with no deliberate intake', () => {
        const { w, slot } = gated({}, 400);
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(w.deliberateIntake[1]).toBe(0);
        expect(w.deliberateIntake[slot]).toBe(400);
    });

    it('does not gate mating', () => {
        const w = lifeWorld(GATED);
        const a = addBlob(w, { energy: 1000, mateOut: 1 });
        const b = addBlob(w, { energy: 1000, mateOut: 1, sex: 1 });
        w.x[b] = w.x[a] + w.size[a] + w.size[b];
        buildHash(w.hash, w);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[a]).toBeGreaterThan(0);
        expect(w.deliberateIntake[a]).toBe(0);
    });

    it('with no deliberate forager, blocks every split, still mates and reads a gated share of 1', () => {
        const w = lifeWorld(GATED);
        const a = addBlob(w, { energy: 1000, mateOut: 1 });
        const b = addBlob(w, { energy: 1000, mateOut: 1, sex: 1 });
        w.x[b] = w.x[a] + w.size[a] + w.size[b];
        buildHash(w.hash, w);
        tallyReady(w);
        splitAll(w, recordingPolicy([]));
        expect(w.population).toBe(2);
        expect(splitGatedShare(w)).toBe(1);
        mate(w, recordingPolicy([]));
        expect(w.pregnancy[a]).toBeGreaterThan(0);
    });
});
