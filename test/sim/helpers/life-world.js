import { OUTPUT_COUNT } from '../../../js/sim/brain-layout.js';
import { allocAgent } from '../../../js/sim/world.js';
import { ENERGY_SOURCE, addEnergy } from '../../../js/sim/energy.js';
import { smallWorld } from './small-world.js';

/**
 * A policy that records its hook calls into `log` and copies the mother's weights into the child.
 * @param {string[]} log receives one entry per hook call
 * @returns {any}
 */
export function recordingPolicy(log) {
    return {
        initBrain() {},
        onMate: (/** @type {any} */ _w, /** @type {number} */ m, /** @type {number} */ f) => log.push(`mate ${m} ${f}`),
        childBrain: (/** @type {any} */ w, /** @type {number} */ c, /** @type {number} */ m, /** @type {any} */ o) => {
            log.push(`brain ${c} ${m} ${o.cause} ${o.rng === w.rng.mutation} ${w.parentA[c]} ${w.spec[c]}`);
            const n = w.layout.weightCount;
            w.weights.set(w.weights.subarray(m * n, (m + 1) * n), c * n);
        },
        onDeath: (/** @type {any} */ w, /** @type {number} */ s, /** @type {number} */ cause) =>
            log.push(`death ${s} ${cause} ${w.alive[s]} ${w.energy[s]}`),
    };
}

/**
 * Builds a small world with no agents.
 * @param {Record<string, any>} [over] config overrides
 * @returns {any}
 */
export function lifeWorld(over = {}) {
    return smallWorld({ maturityTicks: 0, minAgents: 0, ...over });
}

/**
 * Adds a mature agent with energy and, optionally, a mate output.
 * @param {any} w the world
 * @param {Record<string, number>} [fields] per-slot array values to set
 * @returns {number} the slot
 */
export function addBlob(w, fields = {}) {
    const slot = allocAgent(w);
    w.genomeId[slot] = w.nextId++;
    w.lineageId[slot] = w.genomeId[slot];
    w.x[slot] = 500;
    w.y[slot] = 500;
    w.temperature[slot] = w.config.temperatureStart;
    addEnergy(w, slot, 1000, ENERGY_SOURCE.INITIAL);
    for (const [k, v] of Object.entries(fields)) {
        if (k === 'mateOut') {
            w.outputs[slot * OUTPUT_COUNT + 3] = v;
        } else if (k === 'energy') {
            w.ledger[0] += v - w.energy[slot];
            w.energy[slot] = v;
        } else {
            w[k][slot] = v;
        }
    }
    return slot;
}

/**
 * @param {any} w the world
 * @returns {number} agent energy plus ledger outflow minus ledger inflow (zero when the books balance)
 */
export function imbalance(w) {
    let held = 0;
    for (let s = 0; s < w.alive.length; s++) {
        held += w.energy[s];
    }
    return held + w.ledger[1] - w.ledger[0];
}
