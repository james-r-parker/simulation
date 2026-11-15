// Formats the learn probe for `npm run probe:learn`: one row per lesson with its populations' final scores.
import { generationsToReach, REACHED_SHARE } from '../../js/evo/learn-probe.js';
import { padTable } from './drill-report.mjs';

/**
 * @param {readonly number[]} values numbers
 * @returns {number | null} the median, null for none
 */
function median(values) {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @typedef {object} LessonSummary
 * @property {string} lesson the drill's name
 * @property {number} best the best final win share over the populations (the "reached" bar)
 * @property {number} mean the mean final win share
 * @property {number} populations how many populations ran
 * @property {number} hit populations whose best-of-generation curve reached `REACHED_SHARE`
 * @property {number | null} medianGenerations the median first generation that reached it, over the populations that did
 */

/**
 * @param {readonly import('../../js/evo/learn-probe.js').LearnResult[]} results every population's result
 * @returns {LessonSummary[]} one summary per lesson, in the order the lessons first appear
 */
export function summarise(results) {
    const lessons = [...new Set(results.map((r) => r.lesson))];
    return lessons.map((lesson) => {
        const runs = results.filter((r) => r.lesson === lesson);
        const reaches = runs.map((r) => generationsToReach(r.curve)).filter((g) => g !== null);
        return {
            lesson,
            best: Math.max(...runs.map((r) => r.reached)),
            mean: runs.reduce((sum, r) => sum + r.reached, 0) / runs.length,
            populations: runs.length,
            hit: reaches.length,
            medianGenerations: median(/** @type {number[]} */ (reaches)),
        };
    });
}

/**
 * @param {readonly LessonSummary[]} rows the summaries
 * @returns {string} the table
 */
export function formatLearn(rows) {
    const head = ['lesson', 'reached (best)', 'mean', `populations at ${REACHED_SHARE}`, 'median generations to reach'];
    const body = rows.map((r) => [
        r.lesson,
        r.best.toFixed(2),
        r.mean.toFixed(2),
        `${r.hit} of ${r.populations}`,
        r.medianGenerations === null ? '-' : String(r.medianGenerations),
    ]);
    return padTable([head, ...body]).join('\n');
}
