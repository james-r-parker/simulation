// Screen table: renders the verdicts as one Markdown table, one row per arm. Pure.

import { TARGETS, WATCH_METRICS } from './screen-verdict.mjs';

const TARGET_HEADS = ['mating', 'lineages', 'births/1k', 'food/1k', 'fed life'];
const WATCH_HEADS = [
    'skill trend',
    'delib food/1k',
    'chance food/1k',
    'spec dom',
    'lineage eff',
    'trait spread',
    'child surv',
    'life p50',
    'predators',
    'pred births',
    'migration',
    'conv <1k',
    'conv 1k-2k',
    'conv >2k',
    'chases <1k',
    'chases 1k-2k',
    'chases >2k',
    'first kill KM',
    'first kill RMST',
    'prey extinct',
    'boom-bust',
    'pred share cv',
    'basin pop cv',
    'pred-prey lag',
    'summer min',
];

/**
 * @param {number | null | undefined} value a watch metric's mean
 * @returns {string} the mean to 2 places (to 0 places from 100 up, as lifespans are in ticks), or `n/a`
 */
function watchCell(value) {
    if (value === null || value === undefined) {
        return 'n/a';
    }
    return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

/**
 * @param {{ pass: boolean[] }} check one per-seed criterion
 * @returns {string} `k/n` seeds passing
 */
function seedsCell(check) {
    return `${check.pass.filter(Boolean).length}/${check.pass.length}`;
}

/**
 * @param {{ value: number | null, pass: boolean }} mean a mean criterion
 * @returns {string} the mean to 2 places and `ok` or `FAIL`
 */
function meanCell(mean) {
    return `${mean.value === null ? 'n/a' : mean.value.toFixed(2)} ${mean.pass ? 'ok' : 'FAIL'}`;
}

/**
 * @param {{ rel: number | null, delta: number | null } | undefined} delta a Target delta
 * @returns {string} the change against the reference as a signed percentage, `=` for the reference, `n/a` without one
 */
function deltaCell(delta) {
    if (delta === undefined) {
        return '=';
    }
    if (delta.rel === null) {
        return delta.delta === null ? 'n/a' : `${delta.delta >= 0 ? '+' : ''}${delta.delta.toFixed(2)}`;
    }
    const pct = Math.round(delta.rel * 100);
    return `${pct > 0 ? '+' : ''}${pct}%`;
}

/**
 * @param {{ chaseCatch: number | null } | undefined} hunters an arm's hunter gate
 * @returns {string} the mean `eval.chase_catch_share`, the share of chases that end in a catch, or `n/a`
 */
function chaseCell(hunters) {
    const share = hunters?.chaseCatch;
    return share === null || share === undefined ? 'n/a' : share.toFixed(2);
}

/**
 * @param {{ predators: number | null, ticks: number | null, kills: number | null, aliveShare: number, lowSeeds: number,
 *   pass: boolean } | undefined} hunters an arm's hunter gate
 * @returns {string} the three medians as predators/ticks/kills, the share of seeds with a hunter at the end, the
 *   seeds ending under 80 agents, then `ok` or `FAIL`; `n/a` without a gate
 */
function huntersCell(hunters) {
    if (hunters === undefined) {
        return 'n/a';
    }
    const part = (/** @type {number | null} */ v) => (v === null ? '-' : String(Math.round(v * 10) / 10));
    return `${part(hunters.predators)}/${part(hunters.ticks)}/${part(hunters.kills)} alive ${part(hunters.aliveShare)} low ${hunters.lowSeeds} ${hunters.pass ? 'ok' : 'FAIL'}`;
}

/**
 * @param {{ above: number, of: number } | undefined} summer an arm's summer-minimum count
 * @returns {string} `k/n` seeds at or above 100 prey through every summer, `n/a` without the count
 */
function summerCell(summer) {
    return summer === undefined ? 'n/a' : `${summer.above}/${summer.of}`;
}

/**
 * @param {{ worse: boolean, guards: { name: string, verdict: string, smallestSeeds: number | null }[],
 *   adoption: { alive: { count: number, of: number, low: number, high: number } | null } } | null | undefined} keep
 *   an arm's keep-rule result against the reference
 * @returns {string} `WORSE` or `no harm` with the guards that are worse or the smallest alive loss it detects, and the
 *   alive count with its interval in seeds; `=` on the reference row
 */
function keepCell(keep) {
    if (keep === null || keep === undefined) {
        return '=';
    }
    const bad = keep.guards.filter((g) => g.verdict === 'worse').map((g) => g.name);
    const alive = keep.adoption.alive;
    const aliveText =
        alive === null ? '' : ` alive ${alive.count}/${alive.of} [${alive.low.toFixed(1)}, ${alive.high.toFixed(1)}]`;
    const smallest = keep.guards.find((g) => g.name === 'alive')?.smallestSeeds;
    const detects = smallest === null || smallest === undefined ? '' : ` (detects ${smallest} seeds)`;
    return `${keep.worse ? `WORSE ${bad.join(',')}` : 'no harm'}${detects}${aliveText}`;
}

/**
 * @param {Record<string, any>} verdict one arm's verdict
 * @returns {string[]} the row's cells
 */
function row(verdict) {
    const { criteria: c, means } = verdict;
    return [
        `\`${verdict.arm}\``,
        verdict.pass ? 'PASS' : 'FAIL',
        seedsCell(c.popAboveMin),
        seedsCell(c.catchRate),
        chaseCell(verdict.hunters),
        huntersCell(verdict.hunters),
        keepCell(verdict.keep),
        meanCell(means.matingShare),
        meanCell(means.bornShare),
        seedsCell(c.lineages),
        seedsCell(c.specShare),
        seedsCell(c.popBelowMax),
        verdict.popMean === null ? 'n/a' : String(Math.round(verdict.popMean)),
        summerCell(verdict.summer),
        ...TARGETS.map((metric) => deltaCell(verdict.deltas?.[metric])),
        ...WATCH_METRICS.map((metric) => watchCell(verdict.watch?.[metric])),
    ];
}

/**
 * @param {{ reference: string, arms: Record<string, any>[] }} verdicts the screen's verdicts
 * @returns {string} the Markdown table; per-seed cells are seeds passing out of the seeds run, delta cells are the
 *   arm's mean against the reference arm's (`=` on the reference row), watch cells are the arm's mean over its seeds
 */
export function renderTable({ reference, arms }) {
    const head = [
        'Arm',
        'verdict',
        'pop > min',
        'catch/1k > 0 (speed)',
        'chase catch share',
        'hunters p50 (pred/ticks/kills), alive share, seeds <80',
        'keep rule vs ref (paired)',
        'mating mean >= 0.2',
        'born mean >= 0.5',
        'lineages >= 5',
        'spec <= 70%',
        'pop < max',
        'pop mean',
        'summer >= 100',
        ...TARGET_HEADS.map((h) => `${h} vs ref`),
        ...WATCH_HEADS,
    ];
    const rows = [head, ...arms.map(row)];
    const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
    const line = (/** @type {string[]} */ cells) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
    const rule = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
    return `${[line(head), rule, ...rows.slice(1).map(line)].join('\n')}\n\nReference arm: \`${reference}\`.\n`;
}
