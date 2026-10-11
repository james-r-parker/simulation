#!/usr/bin/env node
// Design doc index generator and lint.
//
// Reads the `**Status:**` line out of every docs/designs/*.md and regenerates docs/designs/README.md: a build queue
// ordered by each unbuilt doc's `**Priority:**` rank, then every doc grouped by status. The status line is the single
// source of truth - see docs/designs/STYLE.md. Docs are also linted (scripts/design-docs/): Task breakdown table, one
// `**Targets:**` line per unbuilt phase, Delivery requirements cells, links that resolve and no line references.
//
// Usage:
//   node scripts/designs-index.mjs            # print the index to stdout
//   node scripts/designs-index.mjs --write    # (re)write docs/designs/README.md
//   node scripts/designs-index.mjs --check    # exit 1 if the committed index is stale or a doc fails the lint

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DesignDocError, toLf } from './design-docs/markdown.mjs';
import { buildIndex } from './design-docs/render-index.mjs';

export { DesignDocError } from './design-docs/markdown.mjs';
export { parseDoc } from './design-docs/parse-doc.mjs';
export { buildIndex, readDocs, renderIndex } from './design-docs/render-index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX_PATH = path.join(ROOT, 'docs', 'designs', 'README.md');

/**
 * Runs the CLI and returns its exit code.
 * @param {string[]} args
 * @returns {number}
 */
export function main(args) {
    const unknown = args.filter((a) => a !== '--write' && a !== '--check');
    if (unknown.length > 0) {
        process.stderr.write(`unknown argument: ${unknown.join(' ')} (expected --write or --check)\n`);
        return 2;
    }
    let markdown;
    try {
        markdown = buildIndex(path.dirname(INDEX_PATH));
    } catch (error) {
        if (error instanceof DesignDocError) {
            process.stderr.write(`${error.message}\n`);
            return 1;
        }
        throw error;
    }
    if (args.includes('--check')) {
        return checkIndex(markdown);
    }
    if (args.includes('--write')) {
        writeFileSync(INDEX_PATH, markdown);
        process.stdout.write(`Wrote ${path.relative(ROOT, INDEX_PATH)}\n`);
        return 0;
    }
    process.stdout.write(markdown);
    return 0;
}

/**
 * @param {string} markdown
 */
function checkIndex(markdown) {
    const current = existsSync(INDEX_PATH) ? readFileSync(INDEX_PATH, 'utf8') : '';
    if (toLf(current) !== toLf(markdown)) {
        process.stderr.write('docs/designs/README.md is stale. Run: node scripts/designs-index.mjs --write\n');
        return 1;
    }
    process.stdout.write('Design doc index is up to date.\n');
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    process.exitCode = main(process.argv.slice(2));
}
