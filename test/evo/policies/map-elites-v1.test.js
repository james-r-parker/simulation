import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { occupiedCount } from '../../../js/evo/archive.js';
import { createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { POLICIES } from '../../../js/evo/policies/index.js';
import { createMapElitesV1 } from '../../../js/evo/policies/map-elites-v1.js';
import { createConfig } from '../../../js/sim/config.js';
import { createSimLog } from '../../../js/sim/log.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';
import { hashWorld } from '../../../js/sim/world-hash.js';
import { runReplay } from '../../../scripts/replay.mjs';
import { dispatchEvents, runSeed } from '../../../scripts/eval-worker.mjs';
import { setup } from '../helpers/map-elites-world.js';

const OVERRIDES = {
    maxAgents: 60,
    initialAgents: 30,
    minAgents: 10,
    rayCount: 4,
    brainHidden: 6,
    worldWidth: 2400,
    worldHeight: 1600,
    maxFood: 120,
    initialFood: 80,
    obstacleCount: 4,
};

describe('map-elites-v1 shape', () => {
    it('is registered and exposes the archive and the per-slot state', () => {
        const { policy } = setup();
        expect(POLICIES['map-elites-v1'].create).toBe(createMapElitesV1);
        expect(policy.name).toBe('map-elites-v1');
        expect(policy.fitnessName).toBe('v1');
        expect(occupiedCount(policy.archive)).toBe(0);
        expect(policy.sigma).toHaveLength(8);
        expect(policy.fatherSigma).toHaveLength(8);
        expect(policy.archiveRef.every((/** @type {number} */ v) => v === -1)).toBe(true);
        expect(policy.isClone).toHaveLength(8);
        expect(policy.refId).toHaveLength(8);
    });
});

/**
 * @param {number} seed the world seed
 * @param {number} ticks ticks to run
 * @returns {{policy: any, hash: string, records: any[]}} the policy after an eval-style run
 */
function evalRun(seed, ticks) {
    const config = createConfig({ ...OVERRIDES, seed });
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    /** @type {any[]} */
    const records = [];
    const log = createSimLog((r) => records.push(r), { level: 'debug' });
    const policy = createMapElitesV1({ config, log, observer });
    const world = createWorld(config, policy.brain);
    const phases = observerPhases(observer);
    observe(observer, world, policy.fitness);
    dispatchEvents(policy, world);
    for (let t = 0; t < ticks; t++) {
        step(world, policy.brain, phases);
        observe(observer, world, policy.fitness);
        dispatchEvents(policy, world);
        policy.afterStep(world);
    }
    return { policy, hash: String(hashWorld(world)), records };
}

describe('a real run', () => {
    it('fills archive cells, seeds from them, and is deterministic', { timeout: 60000 }, () => {
        const a = evalRun(3, 6000);
        const b = evalRun(3, 6000);
        expect(occupiedCount(a.policy.archive)).toBeGreaterThan(0);
        expect(a.records.some((r) => r.event === 'ImmigrantSeeded')).toBe(true);
        expect(a.hash).toBe(b.hash);
        expect(Array.from(a.policy.archive.occupied)).toEqual(Array.from(b.policy.archive.occupied));
        expect(Array.from(a.policy.archive.ids)).toEqual(Array.from(b.policy.archive.ids));
    });

    it('replays an eval run to the same world hash', { timeout: 60000 }, async () => {
        const evaled = runSeed({ seed: 3, ticks: 3000, policy: 'map-elites-v1', overrides: OVERRIDES });
        const dir = mkdtempSync(join(tmpdir(), 'me-replay-'));
        const replayed = await runReplay({
            seed: 3,
            ticks: 3000,
            policy: 'map-elites-v1',
            configOverrides: OVERRIDES,
            logDir: join(dir, 'logs'),
            dumpDir: join(dir, 'dumps'),
        });
        expect(replayed.finalHash).toBe(String(evaled.worldHash));
    });
});
