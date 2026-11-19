// Prints a training run's learning curve and its plateau (`npm run train:curve -- <dir>`).
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURVE_METRICS, findPlateau } from '../js/evo/learning-curve.js';
import { exitCodeOf } from './lib/cli-args.mjs';

const USAGE = 'usage: train:curve <dir>';

/**
 * @param {string} dir a training output directory
 * @returns {Record<string, any>[]} the rows of `<dir>/curve.jsonl`
 * @throws {Error} when the file is missing or empty
 */
export function readCurve(dir) {
    const path = join(dir, 'curve.jsonl');
    let text;
    try {
        text = readFileSync(path, 'utf8');
    } catch {
        throw new Error(`no curve at ${path}; run npm run train with --checkpoint-every`);
    }
    const rows = text
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line));
    if (rows.length === 0) {
        throw new Error(`${path} has no checkpoints yet`);
    }
    return rows;
}

/**
 * @param {number | null | undefined} value a number
 * @returns {string} three significant-looking decimals, or `-` for no value
 */
function cell(value) {
    return typeof value === 'number' ? value.toFixed(3) : '-';
}

/**
 * @param {string} name a curve metric's name
 * @returns {string} its column header: no `eval.` prefix, and the hunter metrics' long prefixes shortened
 */
export function shortName(name) {
    return name
        .replace('eval.', '')
        .replace('hunter_income_share.', 'income.')
        .replace('hunter_kill_rate_by_source.', 'kills/1k.')
        .replace('hunter_', '');
}

/**
 * @param {Record<string, any> | undefined} gate a row's gate columns
 * @returns {string} `-` for a row with no gate read, else `pass` or `fail`, and `PASSED` when the stage passed there
 */
function gateCell(gate) {
    if (gate === undefined) {
        return '-';
    }
    if (gate.regressed !== undefined) {
        return `REGRESSED ${gate.regressed}`;
    }
    return gate.stagePassed ? 'PASSED' : gate.passed ? 'pass' : 'fail';
}

/**
 * @param {Record<string, any> | undefined} gate a row's gate columns
 * @returns {string} each passed stage's retention (1 holds, 0 lost) and `all`, or `-`
 */
function retentionCell(gate) {
    const entries = Object.entries(gate?.retention ?? {});
    return entries.length === 0 ? '-' : entries.map(([name, v]) => `${name}:${v}`).join(' ');
}

/**
 * @param {Record<string, any>[]} rows the curve rows
 * @returns {string[]} one line per gate checkpoint: each condition's reading against its bound
 */
function gateLines(rows) {
    return rows.flatMap((r) => {
        if (r.gate === undefined) {
            return [];
        }
        const reads = r.gate.conditions.map((/** @type {any} */ c) => {
            const bound = c.min !== undefined ? `>= ${c.min}` : `<= ${c.max}`;
            return `${c.read} ${cell(c.value)} ${bound} ${c.passed ? 'ok' : 'FAIL'}`;
        });
        return [`  gen ${r.generation} ${r.gate.stage} ${gateCell(r.gate)}: ${reads.join('; ')}`];
    });
}

/**
 * @param {Record<string, any>[]} rows the curve rows
 * @returns {string[]} the table, the gate readings of a gated run (`gate`, `retention`, `progress` and `best` (best progress)
 *   columns, and a line per gate checkpoint) and the plateau line
 */
export function formatCurve(rows) {
    const gated = rows.some((r) => r.gate !== undefined);
    const short = CURVE_METRICS.map(shortName);
    const gateHeader = gated ? ['gate', 'retention', 'progress', 'best'] : [];
    const header = ['gen', 'stage', 'ticks', 'wall s', 'coverage', 'qd', 'drill edge', ...gateHeader, ...short];
    const body = rows.map((r) => [
        String(r.generation),
        r.stage,
        String(r.trainTicks),
        r.wallSeconds.toFixed(0),
        cell(r.coverage),
        cell(r.qdScore),
        cell(r.drillEdge),
        ...(gated ? [gateCell(r.gate), retentionCell(r.gate), cell(r.progress), cell(r.bestProgress)] : []),
        ...CURVE_METRICS.map((name) => cell(r[name])),
    ]);
    const table = [header, ...body];
    const widths = header.map((_, col) => Math.max(...table.map((line) => line[col].length)));
    const lines = table.map((line) =>
        line
            .map((text, col) => text.padEnd(widths[col]))
            .join('  ')
            .trimEnd(),
    );
    lines.push(...gateLines(rows));
    const plateau = findPlateau(rows);
    lines.push(plateau === null ? 'plateau: no plateau yet' : `plateau: generation ${plateau.generation}`);
    return lines;
}

/**
 * @param {string[]} argv command-line arguments after the script name
 * @returns {Promise<number>} the process exit code
 */
export async function main(argv) {
    return exitCodeOf(async () => {
        if (argv.length !== 1 || argv[0].startsWith('--')) {
            throw new Error(USAGE);
        }
        console.log(formatCurve(readCurve(argv[0])).join('\n'));
    });
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = await main(process.argv.slice(2));
}
