// The modules and scripts that read a data file at run time: a test that imports or spawns one reads that file too
// (scripts/metric-noise.mjs reads docs/designs/*.md; test/metric-noise.test.js names none of them). The same scan as
// test/data-deps.json (scripts/lib/data-scan.mjs), run over the modules instead of the tests.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { scanTest } from './data-scan.mjs';

/** Where the repo keeps modules that tests import or spawn. */
const MODULE_DIRS = ['js', 'scripts', 'functions', 'public', 'test/helpers'];
const MODULE_FILE = /\.(?:m?js|cjs)$/;

/**
 * Lists the module files under a directory.
 * @param {string} root repo root
 * @param {string} dir repo-relative directory
 * @returns {string[]} repo-relative `.js`, `.mjs` and `.cjs` paths
 */
export function listModules(root, dir) {
    if (!existsSync(join(root, dir))) {
        return [];
    }
    return readdirSync(join(root, dir)).flatMap((name) => {
        const path = `${dir}/${name}`;
        if (name === 'node_modules') {
            return [];
        }
        if (statSync(join(root, path)).isDirectory()) {
            return listModules(root, path);
        }
        return MODULE_FILE.test(name) ? [path] : [];
    });
}

/**
 * Finds the modules whose data reads hold a changed path.
 * @param {string} root repo root
 * @param {string[]} changed the changed paths that still exist (a removed path is found by name instead)
 * @param {(entry: string, path: string) => boolean} holds whether a read entry covers a changed path
 * @returns {Map<string, string>} each module that reads a changed path, with the entry it reads
 */
export function readerModules(root, changed, holds) {
    /** @type {Map<string, string>} */
    const readers = new Map();
    const exists = (/** @type {string} */ path) => existsSync(join(root, path));
    for (const module of MODULE_DIRS.flatMap((dir) => listModules(root, dir))) {
        const { reads } = scanTest(readFileSync(join(root, module), 'utf8'), module, exists);
        const entry = reads.find((e) => changed.some((path) => path !== module && holds(e, path)));
        if (entry !== undefined) {
            readers.set(module, entry);
        }
    }
    return readers;
}
