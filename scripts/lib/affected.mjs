// Which tests a change can reach (docs/designs/agent-workflow.md, Affected tests in CI). `affectedTests` classifies a diff
// into a mode and, for `affected`, lists the test files whose module graph, data reads or spawned scripts hold a changed
// path. A pull request runs those; the push to `main` runs the whole suite on the merged result.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDataDeps, listTests, readDataDeps } from './data-deps.mjs';
import { importGraph } from './import-graph.mjs';
import { readerModules } from './module-reads.mjs';

/** Paths that can change how every test runs or what it measures: the whole suite runs for any of them. */
const FULL_EXACT = new Set([
    'package.json',
    'package-lock.json',
    'vitest.config.js',
    'tsconfig.json',
    'scripts/check.sh',
    'scripts/lib/test-scope.mjs',
    'js/sim/wasm-binary.js',
    '.node-version',
]);
const FULL_PREFIX = ['.github/workflows/', 'wasm/', 'test/helpers/'];
const FULL_PATTERN = /^(?:eslint\.config\.[cm]?js|\.eslintrc[\w.]*|tsconfig[\w.-]*\.json)$/;
const MODULE_FILE = /\.(?:m?js|cjs)$/;

/**
 * @param {string} path a changed repo path
 * @returns {boolean} whether the path is on the full list
 */
export function onFullList(path) {
    return FULL_EXACT.has(path) || FULL_PREFIX.some((prefix) => path.startsWith(prefix)) || FULL_PATTERN.test(path);
}

/**
 * Markdown that no build or test reads beyond the design-doc tests: the rule of scripts/change-scope.sh.
 * @param {string} path a changed repo path
 * @returns {boolean} whether the path is docs-only
 */
export function isDocsPath(path) {
    if (path.startsWith('docs/') || path.startsWith('.claude/')) {
        return path.endsWith('.md');
    }
    return !path.includes('/') && path.endsWith('.md');
}

/**
 * @param {string} path a changed repo path
 * @returns {boolean} whether the path is an experiment record, a decision report or Markdown under docs/
 */
function isRecordsPath(path) {
    return (
        path.startsWith('evals/ledger/') ||
        path.startsWith('evals/decisions/') ||
        (path.startsWith('docs/') && path.endsWith('.md'))
    );
}

/**
 * @param {string} entry a `data-deps.json` entry: a path, a directory or a glob with `*`
 * @param {string} path a changed path
 * @returns {boolean} whether the change falls on the entry
 */
export function entryHolds(entry, path) {
    if (!entry.includes('*')) {
        return path === entry || path.startsWith(`${entry}/`);
    }
    const source = entry
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '\0')
        .replace(/\*/g, '[^/]*')
        .replace(/\0/g, '.*');
    return new RegExp(`^${source}(?:/|$)`).test(path);
}

/**
 * Finds why a test is reached by the changed paths.
 * @param {string} test the test file
 * @param {{changed: string[], missing: string[], reads: string[], closure: Set<string>, readers: Map<string, string>, text: () => string, graph: ReturnType<typeof importGraph>}} facts what is known about it
 * @returns {string | null} the first reason, or null when the change cannot reach it
 */
function reasonFor(test, { changed, missing, reads, closure, readers, text, graph }) {
    if (changed.includes(test)) {
        return 'changed test';
    }
    // The modules the test imports, and those of the scripts it spawns.
    const modules = new Set(closure);
    reads.filter((e) => MODULE_FILE.test(e)).forEach((e) => graph.closure(e).forEach((m) => modules.add(m)));
    for (const path of changed) {
        if (modules.has(path)) {
            return `imports ${path}`;
        }
        const entry = reads.find((e) => entryHolds(e, path));
        if (entry !== undefined) {
            return `reads ${entry}`;
        }
    }
    const reader = [...readers.keys()].find((module) => modules.has(module));
    if (reader !== undefined) {
        return `${reader} reads ${readers.get(reader)}`;
    }
    const named = missing.find((path) => text().includes(path));
    return named === undefined ? null : `names removed ${named}`;
}

/**
 * Lists the tests a set of changed paths can reach.
 * @param {string[]} changed repo-relative changed paths (`git diff --name-only --no-renames`)
 * @param {string} root repo root
 * @param {Record<string, string[]>} deps the non-module reads of each test (test/data-deps.json)
 * @returns {{tests: string[], why: Record<string, string>}} the reached files, sorted, and the first reason for each
 */
export function reachedTests(changed, root, deps) {
    const graph = importGraph(root);
    const readers = readerModules(root, changed, entryHolds);
    const missing = changed.filter((path) => !existsSync(join(root, path)));
    /** @type {Record<string, string>} */
    const why = {};
    for (const test of listTests(root)) {
        const text = () => readFileSync(join(root, test), 'utf8');
        const reason = reasonFor(test, {
            changed,
            missing,
            reads: deps[test] ?? [],
            closure: graph.closure(test),
            readers,
            text,
            graph,
        });
        if (reason !== null) {
            why[test] = reason;
        }
    }
    return { tests: Object.keys(why).sort(), why };
}

/**
 * Classifies a diff and, for most, lists the tests it can reach.
 * @param {string[]} changedPaths repo-relative changed paths
 * @param {{root: string, deps?: Record<string, string[]>}} env the repo root and, to replay another tree, its reads (default `test/data-deps.json`, else a fresh scan)
 * @returns {{mode: 'docs' | 'records' | 'full' | 'affected', tests: string[], why: Record<string, string>}} the mode, the reached
 *   test files (empty unless `affected`) and why: a reason per test, or under `*` the reason for a mode
 */
export function affectedTests(changedPaths, { root, deps }) {
    const changed = [...new Set(changedPaths.filter(Boolean))].sort();
    if (changed.length === 0) {
        return { mode: 'full', tests: [], why: { '*': 'empty diff: nothing to select from' } };
    }
    if (changed.every(isDocsPath)) {
        return { mode: 'docs', tests: [], why: { '*': 'only Markdown no build or test reads' } };
    }
    if (changed.every(isRecordsPath)) {
        return { mode: 'records', tests: [], why: { '*': 'only experiment records, decision reports and docs' } };
    }
    const full = changed.find(onFullList);
    if (full !== undefined) {
        return { mode: 'full', tests: [], why: { '*': `${full} is on the full list` } };
    }
    const known = deps ?? readDataDeps(root) ?? buildDataDeps(root).deps;
    return { mode: 'affected', ...reachedTests(changed, root, known) };
}
