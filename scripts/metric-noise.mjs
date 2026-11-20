#!/usr/bin/env node
// Regenerates the target-metric power table from active design docs and the saved E210 power reading.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { METRICS } from '../js/evo/metric-registry/index.js';
import { withCurrentNames } from '../js/evo/metric-registry/renames.js';
import { findTargets, renderTable, replaceTable } from './lib/metric-noise.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DOC = `${ROOT}docs/designs/metric-noise.md`;

/** @returns {import('./lib/metric-noise.mjs').Target[]} active targets */
export function inventory() {
    const docs = Object.fromEntries(
        readdirSync(`${ROOT}docs/designs`)
            .filter((name) => name.endsWith('.md') && name !== 'metric-noise.md')
            .map((name) => [name, readFileSync(`${ROOT}docs/designs/${name}`, 'utf8')]),
    );
    return findTargets(docs, METRICS);
}

/** @param {string[]} args flags @param {(text: string) => void} [print] output @returns {number} exit code */
export function main(args, print = console.log) {
    if (args.length !== 1 || !['--metrics', '--references', '--write', '--check'].includes(args[0])) {
        print('usage: metric-noise --metrics|--references|--write|--check');
        return 2;
    }
    const targets = inventory();
    if (args[0] === '--metrics' || args[0] === '--references') {
        print(
            args[0] === '--metrics'
                ? targets.map((target) => target.metric).join(',')
                : JSON.stringify(targets, null, 2),
        );
        return 0;
    }
    return updateTable(args[0], targets, print);
}

/** @param {any} power saved power output @param {string} source raw source report @returns {void} */
export function validateEvidence(power, source) {
    const hash = createHash('sha256').update(source).digest('hex');
    if (power.source?.sha256 !== hash) {
        throw new Error('power source hash differs from E210; re-read power before regenerating');
    }
    if (!power.includeWatch || JSON.stringify(power.sizes) !== '[16,32,64]') {
        throw new Error('power requires include-watch and arm sizes 16,32,64');
    }
}

/** @param {string} mode write or check @param {import('./lib/metric-noise.mjs').Target[]} targets dependencies @param {(text: string) => void} print output @returns {number} exit code */
function updateTable(mode, targets, print) {
    const power = JSON.parse(readFileSync(`${ROOT}evals/power/metric-noise-E210.json`, 'utf8'));
    const source = readFileSync(`${ROOT}evals/power/defaults-floor-on-E210.json`, 'utf8');
    validateEvidence(power, source);
    const report = withCurrentNames(JSON.parse(source));
    const text = readFileSync(DOC, 'utf8');
    const table = renderTable(targets, power.rows, report, METRICS);
    const next = replaceTable(text, table);
    if (mode === '--write') {
        writeFileSync(DOC, next);
    } else if (text !== next) {
        print('metric-noise table is stale; run node scripts/metric-noise.mjs --write');
        return 1;
    }
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
