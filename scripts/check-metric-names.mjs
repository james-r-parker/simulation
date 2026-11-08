// Checks that every metric name written in the repo is in the metric registry (the `conventions` gate runs it;
// docs/designs/metric-trust.md, Every new metric is registered). It reads
// - the string and template literals that start with `eval.` in js/, scripts/ and test/ (.js and .mjs files) and in the
//   top-level evals/*.json configs and grids;
// - the `**Targets:**` lines of the phases of docs/designs/*.md that are not yet marked `(built)`;
// and fails on a name that has no registry entry and no `renamedFrom` entry. A trailing `*` or `<placeholder>` in a
// Targets line, and a template literal that goes on after an interpolation, match every name that starts with the part
// before it.
//
// Not read: js/evo/metric-registry/ (it defines the names), test/fixtures/, the tests of this check and of the
// designs-index Targets check (their made-up repos name made-up metrics), evals/experiments.json and evals/experiments/
// (history: a record names a metric as it was called when the run was made, and a rename keeps the old name there),
// evals/results/, evals/power/, evals/baselines/, evals/ladder/ and evals/screens/results/ (reports), and the Targets of
// built phases (they describe what shipped). A made-up name that a test needs is listed in `LET_THROUGH` below with its reason.
// Usage: node scripts/check-metric-names.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { METRICS } from '../js/evo/metric-registry/index.js';
import { isRegistered, LET_THROUGH, literalUses, targetUses } from './lib/metric-names.mjs';

export { LET_THROUGH };

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Source directories read in full, and the kinds of file read in them. */
const SOURCE_DIRS = ['js', 'scripts', 'test'];
const SOURCE_FILE = /\.(js|mjs)$/;

/** Paths (relative to the root, with a `/` at the end of a directory) that are not read. */
const SKIPPED = [
    'js/evo/metric-registry/',
    'test/fixtures/',
    'test/check-metric-names.test.js',
    'test/designs-index.test.js',
    'node_modules/',
];

/**
 * @param {string} dir a directory
 * @returns {string[]} the paths of the files below it, sorted
 */
function filesUnder(dir) {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .map((entry) => join(dir, entry))
        .filter((path) => statSync(path).isFile())
        .sort();
}

/**
 * @param {string} root the repo root
 * @returns {{ file: string, kind: 'source' | 'doc' }[]} the files to read, relative to the root
 */
export function filesToRead(root) {
    const sources = SOURCE_DIRS.flatMap((dir) => filesUnder(join(root, dir)))
        .filter((path) => SOURCE_FILE.test(path))
        .map((path) => relative(root, path));
    const configs = readdirSync(join(root, 'evals'))
        .filter((name) => name.endsWith('.json') && name !== 'experiments.json')
        .map((name) => join('evals', name));
    const docs = readdirSync(join(root, 'docs/designs'))
        .filter((name) => name.endsWith('.md'))
        .map((name) => join('docs/designs', name));
    const kept = [...sources, ...configs].filter((file) => !SKIPPED.some((skip) => file.startsWith(skip)));
    return [
        ...kept.map((file) => ({ file, kind: /** @type {const} */ ('source') })),
        ...docs.map((file) => ({ file, kind: /** @type {const} */ ('doc') })),
    ];
}

/**
 * @typedef {object} CheckOptions
 * @property {Readonly<Record<string, string>>} [letThrough] names let through with their reasons (`LET_THROUGH`)
 * @property {Parameters<typeof isRegistered>[1]} [metrics] the registry (`METRICS`)
 */

/**
 * @param {string} root the repo root
 * @param {Parameters<typeof isRegistered>[1]} metrics the registry
 * @param {Readonly<Record<string, string>>} letThrough the names let through
 * @returns {string[]} one line per name in a file that the registry does not know
 */
function unknownNames(root, metrics, letThrough) {
    /** @type {string[]} */
    const problems = [];
    for (const { file, kind } of filesToRead(root)) {
        const text = readFileSync(join(root, file), 'utf8');
        const uses = kind === 'doc' ? targetUses(text) : literalUses(text);
        for (const use of uses.filter((u) => !isRegistered(u, metrics) && !Object.hasOwn(letThrough, u.name))) {
            const how = use.prefix ? 'no metric starts with' : 'is not a registered metric:';
            problems.push(
                `${file}:${use.line}: ${use.name} ${how} - add it to js/evo/metric-registry/ or fix the name`,
            );
        }
    }
    return problems;
}

/**
 * @param {string} root the repo root
 * @param {CheckOptions} [options] the names let through and the registry
 * @returns {string[]} one problem line per unregistered name (`file:line: name ...`) and per stale `letThrough` name
 */
export function checkMetricNames(root = ROOT, { letThrough = LET_THROUGH, metrics = METRICS } = {}) {
    const stale = Object.keys(letThrough)
        .filter((name) => isRegistered({ name, prefix: false }, metrics))
        .map((name) => `scripts/check-metric-names.mjs: ${name} is in the registry now - delete it from LET_THROUGH`);
    return [...unknownNames(root, metrics, letThrough), ...stale];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const problems = checkMetricNames();
    for (const problem of problems) {
        console.log(problem);
    }
    process.exit(problems.length === 0 ? 0 : 1);
}
