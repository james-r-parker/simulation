// Which specialisations can hunt, as a lookup table the observer's combat and intent state share.

/** `knownAgents` packs `lineageId * SPEC_RADIX + spec`; also the length of the hunter table. */
export const SPEC_RADIX = 8;

/**
 * @param {Readonly<Record<string, any>>} config the world's config
 * @returns {Uint8Array} 1 at each specialisation index that has `canHunt`
 */
export function hunterTable(config) {
    const hunterSpec = new Uint8Array(SPEC_RADIX);
    for (const spec of Object.values(config.specialisations)) {
        hunterSpec[/** @type {any} */ (spec).index] = /** @type {any} */ (spec).canHunt ? 1 : 0;
    }
    return hunterSpec;
}
