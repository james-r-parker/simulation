import { describe, expect, it } from 'vitest';
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
