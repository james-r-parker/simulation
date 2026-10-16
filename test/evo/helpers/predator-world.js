import { readFileSync } from 'node:fs';
import { OUTPUT_COUNT } from '../../../js/sim/brain-layout.js';
import { createConfig } from '../../../js/sim/config.js';
import { computeMetrics } from '../../../js/evo/metrics.js';
import { createObserver, observe, observerPhases } from '../../../js/evo/observer.js';
import { createBaselineV5 } from '../../../js/evo/policies/baseline-v5.js';
import { SCRIPTED_CONTROLLERS } from '../../../js/evo/scripted.js';
import { createRng, fork } from '../../../js/sim/rng.js';
import { createWorld } from '../../../js/sim/spawn.js';
import { step } from '../../../js/sim/step.js';

export const predatorWorld = JSON.parse(
    readFileSync(new URL('../../../evals/predator-world.json', import.meta.url), 'utf8'),
);

const PREDATOR = 1;
const FORAGER = 0;

/**
 * The test policy of `evals/predator-world.json`: baseline-v5's brain hooks, with predators in the even slots and
 * foragers in the odd ones.
 * @returns {any} the policy
 */
export function predatorPolicy() {
    const { brain } = createBaselineV5();
    return {
        ...brain,
        initSpec: (/** @type {any} */ _w, /** @type {number} */ slot) => (slot % 2 === 0 ? PREDATOR : FORAGER),
    };
}

/**
 * A brain phase that runs `hunter` on every `canHunt` slot and `fleer` on the rest.
 * @param {Record<string, any>} world the world
 * @param {import('../../../js/sim/rng.js').Rng} rng the `scripted` stream
 * @returns {(world: any) => void} the phase body
 */
function huntersAndFleers(world, rng) {
    const hunter = SCRIPTED_CONTROLLERS.hunter({ world, rng });
    const fleer = SCRIPTED_CONTROLLERS.fleer({ world, rng });
    const hunterRows = new Float32Array(world.outputs.length);
    return (w) => {
        hunter(w);
        hunterRows.set(w.outputs);
        fleer(w);
        for (let slot = 0; slot < w.alive.length; slot++) {
            if (w.alive[slot] === 1 && w.config.specialisations.predator.index === w.spec[slot]) {
                const o = slot * OUTPUT_COUNT;
                w.outputs.set(hunterRows.subarray(o, o + OUTPUT_COUNT), o);
            }
        }
    };
}

/**
 * Plays hunters against fleers on `evals/predator-world.json` for one seed.
 * @param {number} seed the world seed
 * @param {number} ticks ticks to run
 * @param {{onTick?: (world: any, observer: any) => void, config?: Record<string, any>}} [options] a per-tick hook and
 *   config overrides on top of the file
 * @returns {{world: any, observer: any}} the world and observer at the end
 */
export function playPredatorWorld(seed, ticks, { onTick = () => {}, config: extra = {} } = {}) {
    const config = createConfig({ ...predatorWorld, ...extra, seed });
    const policy = predatorPolicy();
    const world = createWorld(config, policy);
    const observer = createObserver(config, fork(createRng(seed), 'eval'));
    observe(observer, world);
    const brain = huntersAndFleers(world, fork(createRng(seed), 'scripted'));
    const overrides = { ...observerPhases(observer), brain };
    for (let t = 0; t < ticks; t++) {
        step(world, policy, overrides);
        observe(observer, world);
        onTick(world, observer);
    }
    return { world, observer };
}

/**
 * Runs hunters against fleers for one seed and computes the metrics.
 * @param {number} seed the world seed
 * @param {number} ticks ticks to run
 * @param {Record<string, any>} [config] config overrides on top of the file
 * @returns {Record<string, import('../../../js/evo/metrics-stats.js').MetricResult>} the run's metrics
 */
export function runPredatorWorld(seed, ticks, config = {}) {
    const { world, observer } = playPredatorWorld(seed, ticks, { config });
    return computeMetrics(observer, world);
}
