import { describe, expect, it } from 'vitest';
import { applyCosts, updateSize } from '../../js/sim/energy.js';
import { TRAIT_INDEX } from '../../js/sim/brain-layout.js';
import { detTanh } from '../../js/sim/det-math.js';
import { canMatePair } from '../../js/sim/mate-eligibility.js';
import { castRays } from '../../js/sim/ray-march.js';
import { advancePregnancies } from '../../js/sim/reproduction.js';
import { TRAIT_MAX, TRAIT_SPAN, applyGenes, traitValue, visionOf } from '../../js/sim/traits.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { freeAgent } from '../../js/sim/world.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { createConfig } from '../../js/sim/config.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';
import { addAgent, addFood, rebuild, senseWorld } from './helpers/sense-world.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

/**
 * Sets one trait gene of a slot's row and derives the slot's values.
 * @param {any} w the world
 * @param {number} slot the slot
 * @param {Record<string, number>} genes trait name (a `TRAIT_INDEX` key) to gene value
 * @returns {void}
 */
function setGenes(w, slot, genes) {
    for (const [name, value] of Object.entries(genes)) {
        w.weights[slot * w.layout.weightCount + w.layout.traitStart + /** @type {any} */ (TRAIT_INDEX)[name]] = value;
    }
    applyGenes(w, slot);
}

describe('traitValue', () => {
    it('is 1 for a gene of 0 and runs from 0.7 to 1.3', () => {
        expect(traitValue(0)).toBe(1);
        expect(traitValue(40)).toBeCloseTo(1 + TRAIT_SPAN, 12);
        expect(traitValue(-40)).toBeCloseTo(1 - TRAIT_SPAN, 12);
        expect(traitValue(0.7)).toBe(1 + TRAIT_SPAN * detTanh(0.7));
        expect(TRAIT_MAX).toBe(1.3);
    });
});

describe('applyGenes', () => {
    it('derives vision, base size and child share from the trait genes', () => {
        const w = lifeWorld({});
        const slot = addBlob(w);
        setGenes(w, slot, { SIZE: 1, VISION: -1, CHILD_SHARE: 0.5 });
        expect(w.baseSize[slot]).toBe(Math.fround(w.config.baseSize * traitValue(1)));
        expect(w.vision[slot]).toBe(Math.fround(traitValue(-1)));
        expect(w.childShare[slot]).toBe(Math.fround(w.config.childEnergyShare * traitValue(0.5)));
    });

    it('zeroes a freed slot', () => {
        const on = lifeWorld();
        const s = addBlob(on);
        setGenes(on, s, { SIZE: 1, VISION: 1, CHILD_SHARE: 1 });
        freeAgent(on, s);
        expect(on.vision[s] + on.baseSize[s] + on.childShare[s]).toBe(0);
    });

    it('sizes a body from its own base size', () => {
        const on = lifeWorld({});
        const a = addBlob(on);
        setGenes(on, a, { SIZE: 40 });
        updateSize(on, a);
        expect(on.size[a]).toBeCloseTo(on.config.baseSize * 1.3 + on.energy[a] / on.config.energyToSize, 4);
    });
});

describe('vision trait', () => {
    it('scales the ray length through visionOf', () => {
        const on = lifeWorld({});
        const a = addBlob(on, { spec: 1 });
        setGenes(on, a, { VISION: 40 });
        expect(visionOf(on, a)).toBeCloseTo(on.visionBySpec[1] * 1.3, 4);
    });

    it('lets a ray march reach food at 1.25 x the spec range for the largest vision trait', () => {
        const w = senseWorld({ worldWidth: 3000, worldHeight: 3000 });
        const me = addAgent(w, 500, 500, 20);
        const range = w.visionBySpec[w.spec[me]];
        setGenes(w, me, { VISION: 40 });
        addFood(w, 500 + 1.25 * range, 500, 5);
        castRays(w, rebuild(w), me);
        expect(w.inputs[me * w.layout.inputCount + 1]).toBe(1);
    });

    it('stops at the ray length: food beyond 1.3 x the range is missed even with the largest trait', () => {
        const w = senseWorld({ worldWidth: 3000, worldHeight: 3000 });
        const me = addAgent(w, 500, 500, 20);
        setGenes(w, me, { VISION: 40 });
        addFood(w, 500 + 1.4 * w.visionBySpec[w.spec[me]], 500, 5);
        castRays(w, rebuild(w), me);
        const base = me * w.layout.inputCount;
        expect(w.inputs.subarray(base, base + RAY_CHANNELS).every((/** @type {number} */ v) => v === 0)).toBe(true);
    });

    it('charges passiveLoss x visionCost x (vision - 1) only above 1', () => {
        const w = lifeWorld({ visionCost: 0.5 });
        const far = addBlob(w, { energy: 100 });
        const near = addBlob(w, { energy: 100 });
        const flat = addBlob(w, { energy: 100 });
        setGenes(w, far, { VISION: 40 });
        setGenes(w, near, { VISION: -40 });
        setGenes(w, flat, { VISION: 0 });
        w.size.fill(20);
        applyCosts(w);
        expect(w.energy[near]).toBe(w.energy[flat]);
        const extra = w.energy[flat] - w.energy[far];
        expect(extra).toBeCloseTo(w.config.passiveLoss * 0.5 * 0.3, 4);
    });
});

describe('child share trait', () => {
    it('sets the mating gift to the mother share and the mate threshold from the same share', () => {
        const w = lifeWorld({});
        const mother = addBlob(w, { energy: 800, pregnancy: 1, fatherId: 77 });
        setGenes(w, mother, { CHILD_SHARE: 40 });
        advancePregnancies(w, recordingPolicy([]));
        const child = w.alive.indexOf(1, mother + 1);
        expect(child).toBeGreaterThan(mother);
        const share = w.childShare[mother];
        expect(share).toBeCloseTo(0.65, 5);
        expect(w.energy[mother]).toBeCloseTo(800 * (1 - share), 3);
    });

    it('moves the canMatePair energy threshold with the lower slot share', () => {
        const mate = { mateOut: 1, spec: 2, energy: 700 };
        const w = lifeWorld({ childEnergyMin: 250 });
        const a = addBlob(w, mate);
        const b = addBlob(w, mate);
        w.size[a] = 25;
        w.size[b] = 25;
        setGenes(w, a, { CHILD_SHARE: -40 });
        expect(canMatePair(w, a, b)).toBe(false);
        setGenes(w, a, { CHILD_SHARE: 40 });
        expect(canMatePair(w, a, b)).toBe(true);
    });
});

describe('hashWorld and traits', () => {
    it('includes vision and baseSize', () => {
        const on = [lifeWorld({ seed: 4 }), lifeWorld({ seed: 4 })];
        on[1].vision[0] = 0.9;
        expect(hashWorld(on[1])).not.toBe(hashWorld(on[0]));
        on[1].vision[0] = 0;
        on[1].baseSize[0] = 30;
        expect(hashWorld(on[1])).not.toBe(hashWorld(on[0]));
    });
});

describe('hashCellSize with traits', () => {
    it('must cover the largest body the size trait allows', () => {
        expect(() => createConfig({ ...FEATURES_OFF, hashCellSize: 128 })).toThrow(/hashCellSize/);
        expect(() => createConfig({ ...FEATURES_OFF, hashCellSize: 140 })).not.toThrow();
    });

    it('keeps the hash able to build with a 1.3 x base size body', () => {
        const w = lifeWorld({});
        const slot = addBlob(w);
        setGenes(w, slot, { SIZE: 40 });
        updateSize(w, slot);
        expect(() => buildHash(w.hash, w)).not.toThrow();
    });
});
