import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { advanceEra, basinOf, patchRegrowFactor, yearTicks } from '../../js/sim/eras.js';
import { seasonAt } from '../../js/sim/environment.js';
import { EVENT_TYPE, readEvents } from '../../js/sim/events.js';
import { regrowPatches } from '../../js/sim/food-patches.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { smallWorld } from './helpers/small-world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const ERAS = {
    eraSeasonTicks: 100,
    foodPatchCount: 2,
    foodPatchRadius: 100,
    foodPatchRegrow: 0.01,
    foodPatchCapacity: 1,
};

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof smallWorld>} a world with a west patch (index 0) and an east patch (index 1)
 */
function eraWorld(over = {}) {
    const w = smallWorld({ ...ERAS, ...over });
    w.patchX[0] = 200;
    w.patchX[1] = 800;
    return w;
}

/**
 * Moves the world to a tick, as `environment` does, then runs the era step.
 * @param {ReturnType<typeof smallWorld>} w the world
 * @param {number} tick the tick
 * @returns {void}
 */
function at(w, tick) {
    w.tick = tick;
    w.events.count = 0;
    seasonAt(w, tick);
    advanceEra(w);
}

/**
 * @param {ReturnType<typeof smallWorld>} w the world
 * @returns {number[][]} the events as [type, tick, a, b]
 */
function events(w) {
    return Array.from({ length: readEvents(w.events) }, (_, i) =>
        Array.from(w.events.data.subarray(i * 12, i * 12 + 4)),
    );
}

describe('eras config', () => {
    it('defaults to the doc values', () => {
        const c = createConfig({ ...SIMPLE_WORLD });
        expect([c.eraSeasonTicks, c.winterRegrow, c.droughtChance]).toEqual([36000, 0.2, 0.25]);
    });

    it.each([
        ['eraSeasonTicks', 0],
        ['winterRegrow', -1],
        ['droughtChance', 1.5],
    ])('rejects %s of %s', (key, value) => {
        expect(() => createConfig({ ...SIMPLE_WORLD, [key]: value })).toThrow(new RegExp(`config\\.${key}`));
    });

    it('makes a year of four eraSeasonTicks seasons', () => {
        expect(yearTicks(createConfig({ ...SIMPLE_WORLD }))).toBe(144000);
    });
});

describe('patchRegrowFactor', () => {
    it('is winterRegrow in winter, 1.5 in summer and 1 in spring and autumn', () => {
        const w = eraWorld();
        const factors = [0, 1, 2, 3].map((s) => {
            w.season[0] = s;
            return patchRegrowFactor(w, 0);
        });
        expect(factors).toEqual([1, 1.5, 1, 0.2]);
    });

    it('is 0 for the patches of the basin under drought only', () => {
        const w = eraWorld();
        w.season[0] = 1;
        w.era[0] = basinOf(w, 800);
        expect([patchRegrowFactor(w, 0), patchRegrowFactor(w, 1)]).toEqual([1.5, 0]);
    });

    it('scales regrowPatches', () => {
        const w = eraWorld();
        w.patchStock.fill(0.5);
        w.season[0] = 3;
        regrowPatches(w);
        expect(w.patchStock[0]).toBeCloseTo(0.5 + w.patchRegrow[0] * 0.01 * 0.2 * 0.25, 12);
        w.era[0] = 0;
        const before = w.patchStock[0];
        regrowPatches(w);
        expect(w.patchStock[0]).toBe(before);
    });
});

describe('advanceEra', () => {
    it('pushes SeasonChanged on each boundary after tick 0 and nothing between', () => {
        const w = eraWorld({ droughtChance: 0 });
        at(w, 0);
        expect(events(w)).toEqual([]);
        at(w, 50);
        expect(events(w)).toEqual([]);
        at(w, 100);
        expect(events(w)).toEqual([[EVENT_TYPE.SEASON_CHANGED, 100, 1, 0]]);
        at(w, 400);
        expect(events(w)).toEqual([[EVENT_TYPE.SEASON_CHANGED, 400, 0, 1]]);
    });

    it('starts a drought at the start of summer when the chance is 1, and ends it at autumn', () => {
        const w = eraWorld({ droughtChance: 1 });
        at(w, 100);
        const [season, drought] = events(w);
        expect(season[0]).toBe(EVENT_TYPE.SEASON_CHANGED);
        expect(drought.slice(0, 2)).toEqual([EVENT_TYPE.DROUGHT_STARTED, 100]);
        expect([0, 1]).toContain(w.era[0]);
        expect(drought[2]).toBe(w.era[0]);
        at(w, 200);
        expect(w.era[0]).toBe(-1);
    });

    it('picks either basin across seeds', () => {
        const basins = new Set();
        for (let seed = 1; seed <= 20; seed++) {
            const w = eraWorld({ droughtChance: 1, seed });
            at(w, 100);
            basins.add(w.era[0]);
        }
        expect([...basins].sort()).toEqual([0, 1]);
    });

    it('never starts a drought at a chance of 0', () => {
        const w = eraWorld({ droughtChance: 0 });
        at(w, 100);
        expect(w.era[0]).toBe(-1);
    });

    it('hashes the drought state', () => {
        const w = eraWorld();
        const h = hashWorld(w);
        w.era[0] = 1;
        expect(hashWorld(w)).not.toBe(h);
    });
});
