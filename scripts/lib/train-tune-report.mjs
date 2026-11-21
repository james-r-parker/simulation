// What a tuning night writes (docs/designs/training-loop.md, Tuning lane): `summary.md` and the draft `evals/ledger/E<id>.json`
// record. Pure: the night's records arrive as data.
import { WORLD_METRICS } from './train-tune-world.mjs';

/**
 * @typedef {object} ArmRecord
 * @property {string} name the arm's name
 * @property {string} signature the change
 * @property {Record<string, any>} overlay the grid arm
 * @property {{verdict: string, meanDiff: number | null, p: number | null}} tune the verdict on the tuning offsets
 * @property {{verdict: string, meanDiff: number | null, p: number | null} | null} holdout the verdict on the held-out offsets
 * @property {boolean} finalist whether both verdicts are `better`
 */

/**
 * @param {number | null | undefined} n a number
 * @returns {string} 3 significant digits, or `-`
 */
const num = (n) => (n === null || n === undefined ? '-' : String(Number(n.toPrecision(3))));

/**
 * @param {number | null | undefined} effect a relative change
 * @returns {string} a signed percentage, or `-`
 */
const pct = (effect) =>
    effect === null || effect === undefined ? '-' : `${effect >= 0 ? '+' : ''}${(effect * 100).toFixed(1)}%`;

/**
 * @param {string[][]} rows a header row, then the body rows
 * @returns {string[]} a markdown table
 */
function table(rows) {
    const [head, ...body] = rows;
    return [head, head.map(() => '---'), ...body].map((row) => `| ${row.join(' | ')} |`);
}

/**
 * @param {Record<string, any>} night the night: `date`, `ladderHash`, `until`, `base`, `arms` and `world`
 * @returns {string} `summary.md`
 */
export function summaryText({ date, ladderHash, until, arms, world }) {
    /** @type {ArmRecord[]} */
    const records = arms;
    const lines = [
        `# Tuning night ${date}`,
        '',
        `Ladder hash \`${ladderHash}\`, screens until \`${until ?? 'the last stage'}\`.`,
        '',
    ];
    if (records.length === 0) {
        return [...lines, 'No arm to screen: every proposed change was screened at this ladder already.', ''].join(
            '\n',
        );
    }
    lines.push(
        ...table([
            ['arm', 'change', 'tune', 'mean score diff', 'held out', 'finalist'],
            ...records.map((a) => [
                a.name,
                `\`${a.signature}\``,
                a.tune.verdict,
                num(a.tune.meanDiff),
                a.holdout === null ? '-' : a.holdout.verdict,
                a.finalist ? 'yes' : 'no',
            ]),
        ]),
        '',
    );
    const worldRows = Object.entries(world ?? {}).flatMap(([arm, w]) =>
        WORLD_METRICS.map((metric) => [
            arm,
            metric,
            num(w.vsLive[metric].before),
            num(w.vsLive[metric].after),
            `${pct(w.vsLive[metric].effect)} ${w.vsLive[metric].verdict}`,
            w.vsBase === null ? '-' : `${pct(w.vsBase[metric].effect)} ${w.vsBase[metric].verdict}`,
        ]),
    );
    if (worldRows.length > 0) {
        lines.push(
            '## World trial (champions-v1 against live)',
            '',
            ...table([['arm', 'metric', 'live', 'champions', 'against live', 'against base'], ...worldRows]),
            '',
        );
    }
    return `${lines.join('\n')}\n`;
}

/**
 * @param {Record<string, any>} night the night, as for `summaryText`
 * @returns {Record<string, any>} a draft `evals/ledger/E<id>.json` record: the id, prediction and note are for the adopting
 *   PR to write (the ledger's id pattern is `E<number>`)
 */
export function draftExperiment({ date, arms, world }) {
    /** @type {ArmRecord[]} */
    const records = arms;
    const finalists = records.filter((a) => a.finalist).map((a) => a.name);
    const screened = records.map(
        (a) => `${a.name} (${a.tune.verdict}${a.holdout === null ? '' : `, held out ${a.holdout.verdict}`})`,
    );
    const verdicts = Object.fromEntries(
        finalists.flatMap((arm) =>
            WORLD_METRICS.map((metric) => {
                const verdict = world?.[arm]?.vsBase?.[metric]?.verdict ?? '-';
                return [
                    `${arm}:${metric}`,
                    ['better', 'worse'].includes(verdict) ? verdict : verdict === 'missing' ? '-' : 'no-difference',
                ];
            }),
        ),
    );
    return {
        id: 'E0',
        date,
        branch: `tune/${date}`,
        hypothesis: `Tuning night ${date}: ${records.map((a) => a.signature).join('; ') || 'no arm'} against the current ladder.`,
        prediction:
            'Write before adopting: the finalist raises the ladder yield score without costing the champion world trial.',
        targets: [],
        beforePolicy: 'live',
        afterPolicy: 'champions-v1',
        before: `the current ladder (reference arm base)`,
        after: finalists.length === 0 ? 'no finalist' : `finalists: ${finalists.join(', ')}`,
        verdicts,
        effect: 'no-difference',
        note: `Screened: ${screened.join('; ') || 'none'}.`,
        reports: [`evals/train-tune/results/${date}/summary.md`, `evals/train-tune/results/${date}/result.json`],
    };
}
