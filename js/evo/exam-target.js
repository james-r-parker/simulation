// Exam rows 6 and 7, the rows that need the target world (docs/designs/training-stages.md, The exam): row 6 reads two eval
// reports (`champions-v1` against the live policy) and a keep-rule report; row 7 reads the descendants' drills against
// the founders'. Both are `not run` until fed. A detector: nothing here reaches fitness, merit, mate rank, archive rank or an
// offer filter. Pure: no files, no clock.

import { compareReports } from './compare.js';
import { examRow, notRun } from './exam.js';
import { LIVE_POLICY } from './policies/index.js';

/** Row 6's verdict metrics: each has a direction, and a `verified` one gives `better` or `worse`. */
export const SCENE_VERDICT_METRICS = Object.freeze([
    'eval.bite_on_prey_view',
    'eval.patch_leave_depleted',
    'eval.pack_kills_per_eaten_death',
    'eval.pack_lift',
]);
/** Row 6's reported metrics (`watch`): printed with their intervals, never judged. */
export const SCENE_WATCH_METRICS = Object.freeze([
    'eval.chase_catch_share',
    'eval.chase_shaken_share',
    'eval.chase_ticks_p50',
    'eval.hunter_juvenile_death_share',
    'eval.predator_presence',
    'eval.predators_at_end',
]);
/** The policy row 6 judges. */
export const CHAMPIONS_POLICY = 'champions-v1';
/** Seeds of the two reports of row 6. */
export const WORLD_SEEDS = 32;
/** Ticks per seed of the two reports of row 6. */
export const WORLD_TICKS = 200000;
/** Seeds of the keep-rule report. */
export const KEEP_SEEDS = 64;
/** Row 7: a descendant generation's win share must be at least this share of the founders'. */
export const DESCENDANT_SHARE = 0.5;
/** The descendant generations row 7 reads separately. */
export const GENERATIONS = Object.freeze(['children', 'grandchildren']);

const SCENES_COMMAND =
    'npm run eval -- --policy champions-v1 --policy-options <opts.json> --seeds 32 --ticks 200000 (and the live policy), then npm run eval:compare -- <live64.json> <champions64.json> --keep-rule --json';
const INHERITED_COMMAND =
    'npm run eval -- --policy champions-v1 --policy-options <opts.json> --save-champions 8 --out <report.json>, then npm run train:exam -- --run <dir> --descendants <report>-champions';

/**
 * @param {Record<string, any>} before the live policy's report
 * @param {Record<string, any>} after the `champions-v1` report
 * @param {{seedCount: number} | null} keep the keep-rule report (`eval:compare --keep-rule --json`'s output)
 * @returns {string[]} what is wrong with the inputs: a wrong policy, too few seeds or ticks, no keep-rule report
 */
function worldProblems(before, after, keep) {
    const checks = [
        [before.policy !== LIVE_POLICY, `the before report is ${before.policy}, not the live policy ${LIVE_POLICY}`],
        [after.policy !== CHAMPIONS_POLICY, `the after report is ${after.policy}, not ${CHAMPIONS_POLICY}`],
        [Math.min(before.seeds.length, after.seeds.length) < WORLD_SEEDS, `the reports need ${WORLD_SEEDS} seeds`],
        [Math.min(before.ticks, after.ticks) < WORLD_TICKS, `the reports need ${WORLD_TICKS} ticks per seed`],
        [keep === null, 'no keep-rule report'],
        [keep !== null && keep.seedCount < KEEP_SEEDS, `the keep-rule report needs ${KEEP_SEEDS} seeds`],
    ];
    return checks.filter(([bad]) => bad).map(([, message]) => String(message));
}

/**
 * Row 6: at least one verified verdict metric `better`, none `worse`, and no keep-rule guard `WORSE`.
 * @param {{before: Record<string, any> | null, after: Record<string, any> | null,
 *   keep: {seedCount: number, keepRule: {worse: boolean}} | null}} read the two eval reports (live policy, then
 *   `champions-v1`; 32 seeds x 200000 ticks) and the keep-rule report (64 seeds); null for what is not fed
 * @returns {import('./exam.js').ExamRow} the row
 * @throws {Error} when the two reports cannot be compared (`compareReports`)
 */
export function scenesExamRow({ before, after, keep }) {
    if (before === null || after === null) {
        return notRun(6, 'the world reports are not given', SCENES_COMMAND);
    }
    const problems = worldProblems(before, after, keep);
    if (problems.length > 0) {
        return notRun(6, problems.join('; '), SCENES_COMMAND);
    }
    const { rows } = compareReports(before, after);
    const named = (/** @type {readonly string[]} */ names) => rows.filter((row) => names.includes(row.metric));
    const verdicts = Object.fromEntries(named(SCENE_VERDICT_METRICS).map((row) => [row.metric, row.verdict]));
    const watch = named(SCENE_WATCH_METRICS).map(({ metric, before: b, after: a, diff, low, high }) => ({
        metric,
        before: b,
        after: a,
        diff,
        low,
        high,
    }));
    const better = Object.keys(verdicts).filter((metric) => verdicts[metric] === 'better');
    const worse = Object.keys(verdicts).filter((metric) => verdicts[metric] === 'worse');
    const guardWorse = /** @type {{keepRule: {worse: boolean}}} */ (keep).keepRule.worse;
    const reasons = [
        ...(better.length === 0 ? ['no verified verdict metric is better'] : []),
        ...(worse.length > 0 ? [`worse: ${worse.join(', ')}`] : []),
        ...(guardWorse ? ['a keep-rule guard reads WORSE'] : []),
    ];
    const numbers = { seeds: before.seeds.length, ticks: before.ticks, verdicts, watch };
    return reasons.length === 0
        ? examRow(6, 'pass', { numbers })
        : examRow(6, 'fail', { numbers, reason: reasons.join('; ') });
}

/**
 * @typedef {object} DrillShares one group of champions' pooled drill readings
 * @property {Record<string, {winShare: number | null, edgeLow: number | null}>} drills each drill's pooled win share and
 *   the low bound of its edge over the random brains (null where no champion ran it)
 */

/**
 * @typedef {object} InheritedRead
 * @property {string[]} named the drills named by the gates of passed stages
 * @property {DrillShares} founders the founders' drills
 * @property {Record<string, DrillShares> | null} groups the drilled descendant groups by name
 * @property {{met: boolean} | null} replacement the family-replacement reading
 */

/**
 * @param {DrillShares} founders the founders' drills
 * @param {DrillShares} group a descendant group's drills
 * @param {readonly string[]} named the drills named by the gates of passed stages
 * @returns {string[]} the drills on which the group is under half the founders' win share or has no edge low bound above 0
 */
function weakDrills(founders, group, named) {
    return named.filter((name) => {
        const [f, g] = [founders.drills[name]?.winShare, group.drills[name]?.winShare];
        const edge = group.drills[name]?.edgeLow;
        const kept = typeof f === 'number' && typeof g === 'number' && g >= DESCENDANT_SHARE * f;
        return !(kept && typeof edge === 'number' && edge > 0);
    });
}

/**
 * Row 7: each descendant generation (children, grandchildren) keeps at least half the founders' win share on every named
 * drill, with an edge low bound above 0, and the family-replacement bar holds. A generation that is not given cannot pass,
 * so the row is `not run` until the generations are labelled and the replacement is read (T23a).
 * @param {InheritedRead} read the named drills, the founders' drills, the drilled descendant groups by
 *   name (`children`, `grandchildren`, or `unlabelled` for a directory of saved champions whose generation is not known)
 *   and the family-replacement reading
 * @returns {import('./exam.js').ExamRow} the row
 */
export function inheritedExamRow({ named, founders, groups, replacement }) {
    if (groups === null) {
        return notRun(7, 'no descendants are given', INHERITED_COMMAND);
    }
    const missing = [
        ...GENERATIONS.filter((g) => groups[g] === undefined),
        ...(replacement === null ? ['replacement'] : []),
    ];
    const weak = Object.fromEntries(
        GENERATIONS.filter((g) => groups[g] !== undefined).map((g) => [g, weakDrills(founders, groups[g], named)]),
    );
    const numbers = { founders, groups, weak, replacement };
    const failing = Object.keys(weak).filter((g) => weak[g].length > 0);
    if (failing.length > 0 || replacement?.met === false) {
        const reasons = [
            ...failing.map((g) => `${g} fall short on ${weak[g].join(', ')}`),
            ...(replacement?.met === false ? ['the family-replacement bar is not met'] : []),
        ];
        return examRow(7, 'fail', { numbers, reason: reasons.join('; ') });
    }
    if (missing.length > 0) {
        const reason = `not read: ${missing.join(', ')} (a missing generation cannot pass; T23a labels them)`;
        return examRow(7, 'not run', { numbers, reason, command: INHERITED_COMMAND });
    }
    return examRow(7, 'pass', { numbers });
}
