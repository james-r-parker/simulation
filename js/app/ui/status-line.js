// The plain-language status: one sentence a first-time viewer can read, such as "Summer, year 3: 270 blobs and growing,
// Velari leads with 31%". Also the calendar the top bar shows ("Year 3, Summer, Gen 41").

import { familyName } from '../renderer/colors.js';

/** The population change over the last minute that counts as growing or shrinking. */
export const TREND_BAND = 0.05;

/**
 * @param {number} population the population now
 * @param {number | null} earlier the population about 60 s ago, null when the history is too short to say
 * @returns {'growing' | 'shrinking' | 'steady'} `growing` above +5%, `shrinking` below -5%, else `steady`
 */
export function trendWord(population, earlier) {
    if (earlier === null || earlier <= 0) {
        return 'steady';
    }
    const change = (population - earlier) / earlier;
    if (change > TREND_BAND) {
        return 'growing';
    }
    return change < -TREND_BAND ? 'shrinking' : 'steady';
}

/**
 * @param {string} text a word
 * @returns {string} the word with a capital letter
 */
function capital(text) {
    return text === '' ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * @typedef {object} World
 * @property {string[]} seasonNames `ready.info.seasonNames`
 * @property {number} seasonLength `ready.info.seasonLength`, in ticks
 * @property {number} seed the world seed, which names the families
 */

/**
 * @param {Record<string, any>} stats the newest `stats` message
 * @param {World} world the season names and length and the seed
 * @returns {{year: number, season: string, generation: number}} the calendar: the year (four seasons make one), the
 *   season's capitalised name and the deepest generation alive
 */
export function calendarOf(stats, { seasonNames, seasonLength }) {
    return {
        year: Math.floor(stats.tick / (4 * seasonLength)) + 1,
        season: capital(String(seasonNames[stats.season] ?? '')),
        generation: stats.generationMax ?? 0,
    };
}

/**
 * @param {{stats: Record<string, any> | null, trend: 'growing' | 'shrinking' | 'steady', world: World | null}} source
 *   the newest stats (null before the first), the population trend and the world
 * @returns {string} the sentence: `Starting a new world` before any stats, `Replaying to tick <n>: <p>%` while the
 *   worker seeks, else the season and year, the population with its trend and the leading family
 */
export function statusLine({ stats, trend, world }) {
    if (stats === null || world === null) {
        return 'Starting a new world';
    }
    if (typeof stats.seekTarget === 'number' && stats.seekTarget > 0) {
        const done = Math.min(Math.round((stats.tick / stats.seekTarget) * 100), 100);
        return `Replaying to tick ${stats.seekTarget}: ${done}%`;
    }
    const { year, season } = calendarOf(stats, world);
    const top = stats.lineages?.top;
    const lead = top?.[0];
    const leader =
        lead === undefined
            ? ''
            : `, ${familyName(world.seed, lead.id, top)} leads with ${Math.round(lead.share * 100)}%`;
    return `${season}, year ${year}: ${stats.population} blobs and ${trend}${leader}`;
}
