// Fixed-stride per-tick event ring: codes for births, deaths, blocked births, floor spawns, calls and smoke, and the push/read/clear helpers.

/** Number of Float64 fields per event record. */
export const EVENT_STRIDE = 12;

/** Event type codes, stored in field 0 of each record. */
export const EVENT_TYPE = Object.freeze({
    AGENT_BORN: 1,
    AGENT_DIED: 2,
    BIRTH_BLOCKED: 3,
    POPULATION_FLOOR: 4,
    ALARM_CALLED: 5,
    SMOKE_RELEASED: 6,
    PACK_CALLED: 7,
    SMOKE_REFUSED: 8,
    FOOD_PATCHES_CREATED: 9,
    SEASON_CHANGED: 10,
    DROUGHT_STARTED: 11,
    MERIT_SUMMARY: 14,
    LINE_PROVEN: 15,
    AGENT_SICKENED: 16,
    PATCH_DIED: 18,
});

/** Why an agent was born, stored in the `cause` field of `AGENT_BORN`. */
export const BORN_CAUSE = Object.freeze({
    INITIAL: 0,
    MATE: 1,
    SPLIT: 2,
    FLOOR: 3,
    IMMIGRANT: 4,
});

/** Why an agent died, stored in the `cause` field of `AGENT_DIED`. */
export const DEATH_CAUSE = Object.freeze({
    STARVED: 0,
    EATEN: 1,
    COLLISION: 2,
    OLD_AGE: 3,
    POISONED: 4,
});

/** Why a birth was blocked, stored in the `cause` field of `BIRTH_BLOCKED`. */
export const BLOCKED_CAUSE = Object.freeze({
    CAPACITY: 0,
    ENERGY: 1,
});

/**
 * @typedef {object} EventRing
 * @property {Float64Array} data `capacity * EVENT_STRIDE` fields, one record per event
 * @property {number} count records pushed since the last `clearEvents`
 * @property {number} capacity the most records the ring holds
 */

/**
 * Allocates an empty event ring.
 * @param {number} capacity the most records the ring can hold; a positive integer
 * @returns {EventRing}
 */
export function createEventRing(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
        throw new Error(`createEventRing: capacity must be a positive integer, got ${capacity}`);
    }
    return { data: new Float64Array(capacity * EVENT_STRIDE), count: 0, capacity };
}

/**
 * Appends a record with its type and tick, zeroing the remaining fields.
 * @param {EventRing} ring the ring to append to
 * @param {number} type an `EVENT_TYPE` code
 * @param {number} tick the simulation tick of the event
 * @returns {number} the offset of the record's first field in `ring.data`
 */
export function pushEvent(ring, type, tick) {
    if (ring.count === ring.capacity) {
        throw new Error(`pushEvent: event ring is full at tick ${tick} (eventCapacity ${ring.capacity})`);
    }
    const offset = ring.count * EVENT_STRIDE;
    const { data } = ring;
    data[offset] = type;
    data[offset + 1] = tick;
    data.fill(0, offset + 2, offset + EVENT_STRIDE);
    ring.count += 1;
    return offset;
}

/**
 * Returns the number of records; callers read `ring.data` directly.
 * @param {EventRing} ring the ring
 * @returns {number} the record count
 */
export function readEvents(ring) {
    return ring.count;
}

/**
 * Empties the ring without touching its data.
 * @param {EventRing} ring the ring
 * @returns {void}
 */
export function clearEvents(ring) {
    ring.count = 0;
}
