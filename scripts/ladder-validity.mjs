// Prints the validity of every drill condition of a stage ladder (docs/designs/training-stages.md, Gates, Validity): which
// scripted references pass it, whether the random brains fail it, and the weakest reference that passes.
//   node scripts/ladder-validity.mjs [--ladder <file.json>] [--trials <n>] [--seed <n>]
// Exit code 1 when a condition is invalid (no reference passes it) or random brains pass it.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REFERENCE_KINDS, gateValidity } from '../js/evo/gate-validity.js';

/**
 * @param {readonly import('../js/evo/gate-validity.js').Validity[]} rows the validity rows
 * @returns {string[]} the table lines
 */
export function formatValidity(rows) {
    const head = `${'stage'.padEnd(14)}${'condition'.padEnd(46)}${REFERENCE_KINDS.map((k) => k.padEnd(13)).join('')}random-fails  level`;
    const lines = rows.map((r) => {
        const marks = REFERENCE_KINDS.map((k) => (r.passedBy[k] ? 'pass' : '-').padEnd(13)).join('');
        return `${r.stage.padEnd(14)}${r.read.padEnd(46)}${marks}${String(r.randomFails).padEnd(14)}${r.level}`;
    });
    return [head, ...lines];
}

/**
 * @param {string[]} argv the arguments after the script name
 * @returns {number} the exit code
 */
export function main(argv) {
    const get = (/** @type {string} */ flag, /** @type {string} */ fallback) => {
        const at = argv.indexOf(flag);
        return at >= 0 ? argv[at + 1] : fallback;
    };
    const ladder = JSON.parse(readFileSync(resolve(get('--ladder', 'evals/train-ladder.json')), 'utf8'));
    const rows = gateValidity(ladder, { seed: Number(get('--seed', '1')), trials: Number(get('--trials', '64')) });
    console.log(formatValidity(rows).join('\n'));
    return rows.some((r) => r.level === 'none' || !r.randomFails) ? 1 : 0;
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
