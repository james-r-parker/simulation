// The static import graph of the repo's own modules: which files a module reaches through relative `import`, `export ...
// from` and `import()` specifiers. Used to find the tests a changed file can reach (scripts/lib/affected.mjs). A bare
// specifier (a package) is not followed: a package change is a package.json change, which runs the full suite.
import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]+)\1/g;
const MODULE = /\.(?:m?js|cjs|json)$/;

/**
 * Lists the relative specifiers of a module, resolved against its own path.
 * @param {string} source module source
 * @param {string} path repo-relative path of the module
 * @returns {string[]} repo-relative paths it imports (not checked for existence)
 */
export function importsOf(source, path) {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return [...code.matchAll(SPECIFIER)].map((m) => posix.normalize(posix.join(posix.dirname(path), m[2] ?? '')));
}

/**
 * A lazy, memoised import graph over a repo tree.
 * @param {string} root repo root
 * @param {(path: string) => string | null} [read] reads a repo-relative file's text, or null when it is missing
 * @returns {{closure: (path: string) => Set<string>}} `closure(path)` is the file and every file it reaches
 */
export function importGraph(root, read = defaultRead(root)) {
    /** @type {Map<string, string[]>} */
    const direct = new Map();
    /** @type {Map<string, Set<string>>} */
    const memo = new Map();
    /** @param {string} path @returns {string[]} */
    const edges = (path) => {
        if (!direct.has(path)) {
            const text = MODULE.test(path) && !path.endsWith('.json') ? read(path) : null;
            direct.set(path, text === null ? [] : importsOf(text, path));
        }
        return direct.get(path) ?? [];
    };
    return {
        closure(path) {
            const cached = memo.get(path);
            if (cached) {
                return cached;
            }
            const seen = new Set([path]);
            const stack = [path];
            while (stack.length > 0) {
                for (const next of edges(stack.pop() ?? '')) {
                    if (!seen.has(next)) {
                        seen.add(next);
                        stack.push(next);
                    }
                }
            }
            memo.set(path, seen);
            return seen;
        },
    };
}

/**
 * @param {string} root repo root
 * @returns {(path: string) => string | null} a reader of repo-relative files
 */
function defaultRead(root) {
    return (path) => {
        const full = `${root}/${path}`;
        return existsSync(full) ? readFileSync(full, 'utf8') : null;
    };
}
