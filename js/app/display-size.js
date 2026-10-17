// How big an agent is drawn and picked: never smaller than a minimum in device pixels, so a hunter can be told from the
// rest and found with the pointer even when the world is fitted to a 4K or 1440p screen.

/** The least a hunter (a specialisation with `canHunt`) is drawn across, in device px. */
export const MIN_PX_HUNTER = 16;
/** The least any other agent is drawn across, in device px. */
export const MIN_PX_OTHER = 12;

/**
 * @param {number} size the agent's radius in world units
 * @param {number} minPx the least it is drawn across, in device px
 * @param {number} zoom device pixels per world unit
 * @returns {number} the radius it is drawn and picked at, in world units: `max(size, minPx / (2 x zoom))`
 */
export function drawnRadius(size, minPx, zoom) {
    return Math.max(size, minPx / (2 * zoom));
}

/**
 * @param {Record<string, any>} info `ready.info`, whose `specs` each say `canHunt`
 * @returns {number[]} the minimum drawn width in px for each specialisation, in `info.specs` order
 */
export function minPxTable(info) {
    return info.specs.map((/** @type {{canHunt: boolean}} */ spec) => (spec.canHunt ? MIN_PX_HUNTER : MIN_PX_OTHER));
}
