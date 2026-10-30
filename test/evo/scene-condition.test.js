// Condition changes the walk: an agent walked through neutral, pregnant, cold and starving samples with a known gait
// shift, read live and after its death.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { flushCondition, gaitShift, sampleCondition } from '../../js/evo/scene-condition.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;

const read = (/** @type {any} */ r) => computeMetrics(r.observer, r.world)['eval.condition_gait_shift'];

/** Samples the agent once at the next 100-tick mark with the given gait and condition. */
function sample(/** @type {any} */ r, /** @type {number} */ slot, /** @type {Record<string, number>} */ f) {
    r.world.tick += 100;
    r.world.vx[slot] = f.speed;
    r.world.turnRate[slot] = f.turn;
    r.world.pregnancy[slot] = f.pregnant ?? 0;
    r.world.temperature[slot] = f.cold ? 10 : 50;
    r.world.energy[slot] = f.starving ? 50 : 1000;
    sampleCondition(r.observer.scenes.condition, r.world);
}

describe('eval.condition_gait_shift', () => {
    it('is the mean over conditions of the speed and turn shifts from the neutral gait, then over agents', () => {
        const r = observed();
        const { maxVelocity, maxTurn } = r.world.config;
        const walker = addBlob(r.world);
        const steady = addBlob(r.world);
        r.observer.slotOf.set(r.world.genomeId[walker], walker);
        r.observer.slotOf.set(r.world.genomeId[steady], steady);
        r.world.tick = T0;
        const neutral = { speed: 1, turn: 0.1 };
        sample(r, walker, neutral);
        sample(r, walker, neutral);
        sample(r, walker, { speed: 1 + 0.2 * maxVelocity, turn: 0.1 + 0.1 * maxTurn, pregnant: 5 });
        sample(r, walker, { ...neutral, cold: 1 });
        sample(r, steady, neutral);
        // pregnant: (0.2 + 0.1) / 2; cold: no change; the walker's shift is their mean. `steady` has only neutral samples.
        expect(gaitShift(r.observer.scenes.condition, r.world.config, walker)).toBeCloseTo(0.075, 6);
        expect(gaitShift(r.observer.scenes.condition, r.world.config, steady)).toBeNaN();
        expect(read(r).value).toBeCloseTo(0.075, 6);
    });

    it('keeps an agent in the mean after it dies, once, and is null with no neutral sample', () => {
        const r = observed();
        const { maxVelocity } = r.world.config;
        const slot = addBlob(r.world);
        r.world.tick = T0;
        sample(r, slot, { speed: 0, turn: 0 });
        sample(r, slot, { speed: maxVelocity * 0.5, turn: 0, starving: 1 });
        flushCondition(r.observer.scenes.condition, r.world.config, slot);
        expect(read(r).value).toBeCloseTo(0.25, 12);
        const lone = observed();
        const only = addBlob(lone.world);
        lone.observer.slotOf.set(lone.world.genomeId[only], only);
        lone.world.tick = T0;
        sample(lone, only, { speed: 1, turn: 0, starving: 1 });
        expect(read(lone).value).toBeNull();
    });

    it('takes no sample before burn-in', () => {
        const r = observed();
        const slot = addBlob(r.world);
        r.world.tick = T0 - 200;
        sample(r, slot, { speed: 1, turn: 0 });
        expect(r.observer.scenes.condition.count[slot * 4]).toBe(0);
    });
});
