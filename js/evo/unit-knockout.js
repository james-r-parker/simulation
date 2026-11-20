// Loss-of-function mutation operator (docs/designs/unit-knockout.md): switches one hidden unit off for life by
// writing `KNOCKOUT_LEAK_GENE` to its leak gene.

import { nextFloat, nextInt } from '../sim/rng.js';
import { KNOCKOUT_LEAK_GENE } from '../sim/traits.js';

/**
 * Knocks out one hidden unit with probability `rate`. Rate 0 draws nothing and returns -1.
 * @param {Float32Array} row the genome's weight row
 * @param {Readonly<Record<string, any>>} layout a `brainLayout(config)` result
 * @param {import('../sim/rng.js').Rng} rng the mutation or brain-init stream
 * @param {number} rate probability in `[0, 1]` of knocking out one hidden unit
 * @returns {number} the knocked-out unit index in `[0, layout.hidden)`, or -1 when no unit was knocked out
 */
export function knockOutUnit(row, layout, rng, rate) {
    if (rate <= 0 || nextFloat(rng) >= rate) {
        return -1;
    }
    const unit = nextInt(rng, layout.hidden);
    row[layout.leakStart + unit] = KNOCKOUT_LEAK_GENE;
    return unit;
}

/**
 * Knocks out one hidden unit at a world birth or seed and logs `UnitKnockedOut` when one fires.
 * @param {Float32Array} row the genome's weight row
 * @param {Readonly<Record<string, any>>} world the world
 * @param {number} slot the agent's slot
 * @param {{rng: import('../sim/rng.js').Rng, log?: import('../sim/log.js').SimLog, source: 'mate' | 'split' | 'archive' | 'champion'}} opts
 *   the stream, optional debug log and birth or seed cause
 * @returns {number} the knocked-out unit index, or -1 when no unit was knocked out
 */
export function knockOutAndLog(row, world, slot, { rng, log, source }) {
    const unit = knockOutUnit(row, world.layout, rng, world.config.unitKnockoutRate);
    if (unit >= 0) {
        log?.log('debug', 'UnitKnockedOut', {
            tick: world.tick,
            slot,
            genomeId: world.genomeId[slot],
            unit,
            source,
        });
    }
    return unit;
}
