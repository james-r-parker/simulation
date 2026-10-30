#!/usr/bin/env node
// Prints the viability table of natural-selection.md Phase 4 for each eval report named on the command line, one table
// per run: `node scripts/viability-table.mjs <report.json> [<report.json> ...]`.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatViability, viabilityTable } from './lib/viability-table.mjs';

/**
 * @param {string[]} files the report paths
 * @param {(text: string) => void} print where each table goes
 * @returns {number} the exit code: 2 without a report
 */
export function main(files, print) {
    if (files.length === 0) {
        print('usage: viability-table <report.json> [<report.json> ...]');
        return 2;
    }
    for (const file of files) {
        print(formatViability(viabilityTable(JSON.parse(readFileSync(file, 'utf8'))), basename(file)));
    }
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2), console.log);
}
