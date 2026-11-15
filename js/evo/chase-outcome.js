// The one chase record (detector-baseline.md, One chase taxonomy): every resolved chase is a record of its end class
// (caught, escaped or gave up) and its flags (overshot, crossed cover, re-acquired, sprinted, prey still at first
// sight). The end classes partition the chases; the flags do not. `scene-approach.js` resolves chases, and the chase
// metrics of every plan (`scene-kinematics.js` and the planned stage, sprint, scent and guild reads) are counts over
// the tally of those records. A chase that is lost and re-acquired is one record with the REACQUIRED flag set.

/** The end class of a resolved chase, as `noteChase` takes it. The classes partition the chases. */
export const CHASE_OUTCOME = Object.freeze({ CAUGHT: 0, ESCAPED: 1, GAVE_UP: 2 });

/** The flags a chase may carry, each a bit of the record's `flags`. A chase may carry any number of them. */
export const CHASE_FLAG = Object.freeze({
    OVERSHOT: 1,
    CROSSED_COVER: 2,
    REACQUIRED: 4,
    SPRINTED: 8,
    PREY_AT_FIRST_SIGHT: 16,
});

const CLASS_COUNT = 3;
/** @type {number[]} */
const FLAG_BITS = Object.values(CHASE_FLAG);
const KNOWN_FLAGS = FLAG_BITS.reduce((all, bit) => all | bit, 0);

/**
 * @typedef {{total: number, byClass: Float64Array, flagged: Float64Array}} ChaseTally
 */

/**
 * @returns {ChaseTally} an empty tally: the chases, the chases per
 *   end class and the chases per end class and flag (`flagged[class * flagCount + flagIndex]`)
 */
export function createChaseTally() {
    return {
        total: 0,
        byClass: new Float64Array(CLASS_COUNT),
        flagged: new Float64Array(CLASS_COUNT * FLAG_BITS.length),
    };
}

/**
 * Adds one chase record to the tally.
 * @param {ChaseTally} tally the tally
 * @param {{outcome: number, flags?: number}} record the chase's end class and flag bits
 * @returns {void}
 * @throws {Error} when the end class is not a `CHASE_OUTCOME` or the flags hold an unknown bit
 */
export function tallyChase(tally, { outcome, flags = 0 }) {
    if (!Number.isInteger(outcome) || outcome < 0 || outcome >= CLASS_COUNT) {
        throw new Error(`tallyChase: end class ${outcome} is not a CHASE_OUTCOME`);
    }
    if (!Number.isInteger(flags) || (flags & ~KNOWN_FLAGS) !== 0) {
        throw new Error(`tallyChase: flags ${flags} hold a bit that is not a CHASE_FLAG`);
    }
    tally.total += 1;
    tally.byClass[outcome] += 1;
    for (let i = 0; i < FLAG_BITS.length; i++) {
        if ((flags & FLAG_BITS[i]) !== 0) {
            tally.flagged[outcome * FLAG_BITS.length + i] += 1;
        }
    }
}

/**
 * @param {ChaseTally} tally the tally
 * @param {number} outcome a `CHASE_OUTCOME`
 * @returns {number} the chases that ended in that class
 */
export function chasesEnded(tally, outcome) {
    return tally.byClass[outcome];
}

/**
 * @param {ChaseTally} tally the tally
 * @param {number} flag a `CHASE_FLAG`
 * @param {readonly number[]} [outcomes] the end classes to count in (all by default)
 * @returns {number} the chases carrying the flag, within those end classes
 */
export function chasesFlagged(
    tally,
    flag,
    outcomes = [CHASE_OUTCOME.CAUGHT, CHASE_OUTCOME.ESCAPED, CHASE_OUTCOME.GAVE_UP],
) {
    const index = FLAG_BITS.indexOf(flag);
    if (index < 0) {
        throw new Error(`chasesFlagged: ${flag} is not a CHASE_FLAG`);
    }
    let sum = 0;
    for (const outcome of outcomes) {
        sum += tally.flagged[outcome * FLAG_BITS.length + index];
    }
    return sum;
}

/**
 * @param {ChaseTally} tally the tally
 * @returns {number} the chases that did not end in a catch (escaped or gave up)
 */
export function chasesEvaded(tally) {
    return tally.byClass[CHASE_OUTCOME.ESCAPED] + tally.byClass[CHASE_OUTCOME.GAVE_UP];
}
