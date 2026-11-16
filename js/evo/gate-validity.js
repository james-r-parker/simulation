// Gate validity (docs/designs/training-stages.md, Gates, Validity): a gate condition on a drill is valid when a scripted
// reference passes it and the random brains fail it. A bar nothing scripted can reach is a bar evolution cannot be asked
// to reach, so such a condition is rewritten or left out with a Decisions row. A detector: it reads drills and ladder
// files, never reaches fitness, merit, mate rank or archive rank.

import { drillReadings } from './gate-readings.js';
import { drillSubject, randomBrains } from './drill.js';
import { DRILLS } from './drill-scenarios.js';
import { kinSparingSubject } from './lesson-reference.js';
import { oracleSubject } from './lesson-oracles.js';
import { referenceSubject } from './memory-probe-references.js';
import { readGate } from './stage-gate.js';

/**
 * The references a condition is tried against, weakest reading of the world first. `memoryless` is the doc's reference (a
 * gate's `winShareOverReference` reads it); `input-reader` and `kin-sparing` read the senses only; `oracle` reads the world
 * state, so a condition only it passes is within the body's reach but not shown reachable by the senses.
 */
export const REFERENCE_KINDS = Object.freeze(['memoryless', 'input-reader', 'kin-sparing', 'oracle']);

/**
 * @param {string} kind one of `REFERENCE_KINDS`
 * @param {string} drill a drill's name
 * @returns {import('./memory-probe-run.js').Subject} the reference as a subject
 */
function subjectOf(kind, drill) {
    if (kind === 'oracle') {
        return oracleSubject(drill);
    }
    return kind === 'kin-sparing' ? kinSparingSubject() : referenceSubject(kind);
}

/**
 * @returns {{log: import('../sim/log.js').SimLog, reasons: Record<string, number>}} a log that counts the lost-trial reasons
 *   of the `DrillTrial` records it receives
 */
function reasonLog() {
    /** @type {Record<string, number>} */
    const reasons = {};
    const log = /** @type {any} */ ({
        log: (/** @type {string} */ _level, /** @type {string} */ _event, /** @type {Record<string, any>} */ f) => {
            if (!f.won && f.reason) {
                reasons[f.reason] = (reasons[f.reason] ?? 0) + 1;
            }
        },
    });
    return { log, reasons };
}

/**
 * @param {import('./drill-staging.js').Drill} drill the drill
 * @param {import('./memory-probe-run.js').Subject} subject the subject
 * @param {{seed: number, trials: number}} run the seed and trial count
 * @returns {import('./gate-readings.js').ReadingCell & {randomLossReasons: Record<string, number>}} the subject's cell
 */
function cellOf(drill, subject, { seed, trials }) {
    const mine = reasonLog();
    const theirs = reasonLog();
    const score = drillSubject(drill, subject, { seed, trials, log: mine.log, arms: true });
    const randoms = randomBrains(drill, { seed }).map((brain) =>
        drillSubject(drill, brain, { seed, trials, log: theirs.log }),
    );
    return {
        winShare: score.winShare,
        wins: score.wins,
        trials: score.trials,
        randomWins: randoms.reduce((sum, s) => sum + s.wins, 0),
        randomTrials: randoms.reduce((sum, s) => sum + s.trials, 0),
        lossReasons: mine.reasons,
        randomLossReasons: theirs.reasons,
        ...(score.arms === undefined ? {} : { arms: score.arms }),
    };
}

/**
 * @typedef {object} Validity
 * @property {string} stage the stage the condition gates
 * @property {string} read the condition's key
 * @property {Record<string, boolean>} passedBy each reference kind: whether it passes the condition
 * @property {boolean} randomFails whether the random brains (read as a subject) fail the condition
 * @property {'memoryless' | 'senses' | 'oracle' | 'none'} level the weakest reference that passes: the `memoryless` the doc
 *   names, another senses-only reference, only the state-reading oracle, or nothing (the condition is invalid)
 */

/**
 * @param {readonly string[]} passing the reference kinds that pass
 * @returns {Validity['level']} the weakest reference that passes
 */
function levelOf(passing) {
    if (passing.includes('memoryless')) {
        return 'memoryless';
    }
    if (passing.some((kind) => kind === 'input-reader' || kind === 'kin-sparing')) {
        return 'senses';
    }
    return passing.includes('oracle') ? 'oracle' : 'none';
}

/**
 * Plays the references and the random brains on every drill a ladder's gates read, and tries each drill condition.
 * @param {readonly import('./curriculum.js').CurriculumEntry[]} ladder the stages
 * @param {{seed?: number, trials?: number}} [options] the seed (1) and trials per drill (64, as a gate checkpoint)
 * @returns {Validity[]} one row per drill condition of every gated stage, in ladder order
 */
export function gateValidity(ladder, { seed = 1, trials = 64 } = {}) {
    const names = new Set(
        ladder.flatMap((e) =>
            (e.gate ?? []).flatMap((c) => (c.read.startsWith('drill.') ? [c.read.split('.')[1]] : [])),
        ),
    );
    /** @type {Record<string, Record<string, any>>} */
    const readings = {};
    for (const name of names) {
        const drill = /** @type {import('./drill-staging.js').Drill} */ (DRILLS.find((d) => d.name === name));
        const cells = Object.fromEntries(
            REFERENCE_KINDS.map((k) => [k, cellOf(drill, subjectOf(k, name), { seed, trials })]),
        );
        const memoryless = { cells: { [name]: cells.memoryless } };
        const read = (/** @type {any} */ cell) =>
            drillReadings([{ cells: { [name]: cell } }, memoryless], 1, [name])[name];
        const randomCell = {
            ...cells.memoryless,
            wins: cells.memoryless.randomWins,
            trials: cells.memoryless.randomTrials,
        };
        readings[name] = {
            random: read({ ...randomCell, arms: undefined, lossReasons: cells.memoryless.randomLossReasons }),
        };
        for (const kind of REFERENCE_KINDS) {
            readings[name][kind] = read(cells[kind]);
        }
    }
    return ladder.flatMap((entry) =>
        (entry.gate ?? []).flatMap((condition) => {
            if (!condition.read.startsWith('drill.')) {
                return [];
            }
            const name = condition.read.split('.')[1];
            const passes = (/** @type {string} */ who) =>
                readGate([condition], { drill: { [name]: readings[name][who] } }).passed;
            const passedBy = Object.fromEntries(REFERENCE_KINDS.map((kind) => [kind, passes(kind)]));
            const passing = REFERENCE_KINDS.filter((kind) => passedBy[kind]);
            return [
                {
                    stage: entry.name,
                    read: condition.read,
                    passedBy,
                    randomFails: !passes('random'),
                    level: levelOf(passing),
                },
            ];
        }),
    );
}
