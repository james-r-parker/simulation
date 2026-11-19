// Prints a ladder yield (`train:yield`, `train:compare`, `train:screen`): a table per arm.
import { padTable } from './drill-report.mjs';

/**
 * @param {number | null} value a number
 * @param {number} digits decimals
 * @returns {string} the number, or `-` for none
 */
const num = (value, digits) => (value === null ? '-' : value.toFixed(digits));

/**
 * @param {ReturnType<typeof import('../../js/evo/ladder-yield.js').ladderYield>} yielded one arm's yield
 * @returns {string[]} one line per stage: pass share, median generations to pass and CPU hours per pass, then a total line
 */
export function formatYield(yielded) {
    const header = ['stage', 'passed', 'median gens', 'cpu h / pass'];
    const body = yielded.stages.map((s) => [
        s.stage,
        `${(s.passShare * 100).toFixed(0)}%`,
        num(s.medianGenerations, 0),
        num(s.cpuHoursPerPass, 2),
    ]);
    const lines = padTable([header, ...body]);
    lines.push(
        `runs ${yielded.runs}, mean score ${yielded.meanScore.toFixed(2)}, passed last ${yielded.passedLast}, cpu ${yielded.cpuHours.toFixed(1)} h`,
    );
    return lines;
}

/**
 * @param {readonly (import('../../js/evo/ladder-yield.js').RunYield & {dir?: string})[]} runs the runs
 * @returns {string[]} one line per run: offset, the stage it reached, its best progress there, its score and CPU hours
 */
export function formatRuns(runs) {
    const header = ['offset', 'reached', 'best progress', 'score', 'cpu h'];
    const body = runs.map((r) => [
        String(r.offset),
        String(r.reached),
        r.bestProgress.toFixed(3),
        r.score.toFixed(3),
        (r.cpuSeconds / 3600).toFixed(2),
    ]);
    return padTable([header, ...body]);
}
