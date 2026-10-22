// Screen table: renders the verdicts as one Markdown table, one row per arm. Pure.

import { TARGETS } from './screen-verdict.mjs';

const TARGET_HEADS = ['mating', 'lineages', 'births/1k', 'food/1k', 'fed life'];

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
        meanCell(means.matingShare),
        meanCell(means.bornShare),
        seedsCell(c.lineages),
        seedsCell(c.specShare),
        seedsCell(c.popBelowMax),
        verdict.popMean === null ? 'n/a' : String(Math.round(verdict.popMean)),
        ...TARGETS.map((metric) => deltaCell(verdict.deltas?.[metric])),
    ];
}

/**
 * @param {{ reference: string, arms: Record<string, any>[] }} verdicts the screen's verdicts
 * @returns {string} the Markdown table; per-seed cells are seeds passing out of the seeds run, delta cells are the
 *   arm's mean against the reference arm's (`=` on the reference row)
 */
export function renderTable({ reference, arms }) {
    const head = [
        'Arm',
        'verdict',
        'pop > min',
        'catch > 0',
        'mating mean >= 0.2',
        'born mean >= 0.5',
        'lineages >= 5',
        'spec <= 70%',
        'pop < max',
        'pop mean',
        ...TARGET_HEADS.map((h) => `${h} vs ref`),
    ];
    const rows = [head, ...arms.map(row)];
    const widths = head.map((_, i) => Math.max(...rows.map((r) => r[i].length)));
    const line = (/** @type {string[]} */ cells) => `| ${cells.map((c, i) => c.padEnd(widths[i])).join(' | ')} |`;
    const rule = `| ${widths.map((w) => '-'.repeat(w)).join(' | ')} |`;
    return `${[line(head), rule, ...rows.slice(1).map(line)].join('\n')}\n\nReference arm: \`${reference}\`.\n`;
}
