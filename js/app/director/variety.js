// Variety: the director remembers the kinds and subjects of its last `HISTORY_SHOTS` shots and scores a repeat down, so
// one kind of moment does not hold the screen (`director.max_kind_share` in `director:dry`). A kind is scored down by
// its share of the history, a subject (the hunter, victim or lineage a moment is about) by a fixed factor. A shot older
// than `HISTORY_MAX_AGE_S` no longer counts, so a world with one kind of moment is not shut out for good.

/** Shots remembered. */
export const HISTORY_SHOTS = 20;
/** How old a remembered shot may be before it stops counting, simulated seconds. */
export const HISTORY_MAX_AGE_S = 900;
/** How much of its score a kind loses at a share of 1 in the history. */
export const KIND_PENALTY = 1;
/** The factor on a candidate whose subject is in the history. */
export const SUBJECT_FACTOR = 0.7;

/**
 * @typedef {object} ShotHistory
 * @property {string[]} kinds the kinds of the last shots, oldest first
 * @property {number[]} subjects their subjects, `-1` for none
 * @property {number[]} times when each was taken, simulated seconds
 */

/** @returns {ShotHistory} an empty history */
export function createShotHistory() {
    return { kinds: [], subjects: [], times: [] };
}

/**
 * @param {{hunterId?: number, victimId?: number, biterId?: number, lineageId?: number}} moment a moment
 * @returns {number} who it is about: the hunter, the victim, the biter or the lineage; `-1` when it is about a place
 */
export function subjectOf(moment) {
    return moment.hunterId ?? moment.victimId ?? moment.biterId ?? moment.lineageId ?? -1;
}

/**
 * @param {ShotHistory} history the history
 * @param {{kind: string, subject: number, timeS: number}} shot the shot just taken
 * @returns {void}
 */
export function noteShot(history, { kind, subject, timeS }) {
    history.kinds.push(kind);
    history.subjects.push(subject);
    history.times.push(timeS);
    if (history.kinds.length > HISTORY_SHOTS) {
        history.kinds.shift();
        history.subjects.shift();
        history.times.shift();
    }
}

/**
 * @param {ShotHistory} history the history
 * @param {number} timeS the time now
 * @returns {number} the index of the oldest shot that still counts
 */
function firstCounted(history, timeS) {
    const at = history.times.findIndex((t) => timeS - t <= HISTORY_MAX_AGE_S);
    return at < 0 ? history.times.length : at;
}

/**
 * @param {ShotHistory} history the history
 * @param {{kind: string, hunterId?: number, victimId?: number, biterId?: number, lineageId?: number}} moment a candidate
 * @param {number} timeS the time now
 * @returns {number} the factor on its score, 1 when nothing recent repeats
 */
export function varietyFactor(history, moment, timeS) {
    const from = firstCounted(history, timeS);
    const kinds = history.kinds.slice(from);
    if (kinds.length === 0) {
        return 1;
    }
    const subject = subjectOf(moment);
    const repeated = subject >= 0 && history.subjects.slice(from).includes(subject);
    const share = kinds.filter((k) => k === moment.kind).length / kinds.length;
    return (1 - KIND_PENALTY * share) * (repeated ? SUBJECT_FACTOR : 1);
}

/**
 * Scores the candidates down for repeats and sorts them, best first.
 * @param {ShotHistory} history the history
 * @param {{kind: string, score: number}[]} candidates the candidates, rescored in place
 * @param {number} timeS the time now
 * @returns {void}
 */
export function applyVariety(history, candidates, timeS) {
    for (const c of candidates) {
        c.score *= varietyFactor(history, c, timeS);
    }
    candidates.sort((a, b) => b.score - a.score);
}
