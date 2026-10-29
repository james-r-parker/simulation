import { allocBody } from './helpers/body.js';
import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { smallWorld } from './helpers/small-world.js';

const PREDATOR = 1;
const ARC = Math.PI / 4;

/**
 * A predator at (100, 100) facing +x bites a smaller forager at the given offset.
 * @param {number} dx the victim's x offset from the biter
 * @param {number} dy the victim's y offset from the biter
 * @param {Record<string, any>} [over] config overrides
 * @returns {boolean} whether the victim lost energy
 */
function bitten(dx, dy, over = {}) {
    const w = smallWorld({ biteArc: ARC, ...over });
    const biter = allocBody(w);
    const victim = allocBody(w);
    for (const [slot, x, y, energy, spec] of [
        [biter, 100, 100, 2000, PREDATOR],
        [victim, 100 + dx, 100 + dy, 50, 0],
    ]) {
        w.x[slot] = x;
        w.y[slot] = y;
        w.angle[slot] = 0;
        w.spec[slot] = spec;
        w.genomeId[slot] = slot + 1;
        addEnergy(w, slot, energy, ENERGY_SOURCE.INITIAL);
    }
    w.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    w.contacts[0] = biter;
    w.contacts[1] = victim;
    w.contactCount = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    const before = w.energy[victim];
    feed(w, hash);
    return w.energy[victim] < before;
}

describe('feed: jaws', () => {
    it('bites a victim straight ahead', () => {
        expect(bitten(10, 0)).toBe(true);
    });

    it('misses a victim directly behind', () => {
        expect(bitten(-10, 0)).toBe(false);
    });

    it('misses a victim at the side, outside the arc', () => {
        expect(bitten(0, 10)).toBe(false);
        expect(bitten(0, -10)).toBe(false);
    });

    it('bites a victim off-axis but inside the arc, and misses just outside it', () => {
        const inside = ARC - 0.05;
        const outside = ARC + 0.05;
        expect(bitten(10 * Math.cos(inside), 10 * Math.sin(inside))).toBe(true);
        expect(bitten(10 * Math.cos(-inside), 10 * Math.sin(-inside))).toBe(true);
        expect(bitten(10 * Math.cos(outside), 10 * Math.sin(outside))).toBe(false);
        expect(bitten(10 * Math.cos(-outside), 10 * Math.sin(-outside))).toBe(false);
    });

    it('follows the biter heading, not the world axes', () => {
        const w = smallWorld({ biteArc: ARC });
        const biter = allocBody(w);
        const victim = allocBody(w);
        w.x[biter] = 100;
        w.y[biter] = 100;
        w.angle[biter] = Math.PI / 2;
        w.spec[biter] = PREDATOR;
        w.x[victim] = 100;
        w.y[victim] = 110;
        addEnergy(w, biter, 2000, ENERGY_SOURCE.INITIAL);
        addEnergy(w, victim, 50, ENERGY_SOURCE.INITIAL);
        w.genomeId[biter] = 1;
        w.genomeId[victim] = 2;
        w.outputs[biter * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
        w.contacts[0] = biter;
        w.contacts[1] = victim;
        w.contactCount = 1;
        const hash = createSpatialHash(w.config);
        buildHash(hash, w);
        feed(w, hash);
        expect(w.energy[victim]).toBeLessThan(50);
    });

    it('restores any-direction contact when biteArc is PI', () => {
        expect(bitten(-10, 0, { biteArc: Math.PI })).toBe(true);
        expect(bitten(0, 10, { biteArc: Math.PI })).toBe(true);
    });
});
