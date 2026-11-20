// The exam of a training run's champion set (docs/designs/training-stages.md, The exam): one function per row, each taking
// the readings the script gathered and returning an `ExamRow`. A row is `pass`, `fail`, `reported` (no bar) or `not run`.
// A detector: nothing here reaches fitness, merit, mate rank, archive rank or an offer filter. Pure: no files, no clock.
// Rows 6 and 7 (the target world) are in `exam-target.js`.

import { styleVerdict } from './style-evidence.js';

/** Row 4's bar: the cycle share must be under this. */
export const CYCLE_BAR = 0.25;
/** Row 9's bar: rows 3 and 4 must pass on at least this many of the runs. */
export const REPLICATE_PASSES = 2;
/** Runs row 9 asks for: the run itself and two replicates (training-seed offsets 0, 64 and 128). */
export const REPLICATE_RUNS = 3;

/** The rows, by number: the name and the question the doc gives each. */
export const EXAM_ROWS = Object.freeze({
    1: Object.freeze({ name: 'Valid', question: 'Does the file load and replay?' }),
    2: Object.freeze({ name: 'Reflex', question: 'Does the brain hold the reflexes?' }),
    3: Object.freeze({ name: 'Drill', question: 'Does it do the thing in a staged scene?' }),
    4: Object.freeze({ name: 'Cross-play', question: 'Is it better than its ancestors, and not a cycle?' }),
    5: Object.freeze({ name: 'League', question: 'Does it hold a population against earlier sets?' }),
    6: Object.freeze({ name: 'Scenes', question: 'Do the scenes happen more in the target world?' }),
    7: Object.freeze({ name: 'Inherited', question: 'Do the descendants repeat it?' }),
    8: Object.freeze({ name: 'Diverse', question: 'Is there more than one custom?' }),
    9: Object.freeze({ name: 'Replicated', question: "Is it one archive's luck?" }),
    10: Object.freeze({ name: 'Watched', question: 'Can a viewer narrate it?' }),
});

/**
 * @typedef {'pass' | 'fail' | 'reported' | 'not run'} Verdict
 */

/**
 * @typedef {object} ExamRow
 * @property {number} row the row number, 1 to 10
 * @property {string} name the row's name
 * @property {Verdict} verdict the verdict
 * @property {Record<string, any>} numbers the numbers read (the `ExamRow` log event carries them)
 * @property {string} [reason] why the row did not pass, or why it did not run
 * @property {string} [command] what feeds a `not run` row
 */

/**
 * @param {number} row the row number
 * @param {Verdict} verdict the verdict
 * @param {{numbers?: Record<string, any>, reason?: string, command?: string}} [detail] the numbers, the reason and the command
 * @returns {ExamRow} the row
 */
export function examRow(row, verdict, { numbers = {}, reason, command } = {}) {
    const { name } = EXAM_ROWS[/** @type {keyof typeof EXAM_ROWS} */ (row)];
    return {
        row,
        name,
        verdict,
        numbers,
        ...(reason === undefined ? {} : { reason }),
        ...(command === undefined ? {} : { command }),
    };
}

/**
 * @param {number} row the row number
 * @param {string} reason why it did not run
 * @param {string} [command] the command that feeds it
 * @returns {ExamRow} a `not run` row
 */
export function notRun(row, reason, command) {
    return examRow(row, 'not run', { reason, command });
}

/**
 * @param {unknown} a a drill table (JSON-able)
 * @param {unknown} b a second drill table
 * @returns {boolean} whether the two are the same, key for key
 */
export function tablesIdentical(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Row 1: every champion file loads (`validateChampion`) and the drill table, run twice, is identical.
 * @param {{files: {name: string, error: string | null}[], first: unknown, second: unknown}} read the champion files with
 *   the error `validateChampion` gave (null: loaded) and the two drill tables
 * @returns {ExamRow} the row
 */
export function validRow({ files, first, second }) {
    const invalid = files.filter((file) => file.error !== null);
    const identical = tablesIdentical(first, second);
    const reasons = [
        ...invalid.map((file) => `${file.name}: ${file.error}`),
        ...(identical ? [] : ['the drill table differs between two runs']),
        ...(files.length === 0 ? ['the run exports no champion'] : []),
    ];
    const numbers = { champions: files.length, invalid: invalid.length, identical };
    return reasons.length === 0
        ? examRow(1, 'pass', { numbers })
        : examRow(1, 'fail', { numbers, reason: reasons.join('; ') });
}

/**
 * Row 2: reported until `E-RT-1` (brain-reflex-tests.md) gives the tier a verdict.
 * @param {{genomes: {name: string, score: number | null, edge: number | null}[], trials: number}} read each champion's
 *   reflex score and edge over the cases of its specialisation
 * @returns {ExamRow} the row
 */
export function reflexExamRow({ genomes, trials }) {
    return examRow(2, 'reported', { numbers: { trials, genomes } });
}

/**
 * @param {readonly {read: string}[]} [gate] a passed stage's gate readings
 * @returns {string[]} the drill names its conditions read (`drill.<name>.<reading>`)
 */
function gateDrills(gate) {
    return (gate ?? []).flatMap(({ read }) => {
        const match = /^drill\.([a-z][a-z0-9-]*)\./.exec(read);
        return match === null ? [] : [match[1]];
    });
}

/**
 * @param {readonly {passedAt?: number, gate?: readonly {read: string}[]}[]} stages a manifest's stage records
 * @returns {string[]} the drills named by a gate of a passed stage, once each, in first-seen order
 */
export function namedDrills(stages) {
    const names = stages.filter((stage) => stage.passedAt !== undefined).flatMap((stage) => gateDrills(stage.gate));
    return [...new Set(names)];
}

/**
 * @param {number | null | undefined} value a reading
 * @param {number} bar the bar
 * @returns {boolean} whether the reading exists and is above the bar
 */
const isAbove = (value, bar) => typeof value === 'number' && value > bar;

/**
 * Row 3: `edgeLow` above 0 on every drill named by a gate of a passed stage.
 * @param {{readings: Record<string, {edgeLow: number | null}>, named: string[], trials: number}} read the drill readings
 *   pooled over the champions (`drillReadings`), the named drills and the trials
 * @returns {ExamRow} the row
 */
export function drillExamRow({ readings, named, trials }) {
    if (named.length === 0) {
        return notRun(3, 'no passed stage names a drill in its gate', 'npm run train (a gated curriculum)');
    }
    const edges = Object.fromEntries(named.map((name) => [name, readings[name]?.edgeLow ?? null]));
    const failing = named.filter((name) => !isAbove(edges[name], 0));
    const numbers = { trials, edgeLow: edges };
    return failing.length === 0
        ? examRow(3, 'pass', { numbers })
        : examRow(3, 'fail', { numbers, reason: `no edge over the random brains on ${failing.join(', ')}` });
}

/**
 * Row 4: the low bounds of hunter and prey progress above 0 and the cycle share under `CYCLE_BAR`.
 * @param {{hunterProgress: {low: number} | null, preyProgress: {low: number} | null, cycleShare: number | null} | null} record
 *   `crossplay.json`; null when the run has none
 * @param {string} dir the run directory (named in the command)
 * @returns {ExamRow} the row
 */
export function crossplayExamRow(record, dir) {
    if (record === null) {
        return notRun(4, 'the run has no crossplay.json', `npm run train:crossplay -- ${dir}`);
    }
    const hunter = record.hunterProgress?.low ?? null;
    const prey = record.preyProgress?.low ?? null;
    const cycle = record.cycleShare;
    const bars = [
        [isAbove(hunter, 0), 'hunter progress has no low bound above 0'],
        [isAbove(prey, 0), 'prey progress has no low bound above 0'],
        [isAbove(CYCLE_BAR, cycle ?? Infinity), `the cycle share is not under ${CYCLE_BAR}`],
    ];
    const reasons = bars.filter(([met]) => !met).map(([, reason]) => reason);
    const numbers = { hunterProgressLow: hunter, preyProgressLow: prey, cycleShare: cycle };
    return reasons.length === 0
        ? examRow(4, 'pass', { numbers })
        : examRow(4, 'fail', { numbers, reason: reasons.join('; ') });
}

/**
 * Row 5: reported; a game is won on headcount, which is growth, not a scene.
 * @param {{name: string, elo: number, games: number, wins: number, draws: number, losses: number}[] | null} standings each
 *   champion's `runLeague` standing; null when there is no league to play
 * @returns {ExamRow} the row
 */
export function leagueExamRow(standings) {
    if (standings === null) {
        return notRun(
            5,
            'evals/league.json admits no champion to play against',
            'npm run league -- <champion.json> --admit',
        );
    }
    return examRow(5, 'reported', { numbers: { champions: standings } });
}

/**
 * @param {{low: boolean | null, high: boolean | null}} recruitment the recruitment readings
 * @returns {boolean} whether neither band's recruitment has been read
 */
const unread = (recruitment) => recruitment.low === null && recruitment.high === null;

/**
 * Row 8: both style bands of the predators are filled, pass row 3, separate on matched trials and (once read) recruit.
 * The recruitment and mixture checks come from honest-budgets Phase 6 and T23b: with them unread the row is `not run`
 * when everything else holds, so a pass is never claimed on the part that was read.
 * @param {{filled: Record<string, string[]>, bands: Parameters<typeof styleVerdict>[0]['bands'],
 *   separation: Parameters<typeof styleVerdict>[0]['separation'], recruitment: {low: boolean | null, high: boolean | null}}} read
 *   the style bands each specialisation fills, each predator band's drill reading, the matched-trial separation and the
 *   recruitment readings
 * @returns {ExamRow} the row
 */
export function diverseExamRow({ filled, bands, separation, recruitment }) {
    const verdict = styleVerdict({ bands, separation, recruitment });
    const numbers = { filled, bands: verdict.bands, separation };
    const reasons = unread(recruitment) ? verdict.reasons.filter((r) => !r.endsWith('not read')) : verdict.reasons;
    if (reasons.length > 0) {
        return examRow(8, 'fail', { numbers, reason: reasons.join('; ') });
    }
    if (unread(recruitment)) {
        return notRun(
            8,
            'descendant recruitment and the mixture check are not read (T23a, T23b)',
            'npm run train:exam -- --run <dir>',
        );
    }
    return examRow(8, 'pass', { numbers });
}

/**
 * @param {readonly (Verdict | undefined)[]} verdicts one row's verdict in each run
 * @returns {{passes: number, runs: number}} how many passed, and how many runs are given
 */
const tally = (verdicts) => ({ passes: verdicts.filter((v) => v === 'pass').length, runs: verdicts.length });

/**
 * Row 9: rows 3 and 4 each pass on at least `REPLICATE_PASSES` of the `REPLICATE_RUNS` runs. A run whose row did not run
 * is a missing read, not a failure; the row says `fail` only when the runs still to come cannot make up the passes.
 * @param {readonly {row3: Verdict, row4: Verdict}[]} runs rows 3 and 4 of this run and of each replicate
 * @returns {ExamRow} the row
 */
export function replicatedExamRow(runs) {
    if (runs.length < 2) {
        return notRun(
            9,
            'give the other offsets with --replicates <dir,dir>',
            'npm run train:exam -- --run <dir> --replicates <dir,dir>',
        );
    }
    const reads = { row3: tally(runs.map((r) => r.row3)), row4: tally(runs.map((r) => r.row4)) };
    const decided = (/** @type {{passes: number, runs: number}} */ t) =>
        t.passes >= REPLICATE_PASSES
            ? 'pass'
            : t.passes + (REPLICATE_RUNS - t.runs) < REPLICATE_PASSES
              ? 'fail'
              : 'open';
    const states = [decided(reads.row3), decided(reads.row4)];
    const numbers = { ...reads, runs: runs.length, needed: REPLICATE_PASSES, of: REPLICATE_RUNS };
    if (states.includes('fail')) {
        return examRow(9, 'fail', { numbers, reason: 'rows 3 and 4 do not each pass on 2 of 3 runs' });
    }
    return states.every((state) => state === 'pass')
        ? examRow(9, 'pass', { numbers })
        : notRun(9, 'a third run is needed to decide', 'npm run train:exam -- --run <dir> --replicates <dir,dir>');
}

/** The rows that must pass for a champion set to be good, besides row 10's sign-off. */
export const REQUIRED_ROWS = Object.freeze([1, 3, 4, 6, 7, 8, 9]);

/**
 * @param {readonly ExamRow[]} rows the ten rows
 * @param {boolean} signed whether the user has signed row 10
 * @returns {{good: boolean, open: number[]}} whether the set is good (rows 1, 3, 4, 6, 7, 8 and 9 pass and row 10 is
 *   signed) and the required rows that did not pass
 */
export function judgeSet(rows, signed) {
    const open = REQUIRED_ROWS.filter((n) => rows.find((r) => r.row === n)?.verdict !== 'pass');
    return { good: open.length === 0 && signed, open: signed ? open : [...open, 10] };
}
