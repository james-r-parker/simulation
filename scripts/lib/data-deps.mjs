// Builds test/data-deps.json: for each test file, the non-module paths it reads (scripts/lib/data-scan.mjs). The file is
// generated and the `conventions` gate fails when it is stale (docs/designs/agent-workflow.md, Affected tests in CI).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scanTest } from './data-scan.mjs';

export const DATA_DEPS_FILE = 'test/data-deps.json';

/**
 * Lists the Vitest test files under a directory.
 * @param {string} root repo root
 * @param {string} dir repo-relative directory to walk
 * @returns {string[]} repo-relative `*.test.js` paths, sorted
 */
export function listTests(root, dir = 'test') {
    /** @type {string[]} */
    const out = [];
    for (const name of readdirSync(join(root, dir)).sort()) {
        const path = `${dir}/${name}`;
        if (statSync(join(root, path)).isDirectory()) {
            out.push(...listTests(root, path));
        } else if (name.endsWith('.test.js')) {
            out.push(path);
        }
    }
    return out;
}

/**
 * Scans every test.
 * @param {string} root repo root
 * @returns {{deps: Record<string, string[]>, blind: Record<string, string[]>}} the reads of each test that has any, and the
 *   path expressions the scan could not resolve in a test with no `// reads:` declaration
 */
export function buildDataDeps(root) {
    /** @type {Record<string, string[]>} */
    const deps = {};
    /** @type {Record<string, string[]>} */
    const blind = {};
    const exists = (/** @type {string} */ path) => existsSync(join(root, path));
    for (const test of listTests(root)) {
        const found = scanTest(readFileSync(join(root, test), 'utf8'), test, exists);
        if (found.reads.length > 0) {
            deps[test] = found.reads;
        }
        if (found.blind.length > 0) {
            blind[test] = found.blind;
        }
    }
    return { deps, blind };
}

/**
 * Serialises the map: sorted keys, one path per line, a trailing newline, no timestamp.
 * @param {Record<string, string[]>} deps the map
 * @returns {string} the file text
 */
export function renderDataDeps(deps) {
    return `${JSON.stringify(deps, null, 4)}\n`;
}

/**
 * Reads a committed map.
 * @param {string} root repo root
 * @returns {Record<string, string[]> | null} the map, or null when the file is missing or not JSON
 */
export function readDataDeps(root) {
    try {
        return JSON.parse(readFileSync(join(root, DATA_DEPS_FILE), 'utf8'));
    } catch {
        return null;
    }
}
