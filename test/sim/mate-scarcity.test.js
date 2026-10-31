import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { mateScarce } from '../../js/sim/mate-scarcity.js';
import { splitAll, splitGateOpen } from '../../js/sim/reproduction.js';
import { senseAll } from '../../js/sim/sensors.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { freeAgent } from '../../js/sim/world.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const SCARCE = 300;
const MATURE = 10;
const PREDATOR = createConfig().specialisations.predator.index;
const FORAGER = createConfig().specialisations.forager.index;

/**
 * A world with the shark rule on and one ready female forager at (500, 500).
 * @param {Record<string, any>} [over] config overrides
 * @returns {{w: any, slot: number}} the world and the female
 */
function sharkWorld(over = {}) {
    const w = lifeWorld({
        splitDeliberateMin: 0,
        splitDeliberateShareMin: 0,
        splitMinEnergy: 200,
        maturityTicks: MATURE,
        splitMateScarceTicks: SCARCE,
        ...over,
    });
    const slot = addBlob(w, { energy: 1000, spec: FORAGER, ageTicks: MATURE });
    return { w, slot };
}

/**
 * Runs the sensors at a tick, so each agent notes the mates its rays gather.
 * @param {any} w the world
 * @param {number} tick the tick
 * @returns {void}
 */
function senseAt(w, tick) {
    w.tick = tick;
    buildHash(w.hash, w);
    senseAll(w, w.hash);
}

describe('mateScarce', () => {
    it('opens the split only after splitMateScarceTicks without a mate in view', () => {
        const { w, slot } = sharkWorld();
        senseAt(w, 0);
        expect(mateScarce(w, slot)).toBe(false);
        senseAt(w, SCARCE - 1);
        expect(mateScarce(w, slot)).toBe(false);
        senseAt(w, SCARCE);
        expect(mateScarce(w, slot)).toBe(true);
        expect(splitGateOpen(w, slot)).toBe(true);
    });

    it('stays closed while a mature agent of its own type and the other sex is in view', () => {
        const { w, slot } = sharkWorld();
        addBlob(w, { spec: FORAGER, ageTicks: MATURE, x: 560, y: 500 });
        for (let t = 0; t <= 2 * SCARCE; t += 50) {
            senseAt(w, t);
        }
        expect(mateScarce(w, slot)).toBe(false);
        expect(splitGateOpen(w, slot)).toBe(false);
    });

    it('does not count another type, the same sex, an immature agent or one out of view as a mate', () => {
        const { w, slot } = sharkWorld();
        addBlob(w, { spec: PREDATOR, ageTicks: MATURE, x: 560, y: 500 });
        addBlob(w, { spec: FORAGER, ageTicks: MATURE, x: 500, y: 560, sex: w.sex[slot] });
        addBlob(w, { spec: FORAGER, ageTicks: 0, x: 440, y: 500 });
        addBlob(w, { spec: FORAGER, ageTicks: MATURE, x: 2900, y: 500 });
        senseAt(w, SCARCE);
        expect(mateScarce(w, slot)).toBe(true);
    });

    it('starts a newborn waiting from its birth, and a wait of 0 is always open', () => {
        const { w, slot } = sharkWorld();
        senseAt(w, SCARCE);
        splitAll(w, recordingPolicy([]));
        const child = w.genomeId.indexOf(w.nextId - 1);
        expect(child).not.toBe(slot);
        w.ageTicks[child] = MATURE;
        expect(mateScarce(w, child)).toBe(false);
        const off = sharkWorld({ splitMateScarceTicks: 0 });
        expect(mateScarce(off.w, off.slot)).toBe(true);
        freeAgent(w, child);
        expect(w.mateSeenAt[child]).toBe(0);
    });

    it('rejects a negative or fractional wait, and waits 600 ticks by default', () => {
        expect(() => createConfig({ splitMateScarceTicks: -1 })).toThrow(/splitMateScarceTicks/);
        expect(() => createConfig({ splitMateScarceTicks: 1.5 })).toThrow(/splitMateScarceTicks/);
        expect(createConfig({}).splitMateScarceTicks).toBe(600);
    });
});
