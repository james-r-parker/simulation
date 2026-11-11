// Reads the traces of calibration arms after burn-in and tests each arm against the reference with `keepRule`'s seed
// guards (carrying-capacity T11): `node scripts/capacity-traces.mjs <dir with <arm>.report.json> [reference]`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BURN_IN_TICKS } from '../js/evo/burn-in.js';
import { aliveFlags, keepRule } from '../js/evo/keep-rule.js';

/** A seed whose lowest population after burn-in is under this many agents has crashed. */
export const CRASH_POPULATION = 40;
/** The prey count under which the plan reads intake per agent. */
export const FEW_PREY = 50;

/**
 * @param {readonly number[]} values numbers
 * @returns {number} their median (NaN when empty)
 */
export function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length === 0 ? NaN : sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * @param {readonly number[]} values numbers
 * @returns {number} the population coefficient of variation (SD over mean)
 */
export function cv(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    return mean === 0 ? NaN : Math.sqrt(variance) / mean;
}

/**
 * @param {{ interval: number, pop: number[], prey: number[] }} trace one seed's trace
 * @returns {{ pop: number[], prey: number[] }} the samples at or after burn-in
 */
function afterBurnIn(trace) {
    const keep = (/** @type {number[]} */ xs) => xs.filter((_x, j) => (j + 1) * trace.interval >= BURN_IN_TICKS);
    return { pop: keep(trace.pop), prey: keep(trace.prey) };
}

/**
 * @param {string} name the arm
 * @param {Record<string, any>} report its report
 * @returns {Record<string, number | string>} the arm's trace reading
 */
export function traceRow(name, report) {
    const per = report.traces.map(afterBurnIn);
    const lows = per.map((/** @type {{ pop: number[] }} */ s) => Math.min(...s.pop));
    const checkpoints = per.reduce((n, /** @type {{ pop: number[] }} */ s) => n + s.pop.length, 0);
    const fewPrey = per.reduce(
        (n, /** @type {{ prey: number[] }} */ s) => n + s.prey.filter((p) => p < FEW_PREY).length,
        0,
    );
    return {
        name,
        medianLowest: median(lows),
        under40: lows.filter((/** @type {number} */ l) => l < CRASH_POPULATION).length,
        seeds: lows.length,
        medianCv: median(per.map((/** @type {{ pop: number[] }} */ s) => cv(s.pop))),
        alive: (aliveFlags(report) ?? []).reduce((a, b) => a + b, 0),
        medianPop: median(per.flatMap((/** @type {{ pop: number[] }} */ s) => s.pop)),
        fewPreyShare: fewPrey / checkpoints,
        intakePer1k: report.metrics['eval.food_energy_per_1k'].mean,
    };
}

/**
 * @param {Record<string, any>} reference the reference report
 * @param {Record<string, any>} arm an arm's report
 * @returns {string} the held and alive guards of `keepRule(reference, arm)`: verdict, seeds harmed and recovered, exact p
 */
export function seedGuards(reference, arm) {
    const guards = keepRule(reference, arm).guards.filter((g) => g.name === 'held' || g.name === 'alive');
    return guards
        .map((g) => `${g.name} ${g.verdict} (${g.harmed}/${g.recovered}, p ${Number(g.p?.toPrecision(2))})`)
        .join('; ');
}

/**
 * @param {Record<string, number | string>[]} rows trace rows
 * @param {Record<string, string>} guards the guards text per arm name
 * @returns {string} a markdown table
 */
export function renderTraces(rows, guards) {
    const head =
        '| arm | median lowest pop | seeds under 40 | median CV | hunters alive at end | median pop | checkpoints under 50 prey | food energy per 1k agent-ticks | vs defaults, seeds moved to worse / better, exact p |';
    const lines = rows.map((r) => {
        const x = /** @type {any} */ (r);
        return `| ${x.name} | ${x.medianLowest} | ${x.under40}/${x.seeds} | ${x.medianCv.toFixed(2)} | ${x.alive}/${x.seeds} | ${Math.round(x.medianPop)} | ${x.fewPreyShare.toFixed(3)} | ${x.intakePer1k.toFixed(0)} | ${guards[x.name] ?? '-'} |`;
    });
    return [head, '|---|---|---|---|---|---|---|---|---|', ...lines].join('\n');
}

/* v8 ignore start -- thin CLI */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [dir, reference = 'defaults'] = process.argv.slice(2);
    const reports = Object.fromEntries(
        readdirSync(dir)
            .filter((f) => f.endsWith('.report.json'))
            .map((f) => [f.replace('.report.json', ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))]),
    );
    const rows = Object.entries(reports).map(([name, report]) => traceRow(name, report));
    const guards = Object.fromEntries(
        Object.entries(reports)
            .filter(([n]) => n !== reference)
            .map(([name, report]) => [name, seedGuards(reports[reference], report)]),
    );
    console.log(renderTraces(rows, guards));
}
/* v8 ignore stop */
