import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { specParams } from '../../js/sim/spec-params.js';
import {
    createLifeCounters,
    crowdingMean,
    resetLifeSlot,
    speedMean,
    updateLifeCounters,
} from '../../js/evo/life-counters.js';
import { addBorn, nextTick, observed, pushBorn } from './helpers/observer-world.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

/** @returns {{world: any, observer: any, counters: any}} */
function setup() {
    const { world, observer } = observed({ worldWidth: 1000, worldHeight: 1000 });
    return { world, observer, counters: createLifeCounters(world.config) };
}

describe('createLifeCounters', () => {
    it('sizes the cell bitset for 300 px cells: 48 x 27 on the default world', () => {
        const counters = createLifeCounters(createConfig({ ...FEATURES_OFF }));
        expect([counters.cellCols, counters.cellRows, counters.cellBytes]).toEqual([48, 27, 162]);
    });
});

describe('cells300', () => {
    it('counts distinct 300 px cells, sampled every 10 ticks', () => {
        const { world, counters } = setup();
        const slot = addBlob(world, { x: 100, y: 100 });
        nextTick(world, 5);
        updateLifeCounters(counters, world);
        expect(counters.cells300[slot]).toBe(0);
        const path = [100, 250, 350, 350, 650];
        path.forEach((x, i) => {
            world.x[slot] = x;
            nextTick(world, 10 * (i + 1));
            updateLifeCounters(counters, world);
        });
        expect(counters.cells300[slot]).toBe(3);
    });

    it('does not count the same cell twice and clamps positions into the grid', () => {
        const { world, counters } = setup();
        const slot = addBlob(world, { x: 10, y: 10 });
        world.x[slot] = 5000;
        nextTick(world, 10);
        updateLifeCounters(counters, world);
        updateLifeCounters(counters, world);
        expect(counters.cells300[slot]).toBe(1);
    });
});

describe('kinBitesAbsorbed', () => {
    const bitten = { bittenTimer: 1 };

    it('counts a bite this tick when a kin agent is within 300 px', () => {
        const { world, counters } = setup();
        const victim = addBlob(world, { ...bitten, genomeId: 50 });
        addBlob(world, { x: 700, parentA: 50 });
        nextTick(world, 1);
        updateLifeCounters(counters, world);
        const nominal = world.config.biteEnergy * specParams(world.config, world.spec[victim]).biteTakenMultiplier;
        expect(counters.kinBitesAbsorbed[victim]).toBeCloseTo(nominal, 9);
        expect(nominal).toBeGreaterThan(0);
    });

    it('counts nothing with no kin, with kin too far, or with a non-kin agent near', () => {
        const { world, counters } = setup();
        const victim = addBlob(world, { ...bitten, genomeId: 50 });
        addBlob(world, { x: 520 });
        addBlob(world, { x: 900, parentA: 50 });
        nextTick(world, 1);
        updateLifeCounters(counters, world);
        expect(counters.kinBitesAbsorbed[victim]).toBe(0);
    });

    it('counts nothing when the agent was not bitten this tick', () => {
        const { world, counters } = setup();
        const victim = addBlob(world, { bittenTimer: 2, genomeId: 50 });
        addBlob(world, { x: 520, parentA: 50 });
        nextTick(world, 1);
        updateLifeCounters(counters, world);
        expect(counters.kinBitesAbsorbed[victim]).toBe(0);
    });
});

describe('speedMean', () => {
    it('is speedSum over samples, clamped to 1, and 0 without samples', () => {
        const { observer } = setup();
        observer.speedSum[0] = 3;
        observer.samples[0] = 4;
        observer.speedSum[1] = 5;
        observer.samples[1] = 4;
        expect(speedMean(observer, 0)).toBe(0.75);
        expect(speedMean(observer, 1)).toBe(1);
        expect(speedMean(observer, 2)).toBe(0);
    });
});

describe('crowdingMean', () => {
    /**
     * @param {any} world
     * @param {number} slot
     * @param {number} ray
     * @param {number} proximity
     * @param {number} channel
     */
    function setRay(world, slot, ray, proximity, channel) {
        const base = slot * world.layout.inputCount + ray * RAY_CHANNELS;
        world.inputs[base] = proximity;
        // Agent class channels carry the hit's proximity; food, wall, obstacle and smoke carry 1.
        world.inputs[base + channel] = channel >= 2 && channel <= 5 ? proximity : 1;
    }

    it('averages the highest agent-ray proximity every 100 ticks, ignoring food and walls', () => {
        const { world, counters } = setup();
        const slot = addBlob(world);
        setRay(world, slot, 0, 0.9, 1);
        setRay(world, slot, 1, 0.4, 3);
        setRay(world, slot, 2, 0.6, 5);
        setRay(world, slot, 3, 0.95, 6);
        nextTick(world, 50);
        updateLifeCounters(counters, world);
        expect(counters.crowdingSamples[slot]).toBe(0);
        nextTick(world, 100);
        updateLifeCounters(counters, world);
        expect(crowdingMean(counters, slot)).toBeCloseTo(0.6, 6);
        world.inputs.fill(0);
        nextTick(world, 200);
        updateLifeCounters(counters, world);
        expect(crowdingMean(counters, slot)).toBeCloseTo(0.3, 6);
    });

    it('is 0 without samples', () => {
        expect(crowdingMean(setup().counters, 0)).toBe(0);
    });
});

describe('births', () => {
    it('zeroes a slot on AgentBorn, and a slot refilled in one tick keeps only the newborn', () => {
        const { world, counters } = setup();
        const slot = addBlob(world, { x: 100, y: 100 });
        nextTick(world, 10);
        updateLifeCounters(counters, world);
        expect(counters.cells300[slot]).toBe(1);
        world.x[slot] = 800;
        nextTick(world, 20);
        pushBorn(world, { slot, genomeId: 99 });
        updateLifeCounters(counters, world);
        expect(counters.cells300[slot]).toBe(1);
        world.x[slot] = 800;
        nextTick(world, 30);
        updateLifeCounters(counters, world);
        expect(counters.cells300[slot]).toBe(1);
    });

    it('resetLifeSlot zeroes every counter of one slot only', () => {
        const { world, counters } = setup();
        const a = addBorn(world);
        const b = addBlob(world);
        for (const s of [a, b]) {
            counters.cells300[s] = 2;
            counters.kinBitesAbsorbed[s] = 3;
            counters.crowdingSum[s] = 1;
            counters.crowdingSamples[s] = 2;
            counters.cellBits[s * counters.cellBytes] = 7;
        }
        resetLifeSlot(counters, a);
        expect([counters.cells300[a], counters.kinBitesAbsorbed[a], crowdingMean(counters, a)]).toEqual([0, 0, 0]);
        expect(counters.cellBits[a * counters.cellBytes]).toBe(0);
        expect(counters.cells300[b]).toBe(2);
        expect(counters.cellBits[b * counters.cellBytes]).toBe(7);
    });
});
