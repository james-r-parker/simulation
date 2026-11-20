// The `ratchet-related` gate: runs the tests related to the files this branch changed with coverage, and holds each
// changed source file in a 100% directory to 100% (scripts/lib/ratchet-files.mjs). It never edits the baseline.
// Exit 0 passes, 1 fails, 3 skips (no changed file is under a 100% baseline).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileMisses, strictSources } from './lib/ratchet-files.mjs';

/**
 * Lists the files changed against the merge base with `base`: committed, staged, unstaged and new.
 * @param {string} root repo root
 * @param {string} base ref to compare with
 * @returns {string[]} repo-relative paths of added, copied, modified and renamed files
 */
export function changedFiles(root, base) {
    /** @param {string[]} args git arguments @returns {string[]} output lines */
    const git = (args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    const [mergeBase] = git(['merge-base', base, 'HEAD']);
    const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', mergeBase ?? base]);
    return [...new Set([...tracked, ...git(['ls-files', '--others', '--exclude-standard'])])];
}

/**
 * Reads a JSON file, or an empty object when it is missing.
 * @param {string} path file to read
 * @returns {any} parsed JSON
 */
function readOptional(path) {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

/**
 * Splits the arguments.
 * @param {string[]} argv `--base <ref>` (default origin/main)
 * @returns {{base: string}} the options
 */
function parseArgs(argv) {
    const at = argv.indexOf('--base');
    return { base: at >= 0 && argv[at + 1] ? argv[at + 1] : 'origin/main' };
}

/**
 * Runs the gate.
 * @param {string[]} argv `--base <ref>`
 * @param {{root: string, vitest?: string}} env repo root, and the vitest binary (default node_modules/.bin/vitest)
 * @returns {number} exit status: 0 pass, 1 fail, 3 skipped
 */
export function main(argv, { root, vitest = join(root, 'node_modules/.bin/vitest') }) {
    const { base } = parseArgs(argv);
    const baseline = readOptional(join(root, 'scripts/quality-baseline.json'));
    const changed = changedFiles(root, base);
    const sources = strictSources(changed, baseline);
    if (sources.length === 0) {
        console.log(`no changed file under a 100% coverage baseline (against ${base})`);
        return 3;
    }
    const dir = mkdtempSync(join(tmpdir(), 'ratchet-related-'));
    try {
        const related = changed.filter((file) => /\.m?js$/.test(file));
        const args = ['related', '--run', '--passWithNoTests', '--exclude', '**/*.slow.test.js'];
        args.push('--coverage', `--coverage.reportsDirectory=${dir}`, '--coverage.reportOnFailure');
        args.push('--coverage.reporter=json-summary', '--coverage.reporter=json');
        sources.forEach((file) => args.push(`--coverage.include=${file}`));
        const run = spawnSync(vitest, [...args, ...related], { cwd: root, stdio: 'inherit' });
        if (run.status !== 0) {
            console.error('the related tests failed (see above)');
            return 1;
        }
        const summary = readOptional(join(dir, 'coverage-summary.json'));
        const final = readOptional(join(dir, 'coverage-final.json'));
        const misses = fileMisses(summary, final, baseline, { root, files: sources });
        if (misses.length > 0) {
            console.error(`changed files below 100% where the baseline is 100% (${sources.length} measured):`);
            misses.forEach((line) => console.error(line));
            console.error(
                'only the related tests ran, without *.slow.test.js; a file covered by a slow test needs it run',
            );
            return 1;
        }
        console.log(`${sources.length} changed file(s) at 100%: ${sources.join(', ')}`);
        return 0;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    process.exitCode = main(process.argv.slice(2), { root: join(dirname(fileURLToPath(import.meta.url)), '..') });
}
