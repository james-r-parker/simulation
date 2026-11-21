// The render-effect ring's layout and its two writers: effect kinds, the record size and capacity, `beginEffect` (start a
// record, dropping the oldest when full) and `placeEffect` (its position). Shared by effects.js and effects-world.js.

/** Effect kinds; the `kind` word of a record. Kinds 12 to 16 are the world effects of effects-world.js. */
export const EFFECT_KIND = Object.freeze({
    BORN: 1,
    DIED: 2,
    BITE: 3,
    ALARM: 4,
    PACK_CALL: 5,
    SMOKE: 6,
    ESCAPED: 7,
    MATED: 8,
    POLLINATED: 9,
    STAMPEDE: 10,
    STRAIN_EMERGED: 11,
    HERD_DIED: 12,
    DUNG_DROPPED: 13,
    CALF_BORN: 14,
    PATCH_WILTED: 15,
    FIRST_KILL: 16,
});

/**
 * The event of `EVENTS` each effect kind is made from, by `EFFECT_KIND` name; null for a kind the renderer-side flag edges
 * make (`BITE`, `ESCAPED`), which no event carries. `MATED` is made from the `AGENT_BORN` of a mating child.
 */
export const EFFECT_SOURCE = Object.freeze({
    BORN: 'AGENT_BORN',
    DIED: 'AGENT_DIED',
    BITE: null,
    ALARM: 'ALARM_CALLED',
    PACK_CALL: 'PACK_CALLED',
    SMOKE: 'SMOKE_RELEASED',
    ESCAPED: null,
    MATED: 'AGENT_BORN',
    POLLINATED: 'PATCH_SEEDED',
    STAMPEDE: 'HERD_STAMPEDE',
    STRAIN_EMERGED: 'STRAIN_EMERGED',
    HERD_DIED: 'HERD_ANIMAL_DIED',
    DUNG_DROPPED: 'HERD_SEEDED',
    CALF_BORN: 'HERD_ANIMAL_BORN',
    PATCH_WILTED: 'PATCH_DIED',
    FIRST_KILL: 'HUNTER_KILL',
});

/** Records the log holds; when full the oldest are dropped. */
export const EFFECT_CAPACITY = 512;

/** Words per record: `kind`, `tick`, `x`, `y`, then `a`, `b`, `c` and `d`. */
export const EFFECT_WORDS = 8;

/**
 * Starts a record, dropping the oldest when the log is full, and writes its kind and tick.
 * @param {{u32: Uint32Array, start: number, count: number, dropped: number}} log the effect log
 * @param {number} kind an `EFFECT_KIND`
 * @param {number} tick the tick it happened in
 * @returns {number} the word offset of the record; the caller writes `x` and `y` at `+ 2` and `+ 3` and words `a` to `d`
 *   at `+ 4` to `+ 7`
 */
export function beginEffect(log, kind, tick) {
    let index;
    if (log.count === EFFECT_CAPACITY) {
        index = log.start;
        log.start = (log.start + 1) % EFFECT_CAPACITY;
        log.dropped += 1;
    } else {
        index = (log.start + log.count) % EFFECT_CAPACITY;
        log.count += 1;
    }
    const o = index * EFFECT_WORDS;
    log.u32[o] = kind;
    log.u32[o + 1] = tick;
    return o;
}

/**
 * @param {{f32: Float32Array}} log the effect log
 * @param {number} o a record's word offset
 * @param {number} x the x
 * @param {number} y the y
 * @returns {void}
 */
export function placeEffect(log, o, x, y) {
    log.f32[o + 2] = x;
    log.f32[o + 3] = y;
}
