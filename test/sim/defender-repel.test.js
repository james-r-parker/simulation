// Active defender repel (prey-guilds.md Phase 2, T4): a defender holding `BITE > 0` with a `canHunt` target
// in its jaws drains `defenderRepelEnergy`, applies `defenderRepelImpulse`, and pays `defenderRepelCost`;
// non-hunters and targets outside jaws are untouched.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { feed } from '../../js/sim/feeding.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

const FORAGER = 0;
const PREDATOR = 1;
const DEFENDER = 4;

/**
 * @param {Record<string, any>} over
 * @param {{defenderAngle?: number, targetSpec?: number, targetX?: number, bite?: boolean}} opts
 * @returns {ReturnType<typeof smallWorld>}
 */
function setupPair(over, { defenderAngle = 0, targetSpec = PREDATOR, targetX = 110, bite = true } = {}) {
    const w = smallWorld({
        biteCost: 0,
        recoilEnergy: 0,
        defenderRepelEnergy: 40,
        defenderRepelCost: 5,
        defenderRepelImpulse: 4,
        ...over,
    });
    const def = allocBody(w);
    const other = allocBody(w);
    for (const [slot, spec, x, energy] of [
        [def, DEFENDER, 100, 500],
        [other, targetSpec, targetX, 500],
    ]) {
        w.x[slot] = x;
        w.y[slot] = 100;
        w.spec[slot] = spec;
        w.genomeId[slot] = slot + 1;
        addEnergy(w, slot, energy, ENERGY_SOURCE.INITIAL);
        w.ateTimer[slot] = 30;
        w.bittenTimer[slot] = 30;
    }
    w.angle[def] = defenderAngle;
    w.outputs[def * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = bite ? 1 : 0;
    w.contacts[0] = def;
    w.contacts[1] = other;
    w.contactCount = 1;
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
    return w;
}

describe('tryDefenderRepel', () => {
    it('drains energy and knocks back a hunter in jaws while charging defenderRepelCost', () => {
        const w = setupPair({});
        expect(w.energy[0]).toBe(495);
        expect(w.energy[1]).toBe(460);
        expect(w.vx[1]).toBeCloseTo(4, 6);
        expect(w.vy[1]).toBeCloseTo(0, 6);
    });

    it('ignores non-hunters and hunters outside jaws or when BITE <= 0', () => {
        const nonHunter = setupPair({}, { targetSpec: FORAGER });
        expect(nonHunter.energy[0]).toBe(500);
        expect(nonHunter.energy[1]).toBe(500);
        expect(nonHunter.vx[1]).toBe(0);

        const behind = setupPair({}, { defenderAngle: Math.PI });
        expect(behind.energy[0]).toBe(500);
        expect(behind.energy[1]).toBe(500);
        expect(behind.vx[1]).toBe(0);

        const passive = setupPair({}, { bite: false });
        expect(passive.energy[0]).toBe(500);
        expect(passive.energy[1]).toBe(500);
        expect(passive.vx[1]).toBe(0);
    });
});
