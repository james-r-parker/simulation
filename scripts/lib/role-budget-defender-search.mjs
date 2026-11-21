// The `--search` of the defender's row for `npm run role:budget`: the single settings that let the defender do its job, for the
// defence and for the smoke, each written as an overrides file `audit:chase --config` reads (docs/designs/role-budget.md).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchDefender } from '../../js/evo/role-budget-search-defend.js';
import { padTable } from './drill-report.mjs';

/** The most findings of one goal the search writes override files for. */
const FILES_PER_GOAL = 5;

/** @param {number | null} margin a cell's margin @returns {string} it in ticks, `X` for an impossible one */
const tick = (margin) => (margin === null ? 'X' : String(Math.round(margin)));

/**
 * @param {Readonly<Record<string, any>>} config an `arenaConfig`
 * @param {{overrides: Record<string, any>, model: import('../../js/evo/role-budget-model.js').RoleModel, outDir: string,
 *   arm: string}} where the overrides that made it, the model, the output directory and the arm's name
 * @returns {{goal: string, findings: import('../../js/evo/role-budget-search-defend.js').DefenderFinding[], files: string[]}[]}
 *   the search for each goal (the defence, the smoke) and the override files written
 */
export function searchDefenderRows(config, { overrides, model, outDir, arm }) {
    return /** @type {const} */ (['defence', 'smoke']).map((goal) => {
        const findings = searchDefender(config, { overrides, model, goal }).slice(0, FILES_PER_GOAL);
        if (findings.length > 0) {
            mkdirSync(outDir, { recursive: true });
        }
        const files = findings.map((f, i) => {
            const file = join(outDir, `${arm}-defender-predator-${goal}-${i + 1}.json`);
            writeFileSync(file, `${JSON.stringify(f.overrides, null, 2)}\n`);
            return file;
        });
        return { goal, findings, files };
    });
}

/**
 * @param {ReturnType<typeof searchDefenderRows>} searched the search of each goal
 * @returns {string} for each goal the smallest single changes that reach it, with the cells after the change and the file, or
 *   a line saying none does
 */
export function formatDefenderSearch(searched) {
    return searched
        .map(({ goal, findings, files }) => {
            if (findings.length === 0) {
                return `defender:predator ${goal}: no single setting at the factors tried gives it (or it is already given)`;
            }
            const rows = findings.map((f, i) => [
                `x${f.factor}`,
                f.path,
                String(Number(f.value.toPrecision(5))),
                ['hear', 'turn', 'run', 'intercept', 'smoke'].map((step) => tick(f.margins[step])).join(' '),
                f.status,
                files[i] ?? '',
            ]);
            const head = ['factor', 'setting', 'value', 'hear turn run intercept smoke', 'status', 'file'];
            return `defender:predator ${goal}: smallest single changes that give it\n${padTable([head, ...rows]).join('\n')}`;
        })
        .join('\n\n');
}
