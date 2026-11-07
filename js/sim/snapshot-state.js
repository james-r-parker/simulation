// An agent's `state` word in the snapshot: read-only body state for the renderer (resting, sated, in cover, juvenile,
// gestation, toxin dose, disease strain). It reads the world and never changes it.

/**
 * The layout of an agent's `state` word (word 12), read-only body state for the renderer
 * (docs/designs/renderer-event-effects.md, Data plumbing): four bits, then three bytes scaled to 0 to 255.
 */
export const SNAPSHOT_STATE = Object.freeze({
    RESTING: 1 << 0,
    SATED: 1 << 1,
    IN_COVER: 1 << 2,
    JUVENILE: 1 << 3,
    GESTATION_SHIFT: 8,
    DOSE_SHIFT: 16,
    STRAIN_SHIFT: 24,
    BYTE: 0xff,
});

/**
 * @param {number} v a share
 * @returns {number} the share clamped to 0 to 1 and scaled to a byte
 */
function byteOf(v) {
    return Math.round(Math.min(Math.max(v, 0), 1) * SNAPSHOT_STATE.BYTE);
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot alive agent
 * @returns {number} the resting, sated, in-cover and juvenile bits
 */
function stateBits(world, slot) {
    const { config } = world;
    let bits = world.restTimer !== undefined && world.restTimer[slot] > 0 ? SNAPSHOT_STATE.RESTING : 0;
    const max = world.maxEnergyBySpec[world.spec[slot]];
    bits |= config.satiationShare > 0 && world.energy[slot] >= config.satiationShare * max ? SNAPSHOT_STATE.SATED : 0;
    bits |= world.coverRing !== undefined && world.coverRing[slot] > 0 ? SNAPSHOT_STATE.IN_COVER : 0;
    return bits | (world.ageTicks[slot] < config.juvenileTicks ? SNAPSHOT_STATE.JUVENILE : 0);
}

/**
 * @param {import('./world.js').World} world the world
 * @param {number} slot alive agent
 * @returns {number} the `state` word: the bits, gestation progress, toxin dose over the sick dose and the strain
 */
export function agentState(world, slot) {
    const { config } = world;
    const gestation = world.pregnancy[slot] > 0 ? 1 - world.pregnancy[slot] / config.pregnancyTicks : 0;
    const dose = config.sickDose > 0 ? world.dose[slot] / config.sickDose : 0;
    return (
        (stateBits(world, slot) |
            (byteOf(gestation) << SNAPSHOT_STATE.GESTATION_SHIFT) |
            (byteOf(dose) << SNAPSHOT_STATE.DOSE_SHIFT) |
            ((world.infection[slot] & SNAPSHOT_STATE.BYTE) << SNAPSHOT_STATE.STRAIN_SHIFT)) >>>
        0
    );
}
