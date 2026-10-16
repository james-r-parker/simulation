// Builds champion files with random weights from a fixed seed, for the league tests.
import { encodeWeights } from '../../../js/evo/base64.js';
import { CHAMPION_VERSION } from '../../../js/evo/league.js';
import { brainLayout } from '../../../js/sim/brain-layout.js';
import { createConfig, rulesHash } from '../../../js/sim/config.js';
import { createRng, nextGaussian } from '../../../js/sim/rng.js';

/**
 * @param {string} name the champion name
 * @param {number} seed the seed of the weights
 * @param {{ specialisation?: number, sigma?: number }} [options] the specialisation index (default 0) and the weight spread (default 0.3)
 * @returns {Record<string, any>} a valid champion file for the default config
 */
export function makeChampionFile(name, seed, { specialisation = 0, sigma = 0.3 } = {}) {
    const config = createConfig();
    const layout = brainLayout(config);
    const rng = createRng(seed);
    const weights = new Float32Array(layout.weightCount);
    for (let i = 0; i < weights.length; i++) {
        weights[i] = nextGaussian(rng) * sigma;
    }
    return {
        version: CHAMPION_VERSION,
        name,
        rulesHash: rulesHash(config),
        layout: { inputCount: layout.inputCount, brainHidden: layout.hidden, outputCount: layout.outputCount },
        specialisation,
        weights: encodeWeights(weights),
    };
}
