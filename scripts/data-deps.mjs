#!/usr/bin/env node
// Generates test/data-deps.json: the non-module paths each test file reads, which `scripts/affected.mjs` uses to pick the
// tests a change can reach (docs/designs/agent-workflow.md, Affected tests in CI).
//
// A test that builds a path the scan cannot resolve declares it in a `// reads: <path>, <path>` comment (`// reads: none`
// for a path that is not a repo file); the scan fails a test with an unresolved dynamic path and no declaration.
//
// Usage:
//   node scripts/data-deps.mjs --write   # regenerate test/data-deps.json
//   node scripts/data-deps.mjs --check   # exit 1 if it is stale or a test has an unresolved path (the `conventions` gate)
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIfEntrypoint } from './lib/cli-entrypoint.mjs';
import { buildDataDeps, DATA_DEPS_FILE, readDataDeps, renderDataDeps } from './lib/data-deps.mjs';

/**
 * @param {string[]} args `--write` or `--check`
 * @param {{root: string, out?: (line: string) => void}} env repo root and where lines go
 * @returns {number} the exit code
 */
export function main(args, { root, out = console.log }) {
    const mode = args[0];
    if (mode !== '--write' && mode !== '--check') {
        out('usage: node scripts/data-deps.mjs --write | --check');
        return 2;
    }
    const { deps, blind } = buildDataDeps(root);
    const problems = Object.entries(blind).map(
        ([test, exprs]) =>
            `${test}: reads a path the scan cannot resolve (${exprs.join(', ')}); declare it with "// reads: <path>"`,
    );
    if (mode === '--write') {
        writeFileSync(join(root, DATA_DEPS_FILE), renderDataDeps(deps));
        problems.forEach((line) => out(line));
        out(`${DATA_DEPS_FILE}: ${Object.keys(deps).length} tests read data or spawn scripts`);
        return problems.length > 0 ? 1 : 0;
    }
    if (JSON.stringify(readDataDeps(root)) !== JSON.stringify(deps)) {
        problems.push(`${DATA_DEPS_FILE} is stale. Run: node scripts/data-deps.mjs --write`);
    }
    problems.forEach((line) => out(line));
    return problems.length > 0 ? 1 : 0;
}

const root = fileURLToPath(new URL('..', import.meta.url));
await runIfEntrypoint(
    resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url),
    process.argv.slice(2),
    async (args) => main(args, { root }),
);
