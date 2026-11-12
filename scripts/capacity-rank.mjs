// Ranks calibration arms by the carrying-capacity detectors, with no verdict (carrying-capacity T9):
// `node scripts/capacity-rank.mjs <dir with <arm>.report.json> [--reference <arm>]` prints a markdown table sorted by
// `held`, then `alive`, then the lowest `eval.cap_share`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armRow } from './lib/arm-row.mjs';

const METRICS = [
    'eval.cap_share',
    'eval.density_starve_slope',
    'eval.density_intake_slope',
    'eval.food_standing_share',
    'eval.population_mean',
];

/**
 * @param {string} name the arm
 * @param {Record<string, any>} report its eval report
 * @returns {ReturnType<typeof armRow>} its row
 */
export function rowOf(name, report) {
    return armRow(name, report, METRICS);
}

/**
 * @param {ReturnType<typeof rowOf>[]} rows the rows
 * @returns {ReturnType<typeof rowOf>[]} sorted by held (high), alive (high), cap share (low)
 */
export function rank(rows) {
    const cap = (/** @type {ReturnType<typeof rowOf>} */ r) => r.means['eval.cap_share'] ?? Infinity;
    return [...rows].sort((a, b) => b.held - a.held || b.alive - a.alive || cap(a) - cap(b));
}

/**
 * @param {ReturnType<typeof rowOf>[]} rows ranked rows
 * @returns {string} a markdown table
 */
export function renderRank(rows) {
    const f = (/** @type {number | null} */ n) => (n === null ? '-' : n.toFixed(3));
    const head = '| Rank | Arm | held | alive | cap_share | starve slope | intake slope | food standing | pop mean |';
    const lines = rows.map(
        (r, i) =>
            `| ${i + 1} | ${r.name} | ${r.held}/${r.seeds} | ${r.alive}/${r.seeds} | ${METRICS.map((m) => f(r.means[m])).join(' | ')} |`,
    );
    return [head, '|---|---|---|---|---|---|---|---|---|', ...lines].join('\n');
}

/* v8 ignore start -- thin CLI */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const dir = process.argv[2];
    const rows = readdirSync(dir)
        .filter((f) => f.endsWith('.report.json'))
        .map((f) => rowOf(f.replace('.report.json', ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))));
    console.log(renderRank(rank(rows)));
}
/* v8 ignore stop */
