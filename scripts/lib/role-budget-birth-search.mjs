// The `--search` of the first-meal rows for `npm run role:budget`: the birth-energy and cold changes that turn a red first-meal row
// `ok` without raising the sitter's ratio, each written as an overrides file `--config` reads (docs/designs/role-budget.md,
// "The sitter").
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { searchBirth } from '../../js/evo/role-budget-search-birth.js';
import { padTable } from './drill-report.mjs';

/** The most findings of one spec the search writes override files for. */
const FILES_PER_SPEC = 3;

/**
 * @param {Readonly<Record<string, any>>} config the validated world config
 * @param {{overrides: Record<string, any>, model: import('../../js/evo/role-budget-model.js').RoleModel, outDir: string,
 *   arm: string, rows: {name: string, status: string}[]}} where the overrides that made it, the model, the output directory,
 *   the arm's name and the matrix rows
 * @returns {{spec: string, findings: import('../../js/evo/role-budget-search-birth.js').BirthFinding[], files: string[]}[]} the search
 *   of each non-hunting spec whose first-meal row is not `ok`, and the override files written
 */
export function searchBirthRows(config, { overrides, model, outDir, arm, rows }) {
    const red = rows.filter(
        (r) => r.name.endsWith(':first-meal') && r.name !== 'predator:first-meal' && r.status !== 'ok',
    );
    return red.map((row) => {
        const spec = row.name.slice(0, row.name.indexOf(':'));
        const findings = searchBirth(config, { spec, overrides, model }).slice(0, FILES_PER_SPEC);
        if (findings.length > 0) {
            mkdirSync(outDir, { recursive: true });
        }
        const files = findings.map((f, i) => {
            const file = join(outDir, `${arm}-${spec}-birth-${i + 1}.json`);
            writeFileSync(file, `${JSON.stringify(f.overrides, null, 2)}\n`);
            return file;
        });
        return { spec, findings, files };
    });
}

/**
 * @param {ReturnType<typeof searchBirthRows>} searched the search of each spec
 * @returns {string} for each spec the smallest changes that turn its first meal `ok` with the sitter's ratio, and the file
 */
export function formatBirthSearch(searched) {
    return searched
        .map(({ spec, findings, files }) => {
            if (findings.length === 0) {
                return `${spec}:first-meal: no birth-energy change, alone or with a cold setting, turns it ok without raising the idle ratio`;
            }
            const rows = findings.map((f, i) => [
                f.changes.map((c) => `${c.path}=${Number(c.value.toPrecision(5))} (x${c.factor})`).join(' + '),
                f.ratio.toFixed(2),
                files[i] ?? '',
            ]);
            return `${spec}:first-meal: smallest changes that turn it ok with the idle ratio not above the baseline\n${padTable([['changes', 'idle ratio', 'file'], ...rows]).join('\n')}`;
        })
        .join('\n\n');
}
