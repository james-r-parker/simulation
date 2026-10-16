import { seedArchive } from '../../../js/evo/archive.js';
import { createMapElitesV1 } from '../../../js/evo/policies/map-elites-v1.js';
import { createSimLog } from '../../../js/sim/log.js';
import { smallWorld } from '../../sim/helpers/small-world.js';

/**
 * @param {Record<string, any>} [observed] extra policy options
 * @returns {{policy: any, world: any, records: any[]}} a policy on an empty 8-slot world, with its debug log records
 */
export function setup(observed = {}) {
    const world = smallWorld({ brainHidden: 4, maxAgents: 8 });
    /** @type {any[]} */
    const records = [];
    const log = createSimLog((r) => records.push(r), { level: 'debug' });
    const policy = createMapElitesV1({ config: world.config, log, ...observed });
    return { policy, world, records };
}

/**
 * Puts one elite in each of `count` cells of specialisation `spec` (ids start at `spec * 1000 + 1`).
 * @param {any} policy the policy
 * @param {{spec: number, count: number}} what the specialisation and how many cells
 * @returns {void}
 */
export function fill(policy, { spec, count }) {
    const { archive } = policy;
    for (let cell = 0; cell < count; cell++) {
        const weights = new Float32Array(archive.layout.weightCount).fill(0.25);
        seedArchive(archive, { spec, cell, id: spec * 1000 + cell + 1, sigma: 0.07, weights });
    }
}
