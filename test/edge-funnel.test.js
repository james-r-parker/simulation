import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../js/sim/brain-layout.js';
import { LIVE_POLICY, getPolicy } from '../js/evo/policies/index.js';
import { createConfig } from '../js/sim/config.js';
import { createSimLog } from '../js/sim/log.js';
import { createWorld } from '../js/sim/spawn.js';
import { step } from '../js/sim/step.js';
import { createObserver, observerPhases } from '../js/evo/observer.js';
import { createRng, fork } from '../js/sim/rng.js';
import { SEX } from '../js/sim/sex.js';
import { CLASSES, createFunnel, sampleFunnel } from '../scripts/lib/edge-funnel.mjs';
import { feedPolicy } from '../scripts/lib/feed-policy.mjs';

/** @returns {Record<string, any>} a world a few ticks old */
function youngWorld() {
    const config = createConfig({ seed: 5 });
    const observer = createObserver(config, fork(createRng(5), 'eval'), { runTicks: 200, checkpointTicks: 1000 });
    const log = createSimLog(() => {}, { level: 'error' });
    const policy = getPolicy(LIVE_POLICY).create({ config, log, observer });
    const world = createWorld(config, policy.brain);
    feedPolicy({ policy, observer }, world);
    const phases = observerPhases(observer);
    for (let t = 0; t < 700; t++) {
        step(world, policy.brain, phases);
        feedPolicy({ policy, observer }, world);
    }
    return world;
}

describe('edge funnel', () => {
    it('puts every mature prey female in exactly one class and writes nothing to the world', () => {
        const world = youngWorld();
        const before = Array.from(world.energy);
        const funnel = createFunnel();
        sampleFunnel(funnel, world, new Int32Array(1000));
        const counted = CLASSES.reduce((n, c) => n + funnel.seen[c] + funnel.unseen[c], 0);
        let mature = 0;
        for (let slot = 0; slot < world.alive.length; slot++) {
            const prey = world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] !== 1;
            mature +=
                prey && world.sex[slot] === SEX.FEMALE && world.ageTicks[slot] >= world.config.maturityTicks ? 1 : 0;
        }
        expect(funnel.samples).toBe(1);
        expect(mature).toBeGreaterThan(0);
        expect(counted).toBe(mature);
        expect(Array.from(world.energy)).toEqual(before);
    });

    it('reads only as many prey as the scratch list holds', () => {
        const world = youngWorld();
        const funnel = createFunnel();
        sampleFunnel(funnel, world, new Int32Array(3));
        expect(funnel.prey).toBe(3);
    });
});

/**
 * Sets up the first two alive prey as a mature pair at one spot, ready to mate, and samples only them.
 * @param {Record<string, any>} world a world with mature prey
 * @param {(f: number, m: number) => void} tweak a change to the pair before it is sampled
 * @returns {{seen: Record<string, number>, unseen: Record<string, number>}} the funnel's counts
 */
function samplePair(world, tweak) {
    const slots = [];
    for (let slot = 0; slot < world.alive.length && slots.length < 2; slot++) {
        if (world.alive[slot] === 1 && world.huntBySpec[world.spec[slot]] !== 1) {
            slots.push(slot);
        }
    }
    const [f, m] = slots;
    for (const slot of slots) {
        world.ageTicks[slot] = world.config.maturityTicks + 10;
        world.pregnancy[slot] = 0;
        world.cooldown[slot] = 0;
        world.energy[slot] = 5000;
        world.temperature[slot] = 50;
        world.spec[slot] = world.spec[f];
        world.x[slot] = world.x[f];
        world.y[slot] = world.y[f];
        world.size[slot] = world.size[f];
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.MATE] = 1;
    }
    world.sex[f] = SEX.FEMALE;
    world.sex[m] = 1 - SEX.FEMALE;
    world.mateSeenAt[f] = world.tick - 1;
    tweak(f, m);
    const funnel = createFunnel();
    sampleFunnel(funnel, world, new Int32Array(2));
    return funnel;
}

describe('edge funnel classes', () => {
    const world = youngWorld();
    const first = (/** @type {Record<string, number>} */ counts) => Object.keys(counts).find((c) => counts[c] > 0);
    const cases = /** @type {[string, (f: number, m: number) => void][]} */ ([
        ['pregnant', (f) => (world.pregnancy[f] = 1)],
        ['cooldown', (f) => (world.cooldown[f] = 5)],
        ['energy', (f) => (world.energy[f] = 0)],
        ['cold', (f) => (world.temperature[f] = 0)],
        ['heat', (f) => (world.temperature[f] = 99)],
        ['female-unwilling', (f) => (world.outputs[f * OUTPUT_COUNT + OUTPUT_INDEX.MATE] = -1)],
        ['male-not-ready', (_f, m) => (world.cooldown[m] = 5)],
        ['male-unwilling', (_f, m) => (world.outputs[m * OUTPUT_COUNT + OUTPUT_INDEX.MATE] = -1)],
        ['pair-blocked', (_f, m) => (world.size[m] = world.size[m] * 10)],
        ['no-male-in-reach', (_f, m) => (world.x[m] = world.x[m] + 1e6)],
    ]);

    it.each(cases)('files a seen female under %s', (name, tweak) => {
        const funnel = samplePair(world, tweak);
        expect(first(funnel.seen)).toBe(name);
        expect(first(funnel.unseen)).toBeUndefined();
    });

    it('files a ready pair under mates, and an unseen female on the unseen side', () => {
        const funnel = samplePair(world, () => {});
        expect(['mates', 'pair-blocked']).toContain(first(funnel.seen));
        const unseen = samplePair(world, (f) => (world.mateSeenAt[f] = 0));
        expect(first(unseen.seen)).toBeUndefined();
        expect(Object.values(unseen.unseen).reduce((a, b) => a + b, 0)).toBe(1);
    });
});
