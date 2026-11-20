// The `linger` shot's rules: the moment's focus is found again at each decision, the shot is extended while the moment
// stays strong and ends early when it goes quiet, but never before the floor or after the ceiling, and never so late
// that a wide shot would be more than `WIDE_MAX_GAP_S` away.

import { MOMENT_KIND } from './scoring.js';
import { LINGER_EXTEND_S, LINGER_LOW_SCORE, LINGER_LOW_WINDOW_S, LINGER_MAX_S } from './shots.js';
import { ceilingReached, floorReached, wideDue } from './schedule.js';

/** Score a lingering moment must hold to extend the shot (the glide threshold). */
const EXTEND_SCORE = 45;
/** A chase is held while the pair stays within this many world units, even when the gap stops closing. */
export const CHASE_HOLD_DISTANCE = 600;

/**
 * Finds the matching candidate in a fresh scan to refresh an ongoing `linger` shot's score and focus. A chase whose gap
 * has stopped closing is still held at the extension score while both are alive and near, so the shot stays to the
 * pursuit's end (a bite, an escape or a death) and is not cut while it is still on.
 * @param {import('./moments.js').MomentCandidate} moment the moment currently being lingered on
 * @param {readonly import('./moments.js').MomentCandidate[]} rawCandidates fresh candidates without repeat penalty
 * @param {readonly import('./moments.js').AgentRecord[]} agents current alive agents
 * @returns {{score: number, x: number, y: number}} refreshed score and focus coordinates
 */
export function refreshLingerMoment(moment, rawCandidates, agents) {
    const match = rawCandidates.find((c) => c.kind === moment.kind);
    if (match) {
        return { score: match.score, x: match.x, y: match.y };
    }
    if (moment.kind === MOMENT_KIND.CHASE) {
        const hunter = agents.find((a) => a.genomeId === moment.hunterId);
        const prey = agents.find((a) => a.genomeId === moment.preyId);
        if (hunter && prey) {
            const near = Math.hypot(hunter.x - prey.x, hunter.y - prey.y) <= CHASE_HOLD_DISTANCE;
            return { score: near ? EXTEND_SCORE : 0, x: (hunter.x + prey.x) / 2, y: (hunter.y + prey.y) / 2 };
        }
    } else if (moment.kind === MOMENT_KIND.ESCAPE || moment.kind === MOMENT_KIND.SMOKE_ESCAPE) {
        const victim = agents.find((a) => a.genomeId === moment.victimId);
        if (victim) {
            return { score: 0, x: victim.x, y: victim.y };
        }
    }
    return { score: 0, x: moment.x, y: moment.y };
}

/**
 * @param {Record<string, any>} shot the lingering shot, whose duration this may extend
 * @param {number} score the moment's score now
 * @param {number} elapsedS seconds since the linger began
 * @returns {boolean} whether the planned time is up, after one extension while the moment is strong
 */
function plannedTimeUp(shot, score, elapsedS) {
    if (elapsedS < shot.durationS - 1e-6) {
        return false;
    }
    if (score >= EXTEND_SCORE && shot.durationS < LINGER_MAX_S) {
        shot.durationS = Math.min(LINGER_MAX_S, shot.durationS + LINGER_EXTEND_S);
    }
    return elapsedS >= shot.durationS - 1e-6;
}

/**
 * Decides whether a lingering shot ends now.
 * @param {Record<string, any>} state the director state: `shot`, `shotStartS`, `lastWideS` and `lowScoreSinceS`, which
 *   this keeps
 * @param {{timeS: number, score: number}} at the time and the moment's score now
 * @returns {boolean} whether to pull back
 */
export function lingerOver(state, { timeS, score }) {
    const shotElapsedS = timeS - state.shotStartS;
    if (ceilingReached(shotElapsedS) || wideDue(timeS, state.lastWideS)) {
        return true;
    }
    if (score >= LINGER_LOW_SCORE) {
        state.lowScoreSinceS = null;
    } else {
        state.lowScoreSinceS = state.lowScoreSinceS ?? timeS;
        if (timeS - state.lowScoreSinceS >= LINGER_LOW_WINDOW_S - 1e-6 && floorReached(shotElapsedS)) {
            return true;
        }
    }
    return plannedTimeUp(state.shot, score, timeS - state.shot.startTimeS);
}
