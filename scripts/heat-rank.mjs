// Ranks the arms of a heat screen with no verdict (low-density-edge T13):
// `node scripts/heat-rank.mjs <dir with <arm>.report.json> [--reference <arm>] [extra.report.json ...]` prints a markdown
// table sorted by `held`, then `alive`, then the edge birth/death ratio. `held` and `alive` are per-seed flags; gained
// and lost count the seeds an arm holds that the reference does not, and the reverse.
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armRow } from './lib/arm-row.mjs';

const METRICS = [
    'eval.edge_birth_death_ratio',
    'eval.heat_stress_share',
    'eval.births_per_1k',
    'eval.mating_share',
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
 * @param {number[] | null} arm an arm's held flags
 * @param {number[] | null} ref the reference's held flags
 * @returns {{ gained: number, lost: number } | null} paired seeds gained and lost, null when either cannot say
 */
export function paired(arm, ref) {
    if (arm === null || ref === null || arm.length !== ref.length) {
        return null;
    }
    let gained = 0;
    let lost = 0;
    arm.forEach((a, i) => {
        gained += a === 1 && ref[i] === 0 ? 1 : 0;
        lost += a === 0 && ref[i] === 1 ? 1 : 0;
    });
    return { gained, lost };
}

/**
 * @param {ReturnType<typeof rowOf>[]} rows the rows
 * @returns {ReturnType<typeof rowOf>[]} sorted by held (high), alive (high), edge ratio (high)
 */
export function rank(rows) {
    const edge = (/** @type {ReturnType<typeof rowOf>} */ r) => r.means['eval.edge_birth_death_ratio'] ?? -Infinity;
    return [...rows].sort((a, b) => b.held - a.held || b.alive - a.alive || edge(b) - edge(a));
}

/**
 * @param {ReturnType<typeof rowOf>[]} rows ranked rows
 * @param {string} reference the reference arm's name
 * @returns {string} a markdown table
 */
export function renderRank(rows, reference) {
    const ref = rows.find((r) => r.name === reference)?.flags ?? null;
    const f = (/** @type {number | null | undefined} */ n) => (n === null || n === undefined ? '-' : n.toFixed(3));
    const head = `| Rank | Arm | held | vs ${reference} | alive | ${METRICS.map((m) => m.replace('eval.', '')).join(' | ')} |`;
    const lines = rows.map((r, i) => {
        const p = r.name === reference ? null : paired(r.flags, ref);
        const vs = p === null ? '-' : `+${p.gained}/-${p.lost}`;
        const cells = METRICS.map((m) => f(r.means[m])).join(' | ');
        return `| ${i + 1} | ${r.name} | ${r.held}/${r.seeds} | ${vs} | ${r.alive}/${r.seeds} | ${cells} |`;
    });
    return [head, `|${'---|'.repeat(6 + METRICS.length - 1)}`, ...lines].join('\n');
}

/* v8 ignore start -- thin CLI */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [dir, ...rest] = process.argv.slice(2);
    const i = rest.indexOf('--reference');
    const reference = i >= 0 ? rest[i + 1] : 'defaults';
    const extra = rest.filter((a, j) => a.endsWith('.json') && (i < 0 || j !== i + 1));
    const files = [
        ...readdirSync(dir)
            .filter((f) => f.endsWith('.report.json'))
            .map((f) => [f.replace('.report.json', ''), join(dir, f)]),
        ...extra.map((p) => [basename(p).replace(/\.json$/, ''), p]),
    ];
    const rows = files.map(([name, path]) => rowOf(name, JSON.parse(readFileSync(path, 'utf8'))));
    console.log(renderRank(rank(rows), reference));
}
/* v8 ignore stop */
