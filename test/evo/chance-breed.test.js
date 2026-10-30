// Breeding is chance-free (principles rule 2; natural-selection.md T7): chance energy moves no mate score, no birth gift
// and no archive rank, and an ambush (a nearly still hunter that the prey closes on) is deliberate, not chance.

import { describe, expect, it } from 'vitest';
import { createFitnessV6 } from '../../js/evo/fitness-v6.js';
import { createLifeCounters } from '../../js/evo/life-counters.js';
import { validatePolicyOptions } from '../../js/evo/policy-options.js';
import { createConfig } from '../../js/sim/config.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { AMBUSH_STILL, biteDeliberate, trackMerit } from '../../js/sim/merit-state.js';
import { meritPhase } from '../../js/sim/merit-phase.js';
import { creditIntake } from '../../js/sim/merit.js';
import { findMale } from '../../js/sim/mate-search.js';
import { refreshMateRanks } from '../../js/sim/mate-rank.js';
import { giftOf } from '../../js/sim/reproduction.js';
import { SEX } from '../../js/sim/sex.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { visionOf } from '../../js/sim/traits.js';
import { addBlob, lifeWorld } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const CH_PREY = 3;

describe('chance energy moves nothing that breeds', () => {
    it('leaves the birth gift as it was', () => {
        const w = lifeWorld({ meritBirthBoost: 0.4, meritHalfLife: 0 });
        const mother = addBlob(w, { energy: 1000 });
        const before = giftOf(w, mother, false);
        creditIntake(w, mother, 5000, false);
        expect(giftOf(w, mother, false)).toBe(before);
        creditIntake(w, mother, 300, true);
        expect(giftOf(w, mother, false)).toBeGreaterThan(before);
    });

    it('gives a male fed by chance no mate rank over one fed deliberately, whatever his energy', () => {
        const w = lifeWorld({ maxAgents: 16, meritHalfLife: 0, mateRange: 100 });
        const near = { mateOut: 1, energy: 700, spec: 2, y: 500, size: 25 };
        addBlob(w, { ...near, sex: SEX.FEMALE, x: 500 });
        const lucky = addBlob(w, { ...near, sex: SEX.MALE, x: 520, energy: 1900 });
        const skilled = addBlob(w, { ...near, sex: SEX.MALE, x: 530 });
        for (let meal = 0; meal < 8; meal++) {
            creditIntake(w, lucky, 600, false);
            creditIntake(w, skilled, 10, true);
        }
        refreshMateRanks(w);
        expect(w.merit[lucky]).toBe(0);
        buildHash(w.hash, w);
        expect(findMale(w, 0, 1)).toBe(skilled);
    });

    it('leaves the archive rank as it was: chance food and bites add nothing to the fitness', () => {
        const { observer } = observed();
        const counters = createLifeCounters(observer.config);
        const fitness = createFitnessV6(counters);
        observer.intent.deliberateFood[0] = 600;
        const before = fitness(observer, 0, observer.config);
        observer.intent.chanceFood[0] = 9000;
        observer.intent.chanceBite[0] = 9000;
        expect(before).toBeGreaterThan(0);
        expect(fitness(observer, 0, observer.config)).toBe(before);
    });

    it('is no longer a key anywhere: the config and the fitness overrides refuse a chance weight', () => {
        expect(() => createConfig({ meritChanceWeight: 0 })).toThrow(/meritChanceWeight/);
        expect(() => createFitnessV6({}, { CHANCE_WEIGHT: 0 })).toThrow(/CHANCE_WEIGHT/);
        expect(() => validatePolicyOptions('map-elites-v6', { fitnessOverrides: { CHANCE_WEIGHT: 0 } })).toThrow(
            /CHANCE_WEIGHT/,
        );
    });
});

describe('an ambush bite is deliberate', () => {
    /**
     * Runs a hunter through `count` ticks with the nearest prey on the ray dead ahead at the given proximity.
     * @param {any} w the world
     * @param {{slot: number, count: number, step: number, speed?: number}} run the proximity gained per tick (the prey's
     *   closing is `step x vision`), and the hunter's speed as a share of `maxVelocity`, sideways
     * @returns {void}
     */
    function watch(w, { slot, count, step, speed = 0 }) {
        const base = slot * w.layout.rawInputCount;
        for (let i = 0; i < count; i++) {
            w.tick += 1;
            w.inputs.fill(0, base, base + w.config.rayCount * RAY_CHANNELS);
            w.inputs[base] = 0.2 + step * (i + 1);
            w.inputs[base + CH_PREY] = 0.5;
            w.vx[slot] = 0;
            w.vy[slot] = speed * w.config.maxVelocity;
            trackMerit(w, slot);
        }
    }

    /** @returns {{w: any, hunter: number, closing: number}} a hunter, and the proximity step of prey closing at 2 x the threshold */
    function ring() {
        const w = lifeWorld({ rayCount: 16, biteArc: Math.PI / 4, maxAgents: 8 });
        const hunter = addBlob(w, { ageTicks: 1, spec: w.config.specialisations.predator.index });
        w.tick = 100;
        return { w, hunter, closing: (2 * 0.25 * w.config.maxVelocity) / visionOf(w, hunter) };
    }

    it('counts a bite by a nearly still hunter that the prey closed on', () => {
        const { w, hunter, closing } = ring();
        watch(w, { slot: hunter, count: 12, step: closing });
        expect(biteDeliberate(w, hunter)).toBe(true);
    });

    it('credits the bite energy as deliberate intake', () => {
        const { w, hunter, closing } = ring();
        watch(w, { slot: hunter, count: 12, step: closing });
        w.biteEnergy[hunter] = 30;
        meritPhase(w);
        expect([w.deliberateIntake[hunter], w.merit[hunter]]).toEqual([30, 30]);
    });

    it('does not count prey that holds its distance, or recedes', () => {
        const still = ring();
        watch(still.w, { slot: still.hunter, count: 12, step: 0 });
        expect(biteDeliberate(still.w, still.hunter)).toBe(false);
        const away = ring();
        watch(away.w, { slot: away.hunter, count: 12, step: -away.closing });
        expect(biteDeliberate(away.w, away.hunter)).toBe(false);
    });

    it('does not count a hunter that is moving across the prey, which closes on it by chance', () => {
        const { w, hunter, closing } = ring();
        watch(w, { slot: hunter, count: 12, step: closing, speed: 2 * AMBUSH_STILL });
        expect(biteDeliberate(w, hunter)).toBe(false);
    });

    it('does not count prey that closes too slowly to be a rush', () => {
        const { w, hunter, closing } = ring();
        watch(w, { slot: hunter, count: 12, step: closing / 4 });
        expect(biteDeliberate(w, hunter)).toBe(false);
    });
});
