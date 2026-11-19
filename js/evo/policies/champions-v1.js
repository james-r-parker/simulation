// champions-v1: the live policy (`map-elites-v6`) with one change. When the seeder would draw a random brain (the
// initial agents, floor entrants and immigrants the archive has no genome for), it draws a mutated champion of the
// same specialisation instead; births, mating, fitness and the archive are unchanged (docs/designs/training.md, Phase 3).
//
// The champion files come in through the `champions` option: parsed champion files, so this module reads no file and
// no URL. The headless eval resolves its `championsDir` option to them (`scripts/lib/champion-files.mjs`) and the
// browser worker fetches `public/champions/v1/` (`js/worker/champion-fetch.js`).

import { createChampionSource } from '../../evo/champion-source.js';
import { createMapElitesV6 } from './map-elites-v6.js';

/**
 * @param {Record<string, any>} options the options of `createMapElitesV6` plus `champions`, the parsed champion files
 * @returns {Record<string, any>} the `map-elites-v6` policy object with `name` `champions-v1`
 * @throws {Error} when `champions` is missing or empty, or a file does not fit the config
 */
export function createChampionsV1(options) {
    const { champions, ...rest } = options;
    return createMapElitesV6({
        ...rest,
        name: 'champions-v1',
        championSource: createChampionSource(champions, options.config, options.log),
    });
}
