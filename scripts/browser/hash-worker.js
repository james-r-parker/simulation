// Module worker for scripts/browser-hash.mjs: runs one golden world in the browser and posts its hash.
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';

/**
 * Runs the world described by a message.
 * @param {{ overrides: Record<string, unknown>, ticks: number }} job Config overrides and tick count.
 * @returns {string} The world hash after the run.
 */
function runJob(job) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ ...job.overrides, checkInvariants: false }), policy);
    for (let t = 0; t < job.ticks; t++) {
        step(world, policy);
    }
    return hashWorld(world);
}

self.onmessage = (event) => {
    try {
        self.postMessage({ worldHash: runJob(event.data) });
    } catch (error) {
        self.postMessage({ error: error instanceof Error ? error.message : String(error) });
    }
};
