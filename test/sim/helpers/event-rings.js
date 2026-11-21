// Builds one event ring holding a record of every logged event type, with every enum value the log decodes, for
// the tests that compare what `drainEvents` writes with a reference recorded before the events were a registry.

import { createEventRing, pushEvent } from '../../../js/sim/events.js';

/** The values a field takes where the log decodes it, by event code and record offset. */
/** @type {Record<number, Record<number, number[]>>} */
const ENUMS = {
    1: { 8: [0, 1, 2, 3, 4] },
    2: { 4: [0, 1, 2, 3, 4, 5, 6] },
    3: { 3: [0, 1] },
    19: { 3: [0, 1, 2], 4: [0, 1] },
    22: { 6: [0, 1] },
    30: { 3: [0, 1] },
    31: { 5: [0, 1] },
};

/** The codes with a log event (32 is unused). */
export const LOGGED_CODES = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 33, 34,
    35, 36, 37, 38, 39,
];

/**
 * @param {number} code the event code
 * @returns {Array<Record<number, number>>} the field values to push, one object (offset to value) per record
 */
function variants(code) {
    /** @type {Record<number, number>} */
    const base = {};
    for (let o = 2; o < 13; o++) {
        base[o] = code * 0.5 + o * 3;
    }
    let out = [base];
    for (const [offset, values] of Object.entries(ENUMS[code] ?? {})) {
        out = out.flatMap((rec) => values.map((v) => ({ ...rec, [offset]: v })));
    }
    if (code === 2) {
        out = out.flatMap((rec) => [0, 1, 7].map((v) => ({ ...rec, 11: v })));
    }
    if (code === 29) {
        out = [0, 1, 2, 3, 4, 5, 6].flatMap((cause) =>
            [0, 3, 7].map((birth) => ({ ...base, 4: (5 * 8 + cause) * 8 + birth })),
        );
    }
    return out;
}

/**
 * @returns {import('../../../js/sim/events.js').EventRing} a ring with a record of every logged event type
 */
export function buildReferenceRing() {
    const ring = createEventRing(2000);
    let tick = 100;
    for (const code of LOGGED_CODES) {
        for (const rec of variants(code)) {
            const o = pushEvent(ring, code, tick++);
            for (const [offset, value] of Object.entries(rec)) {
                ring.data[o + Number(offset)] = value;
            }
        }
    }
    return ring;
}
