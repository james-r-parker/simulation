import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import { feed } from '../../js/sim/feeding.js';
import { ENERGY_SOURCE, LOSS_CAUSE, addEnergy } from '../../js/sim/energy.js';
import { buildHash, createSpatialHash } from '../../js/sim/spatial-hash.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

const PREDATOR = 1;
const MAX = 1000;
const NEUTRAL = {
    huntSizeRatio: 1.01,
    biteCost: 0,
    maxEnergy: MAX,
    specialisations: { predator: { biteMultiplier: 1, turnMultiplier: 1, sprintBoost: 1, maxEnergyMultiplier: 1 } },
};

/**
 * One predator biting one forager in contact.
 * @param {Record<string, any>} over config overrides
 * @param {{hunter: number, prey: number}} energy the two stores
 * @returns {ReturnType<typeof smallWorld>} the world
 */
function duel(over, { hunter, prey }) {
    const w = smallWorld({ ...NEUTRAL, ...over });
    for (const [slot, energy, spec, x] of [
        [allocBody(w), hunter, PREDATOR, 100],
        [allocBody(w), prey, 0, 110],
    ]) {
        w.x[slot] = x;
        w.y[slot] = 100;
        w.spec[slot] = spec;
        w.genomeId[slot] = slot + 1;
        addEnergy(w, slot, energy, ENERGY_SOURCE.INITIAL);
        w.ateTimer[slot] = 30;
        w.bittenTimer[slot] = 30;
    }
    w.outputs[0 * OUTPUT_COUNT + OUTPUT_INDEX.BITE] = 1;
    w.contacts[0] = 0;
    w.contacts[1] = 1;
    w.contactCount = 1;
    return w;
}

/** @param {ReturnType<typeof smallWorld>} w */
function bite(w) {
    const hash = createSpatialHash(w.config);
    buildHash(hash, w);
    feed(w, hash);
}

describe('a kill', () => {
    it('mints nothing: the biter gains only the victim energy it took', () => {
        const w = duel({}, { hunter: 600, prey: 5 });
        const before = w.ledger[0];
        bite(w);
        expect(w.energy[1]).toBe(0);
        expect(w.energy[0]).toBe(605);
        expect(w.ledger[0]).toBe(before);
        expect(w.ledger[0] - w.ledger[1]).toBeCloseTo(w.energy[0] + w.energy[1], 9);
    });
});

describe('killShare', () => {
    const line = 0.25 * MAX;

    it('leaves a bite that stays above the line a plain bite', () => {
        const w = duel({ killShare: 0.25 }, { hunter: 600, prey: line + 3 * w0() });
        bite(w);
        expect(w.energy[1]).toBe(line + 2 * w0());
        expect(w.carcassHeld[1]).toBe(0);
        expect(w.fatalBiteObservations[3]).toBe(0);
    });

    it('kills a victim a bite leaves under the line and empties its store', () => {
        const b = w0();
        const w = duel({ killShare: 0.25 }, { hunter: 600, prey: line + b / 2 });
        bite(w);
        expect(w.energy[1]).toBe(0);
        expect(w.lastLoss[1]).toBe(LOSS_CAUSE.BITE);
        expect(w.fatalBiteObservations[3]).toBe(1);
        const taken = line + b / 2;
        expect(w.energy[0] + w.carcassHeld[1]).toBeCloseTo(600 + taken, 6);
    });

    it('stops the take at killGorgeCap and holds the rest for the carcass', () => {
        const b = w0();
        const w = duel({ killShare: 0.25, killGorgeCap: 100 }, { hunter: 600, prey: line + b / 2 });
        bite(w);
        const remaining = line + b / 2 - b;
        expect(w.energy[0]).toBeCloseTo(600 + b + 100, 6);
        expect(w.carcassHeld[1]).toBeCloseTo(remaining - 100, 6);
        expect(w.biteEnergy[0]).toBeCloseTo(b + 100, 6);
    });

    it('stops the take at killGorgeShare x victimEnergy and holds the rest for the carcass', () => {
        const b = w0();
        const w = duel(
            { killShare: 0.25, killGorgeCap: 2000, killGorgeShare: 0.25 },
            { hunter: 600, prey: line + b / 2 },
        );
        bite(w);
        const remaining = line + b / 2 - b;
        const shareTaken = 0.25 * remaining;
        expect(w.energy[0]).toBeCloseTo(600 + b + shareTaken, 6);
        expect(w.carcassHeld[1]).toBeCloseTo(remaining - shareTaken, 6);
        expect(w.biteEnergy[0]).toBeCloseTo(b + shareTaken, 6);
    });

    it('stops the take at the killer headroom, not at overflow', () => {
        const b = w0();
        const w = duel({ killShare: 0.25 }, { hunter: MAX - b - 10, prey: line + b / 2 });
        bite(w);
        expect(w.energy[0]).toBeCloseTo(MAX, 6);
        expect(w.carcassHeld[1]).toBeCloseTo(line + b / 2 - b - 10, 6);
    });

    it('keeps the energy ledger balanced across a kill', () => {
        const b = w0();
        const w = duel({ killShare: 0.25, killGorgeCap: 100 }, { hunter: 600, prey: line + b / 2 });
        bite(w);
        expect(w.carcassHeld[1]).toBeGreaterThan(0);
        expect(w.ledger[0] - w.ledger[1]).toBeCloseTo(w.energy[0] + w.energy[1], 9);
    });

    it('is the plain kill at killShare 0: a victim above empty is not killed', () => {
        const b = w0();
        const w = duel({ killShare: 0 }, { hunter: 600, prey: b + 1 });
        bite(w);
        expect(w.energy[1]).toBe(1);
        expect(w.carcassHeld[1]).toBe(0);
    });
});

/** @returns {number} the bite energy the neutral predator lands (config biteEnergy x 1) */
function w0() {
    return smallWorld(NEUTRAL).config.biteEnergy;
}
