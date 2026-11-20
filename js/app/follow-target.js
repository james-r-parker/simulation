// Ranks living follow subjects using the renderer's pursuits and a bounded memory of scored effects.

import { scoreEffect } from './director/scoring.js';

const INTEREST_CAPACITY = 32;
const INTEREST_MS = 5000;
const CONTINUITY_RANGE = 600;
const CONTINUITY_BONUS = 8;
const LIFE_SCORE = 45;
const PREGNANCY_SCORE = 35;
/** The score of a moving agent: an event must beat it to hold a follow (`follow.js`, boredom). */
export const MOVEMENT_SCORE = 5;

/**
 * @typedef {object} FollowInterest
 * @property {Uint32Array} subject
 * @property {Uint32Array} partner
 * @property {Float32Array} score
 * @property {Float64Array} atMs
 * @property {number} next
 * @property {number} count
 */

/** @returns {FollowInterest} an empty event memory, independent of the director's moment pointers */
export function createFollowInterest() {
    return {
        subject: new Uint32Array(INTEREST_CAPACITY),
        partner: new Uint32Array(INTEREST_CAPACITY),
        score: new Float32Array(INTEREST_CAPACITY),
        atMs: new Float64Array(INTEREST_CAPACITY),
        next: 0,
        count: 0,
    };
}

/**
 * Remembers living participants when an effect plays. BORN word b is a lineage, never a partner id.
 * @param {FollowInterest} memory the ring
 * @param {import('./renderer/effects-player.js').Effect} effect the played effect
 * @param {{kinds: Record<string, number>, eatenCause: number, nowMs: number}} ctx layout and displayed time
 * @returns {void}
 */
export function noteFollowInterest(memory, effect, ctx) {
    const { kinds, eatenCause, nowMs } = ctx;
    const life = effect.kind === kinds.BORN || effect.kind === kinds.MATED;
    const scored = scoreEffect(effect, { ageS: 0, kinds, eatenCause });
    const score = life ? LIFE_SCORE : (scored?.score ?? 0);
    if (score <= 0) {
        return;
    }
    const i = memory.next;
    memory.subject[i] = effect.kind === kinds.DIED ? effect.b : effect.a;
    memory.partner[i] = effect.kind === kinds.MATED ? effect.b : 0;
    memory.score[i] = score;
    memory.atMs[i] = nowMs;
    memory.next = (i + 1) % INTEREST_CAPACITY;
    memory.count = Math.min(memory.count + 1, INTEREST_CAPACITY);
}

/**
 * @param {FollowInterest} memory the ring
 * @param {number} id the living subject
 * @param {number} nowMs displayed time
 * @returns {number} the strongest unexpired event score
 */
export function eventScore(memory, id, nowMs) {
    let score = 0;
    for (let k = 0; k < memory.count; k++) {
        if (memory.subject[k] !== id && memory.partner[k] !== id) {
            continue;
        }
        const age = nowMs - memory.atMs[k];
        if (age >= 0 && age < INTEREST_MS) {
            score = Math.max(score, memory.score[k] * (1 - age / INTEREST_MS));
        }
    }
    return score;
}

/**
 * @param {import('./pursuit.js').Pursuits} pairs the existing renderer pairs
 * @param {number} index the agent's frame index
 * @returns {number} the best pursuit score for either endpoint
 */
function pursuitScore(pairs, index) {
    let score = 0;
    for (let k = 0; k < pairs.count; k++) {
        if (pairs.hunter[k] === index || pairs.prey[k] === index) {
            score = Math.max(score, 50 + 30 * pairs.closeness[k]);
        }
    }
    return score;
}

/**
 * How interesting one agent is right now, before the proximity bonus: the largest of its pursuit score, its recent event
 * score, pregnancy and movement. `follow.js` reads it to tell a subject that has gone quiet.
 * @param {import('./interpolate.js').Interpolated} agents the displayed living agents
 * @param {number} i the agent's frame index
 * @param {{player: import('./renderer/effects-player.js').EffectsPlayer | null, nowMs: number}} context effects, time
 * @returns {number} its interest score
 */
export function interestOf(agents, i, { player, nowMs }) {
    let score = agents.speed[i] > 0 ? MOVEMENT_SCORE : 0;
    if (player !== null) {
        score = Math.max(
            score,
            eventScore(player.followInterest, agents.genomeId[i], nowMs),
            pursuitScore(player.flee.pursuits, i),
        );
        if ((agents.flags[i] & player.bits.PREGNANT) !== 0) {
            score = Math.max(score, PREGNANCY_SCORE);
        }
    }
    return score;
}

/**
 * @param {import('./interpolate.js').Interpolated} agents the displayed living agents
 * @param {{player: import('./renderer/effects-player.js').EffectsPlayer | null, nowMs: number,
 *   x: number, y: number, skip?: number}} context effects/pursuits, the last camera target and a genome id to leave out
 * @returns {number} the best living genome id, 0 for an empty population; ties use distance then genome id
 */
export function pickFollowAgent(agents, context) {
    const { x, y, skip = 0 } = context;
    let bestId = 0;
    let bestScore = -Infinity;
    let bestDistance = Infinity;
    for (let i = 0; i < agents.count; i++) {
        const id = agents.genomeId[i];
        if (id === skip) {
            continue;
        }
        const distance = Math.hypot(agents.x[i] - x, agents.y[i] - y);
        const score = interestOf(agents, i, context) + CONTINUITY_BONUS * Math.max(0, 1 - distance / CONTINUITY_RANGE);
        if (
            score > bestScore ||
            (score === bestScore && (distance < bestDistance || (distance === bestDistance && id < bestId)))
        ) {
            bestId = id;
            bestScore = score;
            bestDistance = distance;
        }
    }
    return bestId;
}
