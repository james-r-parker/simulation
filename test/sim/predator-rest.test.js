// The post-kill rest (realistic-keepers T2): `predatorRestTicks` forces a hunter's thrust to 0 for that many ticks
// after its bite kills, and only then; off at 0, hand-built worlds.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { updateSize } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { actAll } from '../../js/sim/physics.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld } from './helpers/life-world.js';

const PREDATOR = 1;
const FORAGER = 0;
const REST = 3;

/**
 * A predator beside a forager with `victimEnergy`; the predator bites once and then wants full thrust.
 * @param {number} victimEnergy the forager's energy
 * @param {Record<string, any>} over config overrides
 * @param {number} [spec] the biter's specialisation
 * @returns {{w: any, biter: number}} the world after the feed phase, and the biter
 */
function biteOnce(victimEnergy, over, spec = PREDATOR) {
    const w = lifeWorld({ biteArc: Math.PI / 4, biteCost: 0, ...over });
    const biter = addBlob(w, { spec, energy: 500, x: 100, y: 100, angle: 0 });
    const victim = addBlob(w, { spec: FORAGER, energy: victimEnergy, x: 110, y: 100, angle: 0 });
    updateSize(w, biter);
    updateSize(w, victim);
    w.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    w.contacts[0] = biter;
    w.contacts[1] = victim;
    w.contactCount = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
    return { w, biter };
}

/**
 * @param {any} w the world
 * @param {number} slot the agent that wants full thrust
 * @returns {number} the speed gained by one act phase
 */
function actOnce(w, slot) {
    w.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.THRUST] = 1;
    w.vx[slot] = 0;
    w.vy[slot] = 0;
    actAll(w);
    return Math.hypot(w.vx[slot], w.vy[slot]);
}

describe('predatorRestTicks', () => {
    it('starts the rest on a fatal bite by a hunter', () => {
        const { w, biter } = biteOnce(5, { predatorRestTicks: REST });
        expect(w.restTimer[biter]).toBe(REST);
    });

    it('forces thrust to 0 for that many act phases, then thrusts again', () => {
        const { w, biter } = biteOnce(5, { predatorRestTicks: REST });
        for (let t = 0; t < REST; t++) {
            expect(actOnce(w, biter)).toBe(0);
        }
        expect(actOnce(w, biter)).toBeGreaterThan(0);
    });

    it('does nothing at the default 0', () => {
        const { w, biter } = biteOnce(5, {});
        expect(w.restTimer).toBeUndefined();
        expect(actOnce(w, biter)).toBeGreaterThan(0);
    });

    it('does not fire on a bite that does not kill', () => {
        const { w, biter } = biteOnce(5000, { predatorRestTicks: REST });
        expect(w.restTimer[biter]).toBe(0);
    });

    it('does not fire for a biter that cannot hunt', () => {
        const { w, biter } = biteOnce(5, { predatorRestTicks: REST }, FORAGER);
        expect(w.restTimer[biter]).toBe(0);
    });

    it('clears the timer when the slot is freed', () => {
        const { w, biter } = biteOnce(5, { predatorRestTicks: REST });
        freeAgent(w, biter);
        expect(w.restTimer[biter]).toBe(0);
    });
});
