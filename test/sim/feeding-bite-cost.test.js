// The prey-scaled bite cost (natural-selection T5a): a biter pays `biteCost` x (victim size / biter size) x
// (0.5 + victim energy / maxEnergy) x the victim's kickMultiplier on every bite that lands, read before the transfer.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { LOSS_CAUSE, updateSize } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { assertInvariants } from '../../js/sim/invariants.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { addBlob, imbalance, lifeWorld } from './helpers/life-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const DEFENDER = 4;
const BITER_ENERGY = 500;

/**
 * A predator at (100, 100) bites the agent beside it once (when `bite` is on and the rule allows it).
 * @param {{victim?: Record<string, number>, over?: Record<string, any>, bite?: boolean, biterSpec?: number}} [what]
 *   the victim's fields, config overrides, whether the brain bites and the biter's specialisation
 * @returns {{w: any, biter: number, victim: number, kick: number, expected: number}} the world after the feed phase,
 *   the energy the biter lost beyond what it gained from the bite, and the formula's value from the state before it
 */
function biteOnce({ victim: fields = {}, over = {}, bite = true, biterSpec = PREDATOR } = {}) {
    const w = lifeWorld({ biteArc: Math.PI / 4, biteCost: 10, predatorKillEnergy: 0, ...over });
    const biter = addBlob(w, { spec: biterSpec, energy: BITER_ENERGY, x: 100, y: 100, angle: 0 });
    const victim = addBlob(w, { spec: FORAGER, energy: 100, x: 110, y: 100, angle: 0, ...fields });
    updateSize(w, biter);
    updateSize(w, victim);
    const kickMultiplier = [1, 1, 1, 1, 2][w.spec[victim]];
    const expected =
        w.config.biteCost *
        (w.size[victim] / w.size[biter]) *
        (0.5 + w.energy[victim] / w.config.maxEnergy) *
        kickMultiplier;
    w.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = bite ? 1 : 0;
    w.contacts[0] = biter;
    w.contacts[1] = victim;
    w.contactCount = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
    const kick = BITER_ENERGY + w.biteEnergy[biter] - w.energy[biter];
    return { w, biter, victim, kick, expected };
}

describe('biteCost', () => {
    it('charges the biter exactly the formula on a bite that lands, as a cost loss', () => {
        const { w, biter, kick, expected } = biteOnce();
        expect(w.biteEnergy[biter]).toBeGreaterThan(0);
        expect(kick).toBeCloseTo(expected, 9);
        expect(expected).toBeGreaterThan(0);
        expect(w.lastLoss[biter]).toBe(LOSS_CAUSE.COST);
    });

    it('charges a bite that kills, from the victim energy read before the bite', () => {
        const { w, victim, kick, expected } = biteOnce({ victim: { energy: 3 } });
        expect(w.energy[victim]).toBeLessThanOrEqual(0);
        expect(kick).toBeCloseTo(expected, 9);
        expect(expected).toBeGreaterThan(0);
    });

    it('charges nothing at biteCost 0', () => {
        const { w, biter, kick } = biteOnce({ over: { biteCost: 0 } });
        expect(kick).toBe(0);
        expect(w.energy[biter]).toBe(BITER_ENERGY + w.biteEnergy[biter]);
    });

    it.each([
        ['the brain does not bite', { bite: false }],
        ['the biter cannot hunt', { biterSpec: FORAGER }],
        ['the victim is too big to bite', { victim: { energy: 4000 } }],
    ])('charges nothing on a refused bite: %s', (_name, what) => {
        const { w, biter, kick } = biteOnce(what);
        expect(w.biteEnergy[biter]).toBe(0);
        expect(kick).toBe(0);
        expect(w.energy[biter]).toBe(BITER_ENERGY);
    });

    it('costs more on a larger, fuller victim than on a smaller, starving one', () => {
        const small = biteOnce({ victim: { energy: 5 } });
        const big = biteOnce({ victim: { energy: 1500 } });
        expect(big.w.size[big.victim]).toBeGreaterThan(small.w.size[small.victim]);
        expect(big.kick).toBeGreaterThan(small.kick);
    });

    it('costs a defender-victim biter twice the kick, whatever the damage the defender takes', () => {
        const forager = biteOnce({ victim: { energy: 300 } });
        const defender = biteOnce({ victim: { energy: 300, spec: DEFENDER } });
        expect(defender.kick).toBeCloseTo(2 * forager.kick, 9);
        expect(defender.w.biteEnergy[defender.biter]).toBeLessThan(forager.w.biteEnergy[forager.biter]);
    });

    it('reads kickMultiplier from the victim specialisation config', () => {
        const base = biteOnce({ victim: { energy: 300 } });
        const doubled = biteOnce({
            victim: { energy: 300 },
            over: { specialisations: { forager: { kickMultiplier: 2 } } },
        });
        expect(doubled.kick).toBeCloseTo(2 * base.kick, 9);
    });

    it('keeps the energy ledger balanced', () => {
        const { w } = biteOnce();
        expect(imbalance(w)).toBeCloseTo(0, 9);
        expect(() => assertInvariants(w)).not.toThrow();
    });

    it('rejects a negative biteCost and a kickMultiplier of 0', () => {
        expect(() => lifeWorld({ biteCost: -1 })).toThrow(/biteCost/);
        expect(() => lifeWorld({ specialisations: { defender: { kickMultiplier: 0 } } })).toThrow(/kickMultiplier/);
    });
});
