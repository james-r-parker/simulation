#!/usr/bin/env node
// Re-records test/sim/fixtures/wasm-brain-reference.json from the brain kernel (docs/designs/body-genes.md, "What a
// layout change touches"): the digest of every per-call and stepped case of test/sim/helpers/brain-reference.js. Run it
// only for a change meant to move the digests (a layout or pooling change), after the naive pooling reference of
// test/sim/ray-pool.test.js agrees with the kernel; `--note` records why the fixture moved.
// Usage: node scripts/record-brain-reference.mjs --note "<why the digests moved>"
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forwardAll } from '../js/sim/brain.js';
import { REFERENCE_URL, recordReference } from '../test/sim/helpers/brain-reference.js';
import { runIfEntrypoint } from './lib/cli-entrypoint.mjs';

const USAGE = 'usage: record-brain-reference --note "<why the digests moved>"';

/**
 * @param {string[]} argv the command-line arguments
 * @returns {{ note: string }} the note to record
 * @throws {Error} the usage, when `--note` is missing or empty or another argument is given
 */
export function parseArgs(argv) {
    if (argv.length !== 2 || argv[0] !== '--note' || argv[1].trim() === '') {
        throw new Error(USAGE);
    }
    return { note: argv[1] };
}

/**
 * @param {string} note why the fixture moved
 * @param {{ unit: Record<string, string[]>, stepped: Record<string, string[]> }} digests the recorded digests
 * @returns {string} the fixture's text: the note, then the per-call and stepped digests, two-space indented
 */
export function fixtureText(note, digests) {
    return `${JSON.stringify({ note, unit: digests.unit, stepped: digests.stepped }, null, 2)}\n`;
}

/**
 * @param {string[]} argv the command-line arguments
 * @returns {Promise<number>} the exit code
 */
async function main(argv) {
    const { note } = parseArgs(argv);
    writeFileSync(REFERENCE_URL, fixtureText(note, recordReference(forwardAll)));
    console.log(`wrote ${fileURLToPath(REFERENCE_URL)}`);
    return 0;
}

await runIfEntrypoint(resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url), process.argv.slice(2), main);
