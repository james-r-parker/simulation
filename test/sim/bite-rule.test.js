import { describe, expect, it } from 'vitest';
import { canBite, couldBite } from '../../js/sim/bite-rule.js';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { createRng, nextFloat } from '../../js/sim/rng.js';
import { addAgent, senseWorld } from './helpers/sense-world.js';

const HUNTER_SPEC = 1;

/**
 * Two agents 50 apart on the x axis; the biter faces `facing`.
 * @param {Record<string, any>} over config overrides
 * @param {{spec?: number, size?: number, facing?: number, kin?: boolean}} [biterOver] the biter
 * @returns {{w: ReturnType<typeof senseWorld>, biter: number, victim: number}}
 */
function pair(over, { spec = HUNTER_SPEC, size = 30, facing = 0, kin = false } = {}) {
    // the fixtures state the ratio they assume (1.01, the pre-T15d default), so the default's change does not move them
    const w = senseWorld({ huntSizeRatio: 1.01, ...over });
    const biter = addAgent(w, 500, 500, size);
    const victim = addAgent(w, 550, 500, 20);
    w.spec[biter] = spec;
    w.angle[biter] = facing;
    if (kin) {
        w.parentA[victim] = w.genomeId[biter];
    }
    return { w, biter, victim };
}

describe('canBite', () => {
    it('allows a hunter that is big enough, not kin and facing the victim', () => {
        const { w, biter, victim } = pair({});
        expect(canBite(w, biter, victim)).toBe(true);
        expect(canBite(w, victim, biter)).toBe(false);
    });

    it.each([
        ['a specialisation that cannot hunt', { spec: 0 }],
        ['kin', { kin: true }],
        ['a biter no bigger than the ratio allows', { size: 20 }],
        ['a victim behind the jaws', { facing: Math.PI }],
    ])('refuses %s', (_name, biterOver) => {
        const { w, biter, victim } = pair({}, biterOver);
        expect(canBite(w, biter, victim)).toBe(false);
    });

    it('needs the biter to exceed huntSizeRatio times the victim, strictly', () => {
        const { w, biter, victim } = pair({ huntSizeRatio: 1.5 }, { size: 30 });
        expect(canBite(w, biter, victim)).toBe(false);
        w.size[biter] = 30.01;
        expect(canBite(w, biter, victim)).toBe(true);
    });

    it('lets an equal-size hunter bite at the T15d ratio of 0.8', () => {
        const { w, biter, victim } = pair({ huntSizeRatio: 0.8 }, { size: 20 });
        expect(canBite(w, biter, victim)).toBe(true);
    });

    it('takes any direction when the bite arc is the full circle', () => {
        const { w, biter, victim } = pair({ biteArc: Math.PI }, { facing: Math.PI });
        expect(canBite(w, biter, victim)).toBe(true);
    });
});

describe('couldBite', () => {
    it('ignores the jaws: a hunter facing away could still bite', () => {
        const { w, biter, victim } = pair({}, { facing: Math.PI });
        expect(couldBite(w, biter, victim)).toBe(true);
        expect(canBite(w, biter, victim)).toBe(false);
    });

    it.each([
        ['a specialisation that cannot hunt', { spec: 0 }],
        ['kin', { kin: true }],
        ['a biter no bigger than the ratio allows', { size: 20 }],
    ])('refuses %s', (_name, biterOver) => {
        const { w, biter, victim } = pair({}, biterOver);
        expect(couldBite(w, biter, victim)).toBe(false);
    });
});

describe('canBite and feed', () => {
    it('agree: feed bites exactly when the brain wants to and canBite holds', () => {
        const rng = createRng(3);
        let bitesSeen = 0;
        for (let trial = 0; trial < 200; trial++) {
            const w = senseWorld({ huntSizeRatio: 1.01 });
            const a = addAgent(w, 500, 500, 10 + nextFloat(rng) * 40);
            const b = addAgent(
                w,
                500 + (nextFloat(rng) - 0.5) * 80,
                500 + (nextFloat(rng) - 0.5) * 80,
                10 + nextFloat(rng) * 40,
            );
            const sizes = [w.size[a], w.size[b]];
            for (const slot of [a, b]) {
                w.spec[slot] = Math.floor(nextFloat(rng) * 2);
                w.angle[slot] = (nextFloat(rng) - 0.5) * 6;
                addEnergy(w, slot, 500, ENERGY_SOURCE.INITIAL);
                w.size[slot] = sizes[slot === a ? 0 : 1];
                w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = nextFloat(rng) < 0.8 ? 1 : 0;
            }
            if (nextFloat(rng) < 0.2) {
                w.parentA[b] = w.genomeId[a];
            }
            w.contacts[0] = a;
            w.contacts[1] = b;
            w.contactCount = 1;
            const hash = createSpatialHash(w.config);
            buildHash(hash, w);
            const before = [w.energy[a], w.energy[b]];
            const wantsA = w.outputs[a * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 && canBite(w, a, b);
            const wantsB = w.outputs[b * OUTPUT_COUNT + OUTPUT_INDEX.BITE] > 0 && canBite(w, b, a);
            feed(w, hash);
            expect(w.energy[b] < before[1]).toBe(wantsA);
            expect(w.energy[a] < before[0]).toBe(wantsB);
            bitesSeen += Number(wantsA) + Number(wantsB);
        }
        expect(bitesSeen).toBeGreaterThan(10);
    });
});
