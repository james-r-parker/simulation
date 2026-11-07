// A reflex score is a detector and a filter, never fitness (brain-reflex-tests.md, Use): nothing the live policy, the
// sim, the worker or the renderer runs may import a reflex module, so the score cannot reach fitness, merit, mate rank
// or archive rank.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../', import.meta.url).pathname;
const IMPORT = /(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
const REFLEX_MODULE = /(^|\/)reflex[-.][^/]*$/;

/**
 * @param {string} dir a directory under the repository root
 * @returns {string[]} every .js file under it, as a path from the root
 */
function sourceFiles(dir) {
    return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
            return sourceFiles(path);
        }
        return entry.name.endsWith('.js') ? [path] : [];
    });
}

/**
 * @param {string} text a module's source
 * @returns {string[]} the module specifiers it imports (static, re-exported or dynamic)
 */
function specifiersIn(text) {
    return [...text.matchAll(IMPORT)].map((match) => match[1]);
}

/**
 * @param {string} file a path from the root
 * @returns {string[]} the module specifiers the file imports
 */
function importsOf(file) {
    return specifiersIn(readFileSync(join(ROOT, file), 'utf8'));
}

/**
 * @param {string[]} files the files to scan
 * @returns {string[]} `file -> specifier` for every import of a `reflex-*` module
 */
function reflexImports(files) {
    return files.flatMap((file) =>
        importsOf(file)
            .filter((specifier) => REFLEX_MODULE.test(specifier))
            .map((specifier) => `${file} -> ${specifier}`),
    );
}

describe('reflex isolation', () => {
    it('finds the files to scan', () => {
        expect(sourceFiles('js/sim').length).toBeGreaterThan(50);
        expect(sourceFiles('js/evo/policies').length).toBeGreaterThan(0);
        expect(sourceFiles('js/worker').length).toBeGreaterThan(0);
        expect(sourceFiles('js/app').length).toBeGreaterThan(0);
    });

    it('recognises an import of a reflex module', () => {
        const probe =
            "import { x } from './reflex-eval.js';\nconst y = await import('../evo/reflex-cases.js');\nexport * from './reflex-score.js';";
        const found = specifiersIn(probe);
        expect(found).toEqual(['./reflex-eval.js', '../evo/reflex-cases.js', './reflex-score.js']);
        expect(found.every((s) => REFLEX_MODULE.test(s))).toBe(true);
        expect(REFLEX_MODULE.test('./brain.js')).toBe(false);
        expect(REFLEX_MODULE.test('../evo/reflex-eval.js')).toBe(true);
    });

    it('has no file under js/sim or js/evo/policies import a reflex module', () => {
        expect(reflexImports([...sourceFiles('js/sim'), ...sourceFiles('js/evo/policies')])).toEqual([]);
    });

    it('has no file in js/worker or js/app import a reflex module', () => {
        expect(reflexImports([...sourceFiles('js/worker'), ...sourceFiles('js/app')])).toEqual([]);
    });

    it('has no js/evo module outside the reflex ones import a reflex module', () => {
        const others = readdirSync(join(ROOT, 'js/evo'))
            .filter((name) => name.endsWith('.js') && !name.startsWith('reflex-'))
            .map((name) => `js/evo/${name}`);
        expect(others.length).toBeGreaterThan(50);
        expect(reflexImports(others)).toEqual([]);
    });
});
