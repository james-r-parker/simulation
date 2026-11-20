// Variety: the director remembers the kinds and subjects of its last `HISTORY_SHOTS` shots and scores a repeat down, so
// one kind of moment does not hold the screen (`director.max_kind_share` in `director:dry`). A kind is scored down by
// its share of the history, a subject (the hunter, victim or lineage a moment is about) by a fixed factor.

/** Shots remembered. */
export const HISTORY_SHOTS = 20;
/** How much of its score a kind loses at a share of 1 in the history. */
export const KIND_PENALTY = 0.5;
/** The factor on a candidate whose subject is in the history. */
export const SUBJECT_FACTOR = 0.7;

/**
 * @typedef {object} ShotHistory
 * @property {string[]} kinds the kinds of the last shots, oldest first
 * @property {number[]} subjects their subjects, `-1` for none
 */

/** @returns {ShotHistory} an empty history */
export function createShotHistory() {
    return { kinds: [], subjects: [] };
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
 * @param {{kind: string, subject: number}} shot the shot just taken
 * @returns {void}
 */
export function noteShot(history, { kind, subject }) {
    history.kinds.push(kind);
    history.subjects.push(subject);
    if (history.kinds.length > HISTORY_SHOTS) {
        history.kinds.shift();
        history.subjects.shift();
    }
}

/**
 * @param {ShotHistory} history the history
 * @param {{kind: string, hunterId?: number, victimId?: number, biterId?: number, lineageId?: number}} moment a candidate
 * @returns {number} the factor on its score, 1 when nothing repeats
 */
export function varietyFactor(history, moment) {
    if (history.kinds.length === 0) {
        return 1;
    }
    const same = history.kinds.filter((k) => k === moment.kind).length;
    const subject = subjectOf(moment);
    const repeated = subject >= 0 && history.subjects.includes(subject);
    return (1 - (KIND_PENALTY * same) / history.kinds.length) * (repeated ? SUBJECT_FACTOR : 1);
}

/**
 * Scores the candidates down for repeats and sorts them, best first.
 * @param {ShotHistory} history the history
 * @param {{kind: string, score: number}[]} candidates the candidates, rescored in place
 * @returns {void}
 */
export function applyVariety(history, candidates) {
    for (const c of candidates) {
        c.score *= varietyFactor(history, c);
    }
    candidates.sort((a, b) => b.score - a.score);
}
