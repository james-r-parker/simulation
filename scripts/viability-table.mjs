#!/usr/bin/env node
// Prints the viability table of natural-selection.md Phase 4 for each eval report named on the command line, one table
// per run: `node scripts/viability-table.mjs <report.json> [<report.json> ...]`.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { formatViability, viabilityTable } from './lib/viability-table.mjs';

const files = process.argv.slice(2);
if (files.length === 0) {
    console.error('usage: viability-table <report.json> [<report.json> ...]');
    process.exit(2);
}
for (const file of files) {
    const report = JSON.parse(readFileSync(file, 'utf8'));
    console.log(formatViability(viabilityTable(report), basename(file)));
}
