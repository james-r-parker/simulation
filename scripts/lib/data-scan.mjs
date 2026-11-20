// Finds the non-module paths a test file reads: fixtures, data files, docs, and the scripts and workers it spawns
// (docs/designs/agent-workflow.md, Affected tests in CI). A test's `import`s are its module graph, which
// scripts/lib/import-graph.mjs follows; this scan covers what an import does not carry. It is conservative: a string
// literal that names an existing repo path counts as a read, so a test may depend on more than it opens, never on less.
import { posix } from 'node:path';

const STRING = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
/** Calls whose first argument is a path the scan cannot pass over silently when it is dynamic. */
const READERS = /\b(?:readFileSync|readFile|readdirSync|readdir|statSync|existsSync|new URL|Worker)\(\s*/g;
/** A test that makes its own temporary directory reads paths the repo does not hold. */
const TEMP = /\b(?:mkdtemp|mkdtempSync|tmpdir)\b/;
/** Ignored or generated directories: a path under one exists on some machines only, so it is never a dependency. */
const GENERATED =
    /^(?:node_modules|\.checklogs|\.sim|\.runs|coverage|dist|TestResults|reports|evals\/results|\.bench-micro|\.wrangler|wasm\/target|\.claude\/worktrees)(?:\/|$)/;
const DECLARED = /^\s*\/\/ reads: /m;
const DECLARATION = /^\s*\/\/ reads: (.+)$/gm;

/**
 * Removes comments, so a path in a comment is not a read. String contents are kept as they are.
 * @param {string} source JavaScript source
 * @returns {string} the source without `//` lines and block comments
 */
export function stripComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/**
 * Reads the `// reads: <path-or-glob>, ...` declarations of a test.
 * @param {string} source the test's source
 * @returns {string[]} the declared paths and globs, in order
 */
export function declaredReads(source) {
    return [...source.matchAll(DECLARATION)].flatMap((m) =>
        (m[1] ?? '')
            .split(',')
            .map((part) => part.trim())
            .filter((part) => part && part !== 'none'),
    );
}

/**
 * Tells whether a literal is the specifier of an `import` or `vi.mock`: the module graph holds those.
 * @param {string} before the source text before the literal
 * @returns {boolean} true for `from '...'`, `import '...'`, `import('...')` and `vi.mock('...')`
 */
function isImportSpecifier(before) {
    return /(?:\bfrom|\bimport|\bvi\.(?:mock|doMock)\(|\bimport\()\s*\(?\s*$/.test(before);
}

/**
 * Candidate repo-relative paths for a literal: from the repo root, and from the test's own directory when it is relative.
 * @param {string} text the literal, or joined literals
 * @param {string} testPath repo-relative path of the test
 * @returns {string[]} normalised repo-relative candidates
 */
function candidates(text, testPath) {
    const out = [posix.normalize(text.replace(/^\.\//, ''))];
    if (text.startsWith('.')) {
        out.push(posix.normalize(posix.join(posix.dirname(testPath), text)));
    }
    return out.filter((path) => path !== '.' && !path.startsWith('..') && !path.startsWith('/'));
}

/**
 * The path a template literal names: a leading `${ROOT}` is dropped, then the static text before the next `${` is cut back
 * to a directory (`${ROOT}docs/designs/${name}` reads under docs/designs), or kept whole when no other `${` follows.
 * @param {string} text the template text
 * @returns {string} the static path or directory, or '' when there is none
 */
function templateDir(text) {
    const rooted = text.startsWith('${') ? text.slice(text.indexOf('}') + 1).replace(/^\//, '') : text;
    const at = rooted.indexOf('${');
    if (at < 0) {
        return rooted;
    }
    const prefix = rooted.slice(0, at);
    return prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '';
}

/**
 * The text of each `join(...)` or `resolve(...)` call's literal arguments, joined by `/`.
 * @param {string} code source without comments
 * @returns {string[]} one joined path per call that has at least one literal
 */
function joinedLiterals(code) {
    return [...code.matchAll(/\b(?:join|resolve)\(([^()]*)\)/g)]
        .map((m) => [...(m[1] ?? '').matchAll(STRING)].map((s) => s[2] ?? '').join('/'))
        .filter(Boolean);
}

/**
 * Lists the first-argument expressions of the path-reading calls that hold no string literal at all and no `join`.
 * Those are paths the scan cannot see; the author declares them with `// reads:`.
 * @param {string} code source without comments
 * @returns {string[]} the unresolved expressions
 */
function blindArguments(code) {
    const blind = [];
    for (const m of TEMP.test(code) ? [] : code.matchAll(READERS)) {
        const rest = code.slice((m.index ?? 0) + m[0].length);
        const arg = /^[^,)]*(?:\([^()]*\)[^,)]*)*/.exec(rest)?.[0] ?? '';
        if (!/['"`]/.test(arg) && !/\b(?:join|resolve)\(/.test(arg)) {
            blind.push(arg.trim());
        }
    }
    return blind;
}

/**
 * Scans one test file.
 * @param {string} source the test's source
 * @param {string} testPath repo-relative path of the test
 * @param {(path: string) => boolean} exists whether a repo-relative path is a file or directory
 * @returns {{reads: string[], blind: string[]}} the paths it reads (sorted, with its `// reads:` declarations) and the path expressions it cannot resolve
 */
export function scanTest(source, testPath, exists) {
    const code = stripComments(source);
    /** @type {Set<string>} */
    const reads = new Set(declaredReads(source));
    /** @param {string} text a path to try @returns {void} */
    const add = (text) => {
        for (const path of candidates(text, testPath)) {
            if (exists(path) && path !== testPath && !GENERATED.test(path)) {
                reads.add(path);
            }
        }
    };
    for (const m of code.matchAll(STRING)) {
        const text = m[2] ?? '';
        if (isImportSpecifier(code.slice(0, m.index))) {
            continue;
        }
        const path = text.includes('${') ? templateDir(text) : text;
        if (/[/.]/.test(path)) {
            add(path);
        }
    }
    joinedLiterals(code).forEach(add);
    return { reads: [...reads].sort(), blind: DECLARED.test(source) ? [] : blindArguments(code) };
}
