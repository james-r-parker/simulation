// Eval compare: BCa intervals and verdicts between two reports (`npm run eval:compare`).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compareReports, MIN_EFFECT } from '../js/evo/compare.js';
import { validateReport } from '../js/evo/report.js';
import { parseFlags } from './lib/cli-args.mjs';

const USAGE =
    'usage: eval:compare <before.json> <after.json> [--targets <m,...>] [--fail-on-worse] [--allow-config-diff <key,...>] [--allow-seed-diff] [--min-effect <fraction>] [--json]';

/**
 * @param {string | undefined} value a comma-separated list
 * @param {string} flag the flag name
 * @returns {string[]} the non-empty items
 */
function list(value, flag) {
    if (value === undefined) {
        throw new Error(`${flag} needs a comma-separated list\n${USAGE}`);
    }
    return value.split(',').filter((item) => item.length > 0);
}

/**
 * @param {string | undefined} value a fraction
 * @param {string} flag the flag name
 * @returns {number} the number, within 0..1
 */
function fraction(value, flag) {
    const n = value === undefined || value.trim() === '' ? NaN : Number(value);
    if (!(n >= 0 && n <= 1)) {
        throw new Error(`${flag} needs a fraction from 0 to 1, got ${value}\n${USAGE}`);
    }
    return n;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {{ files: string[], targets: string[], failOnWorse: boolean, allowConfigDiff: string[], allowSeedDiff: boolean, minEffect: number, json: boolean }}
 *   parsed options
 */
export function parseArgs(argv) {
    const flagged = argv.filter(
        (arg, i) => arg.startsWith('--') || (i > 0 && /^--(targets|allow-config-diff|min-effect)$/.test(argv[i - 1])),
    );
    const files = argv.filter((arg) => !flagged.includes(arg));
    const opts = parseFlags(flagged, {
        valueFlags: {
            '--targets': (value, flag) => ['targets', list(value, flag)],
            '--allow-config-diff': (value, flag) => ['allowConfigDiff', list(value, flag)],
            '--min-effect': (value, flag) => ['minEffect', fraction(value, flag)],
        },
        booleanFlags: { '--fail-on-worse': 'failOnWorse', '--json': 'json', '--allow-seed-diff': 'allowSeedDiff' },
        defaults: {
            minEffect: MIN_EFFECT,
            targets: [],
            allowConfigDiff: [],
            failOnWorse: false,
            json: false,
            allowSeedDiff: false,
        },
        usage: USAGE,
    });
    if (files.length !== 2) {
        throw new Error(`expected two report files, got ${files.length}\n${USAGE}`);
    }
    return /** @type {any} */ ({ ...opts, files });
}

/**
 * @param {number | null} n a number
 * @returns {string} 4 significant digits, or `-` for null
 */
const fmt = (n) => (n === null ? '-' : String(Number(n.toPrecision(4))));

/**
 * @param {number | null} effect a relative change
 * @returns {string} a signed percentage with one decimal, or `-` for null
 */
const pct = (effect) => (effect === null ? '-' : `${effect >= 0 ? '+' : ''}${(effect * 100).toFixed(1)}%`);

/**
 * @param {{ rows: any[], level: number, paired: boolean }} result the comparison
 * @param {readonly string[]} targets the target metric names
 * @returns {string[]} the table lines
 */
export function formatTable({ rows, level, paired }, targets) {
    const head = ['metric', 'before', 'after', 'diff', 'effect', `${Math.round(level * 100)}% interval`, 'verdict', ''];
    const body = rows.map((r) => [
        r.metric,
        fmt(r.before),
        fmt(r.after),
        fmt(r.diff),
        pct(r.effect),
        r.low === null ? '-' : `[${fmt(r.low)}, ${fmt(r.high)}]`,
        r.verdict,
        targets.includes(r.metric) ? '*' : '',
    ]);
    const widths = head.map((_, c) => Math.max(...[head, ...body].map((line) => line[c].length)));
    const lines = [head, ...body].map((line) =>
        line
            .map((cell, c) => cell.padEnd(widths[c]))
            .join('  ')
            .trimEnd(),
    );
    return paired ? lines : [...lines, 'arms are paired by position, not by seed (--allow-seed-diff)'];
}

/**
 * @param {string} path a report path
 * @returns {Record<string, any>} the parsed, validated report
 */
function loadReport(path) {
    const report = JSON.parse(readFileSync(path, 'utf8'));
    validateReport(report);
    return report;
}

/**
 * @param {{ print: (line: string) => void, error: (line: string) => void }} io the output sinks
 * @param {string} field the refused field
 * @param {string} reason why
 * @returns {2} the exit code
 */
function refuse({ error }, field, reason) {
    error(`CompareRefused ${field}: ${reason}`);
    error(JSON.stringify({ level: 'error', event: 'CompareRefused', field, reason }));
    return 2;
}

/**
 * @param {ReturnType<typeof parseArgs>} args the parsed options
 * @param {{ print: (line: string) => void, error: (line: string) => void }} io the output sinks
 * @returns {number} the exit code
 */
function run(args, { print, error }) {
    const [before, after] = args.files.map(loadReport);
    const result = compareReports(before, after, {
        minEffect: args.minEffect,
        allowConfigDiff: args.allowConfigDiff,
        allowSeedDiff: args.allowSeedDiff,
    });
    const unknown = args.targets.filter((t) => !result.rows.some((r) => r.metric === t));
    if (unknown.length > 0) {
        error(`unknown target metrics: ${unknown.join(', ')}`);
        return 2;
    }
    const text = args.json
        ? JSON.stringify({ ...result, targets: args.targets }, null, 2)
        : formatTable(result, args.targets).join('\n');
    print(text);
    const scope = args.targets.length > 0 ? result.rows.filter((r) => args.targets.includes(r.metric)) : result.rows;
    return args.failOnWorse && scope.some((r) => r.verdict === 'worse') ? 1 : 0;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @param {{ print?: (line: string) => void, error?: (line: string) => void }} [io] output sinks
 * @returns {number} the process exit code: 0 ok, 1 a worse verdict under `--fail-on-worse`, 2 refused or bad input
 */
export function main(argv, { print = console.log, error = console.error } = {}) {
    try {
        return run(parseArgs(argv), { print, error });
    } catch (err) {
        const e = /** @type {Error & { field?: string }} */ (err);
        if (e.field) {
            return refuse({ print, error }, e.field, e.message);
        }
        error(e.message);
        return 2;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
