// Elo rating: the expected score of a game and the rating update after it.

import { detExp } from '../sim/det-math.js';

/** The K-factor: how far one game moves a rating. */
export const ELO_K = 32;
/** The rating a new candidate starts at. */
export const ELO_START = 1500;

const LN_10 = 2.302585092994046;

/**
 * @param {number} ra the rating of the side being scored
 * @param {number} rb the rating of its opponent
 * @returns {number} `ra`'s expected score in (0, 1): `1 / (1 + 10^((rb - ra) / 400))`
 */
export function expectedScore(ra, rb) {
    return 1 / (1 + detExp(((rb - ra) / 400) * LN_10));
}

/**
 * @param {number} rating the current rating
 * @param {number} expected the expected score from `expectedScore`
 * @param {number} score the actual score: 1 for a win, 0.5 for a draw, 0 for a loss
 * @param {number} [k] the K-factor
 * @returns {number} the new rating
 */
export function updateElo(rating, expected, score, k = ELO_K) {
    return rating + k * (score - expected);
}
