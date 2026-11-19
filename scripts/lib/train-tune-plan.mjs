// The tuning lane's pure helpers (docs/designs/training-loop.md, Tuning lane): the screen grids a night runs, the finalist
// rule, the best run of an arm and the history `proposeArms` reads. No files, no clock.
import { withDefaults } from '../../js/evo/train-tune.js';

/** The name of the reference arm: the current ladder, unchanged. */
export const BASE = 'base';
const DEFAULT_GENERATIONS = 380;
const DEFAULT_WORKERS_PER_RUN = 8;
/** The learnability check's size in a tuning screen (small: it only has to catch a change that makes a rung unreachable). */
const FEASIBLE = Object.freeze({ generations: 60, seeds: 4 });

/**
 * @param {Record<string, any>} spec the tuning spec
 * @param {readonly {name: string, overlay: Record<string, any>}[]} arms the arms to screen against `base`
 * @param {number[]} offsets the offsets to run
 * @param {{feasible?: boolean}} [options] `feasible: false` turns the learnability check off (the held-out screen)
 * @returns {Record<string, any>} a ladder-screen grid file (`scripts/lib/train-screen-grid.mjs`): `base` and the arms
 */
export function screenGrid(spec, arms, offsets, { feasible = true } = {}) {
    const full = withDefaults(spec);
    return {
        curriculum: full.curriculum,
        offsets,
        ...(full.until === undefined ? {} : { until: full.until }),
        generations: spec.generations ?? DEFAULT_GENERATIONS,
        workersPerRun: spec.workersPerRun ?? DEFAULT_WORKERS_PER_RUN,
        feasible: feasible ? (spec.feasible ?? { ...FEASIBLE }) : false,
        ...(spec.train === undefined ? {} : { train: spec.train }),
        reference: BASE,
        arms: { [BASE]: {}, ...Object.fromEntries(arms.map((arm) => [arm.name, arm.overlay])) },
    };
}

/**
 * @param {Record<string, any> | undefined} verdicts a screen's `verdicts.json`
 * @param {string} arm an arm
 * @returns {{verdict: string, meanDiff: number | null, p: number | null}} the arm's verdict against the reference
 *   (`missing` when the screen has none)
 */
export function verdictOf(verdicts, arm) {
    const { verdict, compare } = verdicts?.arms?.[arm] ?? {};
    return { verdict: verdict ?? 'missing', meanDiff: compare?.meanDiff ?? null, p: compare?.p ?? null };
}

/**
 * @param {{verdict: string} | null} tune the tuning screen's verdict
 * @param {{verdict: string} | null} holdout the held-out screen's verdict (null: not run)
 * @returns {boolean} whether the arm is a finalist: `better` on the tuning offsets and again on the held-out ones
 */
export const isFinalist = (tune, holdout) => tune?.verdict === 'better' && holdout?.verdict === 'better';

/**
 * @param {{perRun?: {dir: string, offset: number, score: number}[]} | undefined} armYield an arm's entry in `yield.json`
 * @returns {string | null} the directory of the run with the best score (the lowest offset on a tie), or null for none
 */
export function bestRunDir(armYield) {
    const runs = [...(armYield?.perRun ?? [])].sort((a, b) => b.score - a.score || a.offset - b.offset);
    return runs.length === 0 ? null : runs[0].dir;
}

/**
 * @param {readonly Record<string, any>[]} results the parsed `result.json` of past nights
 * @returns {{ladderHash: string, signature: string}[]} every arm screened, with the hash of the ladder it changed
 */
export function historyOf(results) {
    return results.flatMap((result) =>
        (result.arms ?? []).map((/** @type {{signature: string}} */ arm) => ({
            ladderHash: result.ladderHash,
            signature: arm.signature,
        })),
    );
}

/**
 * @param {string} name an arm's name
 * @returns {string} the name made safe as a directory
 */
export const armDir = (name) => name.replace(/[^A-Za-z0-9._-]/g, '_');
