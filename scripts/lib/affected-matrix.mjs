// The `test` job matrix of .github/workflows/check.yml, sized to the tests a change reaches (docs/designs/agent-workflow.md,
// Affected tests in CI). The `scope` job writes it; the `test` job reads it with fromJSON. Each entry is one runner:
//   { pass, id, shard }   a numbered shard of the whole suite (Vitest's --shard), for the full mode
//   { pass, id, files }   the listed test files (space separated), for the affected mode
// `pass` is the TEST_SCOPE of scripts/lib/test-scope.mjs: shard, heavy or statistical.
import { HEAVY_TESTS, STATISTICAL_TESTS } from './test-scope.mjs';

/** Reached files that share one shard in the affected mode. */
export const FILES_PER_SHARD = 60;
/** The shards of the whole suite. */
export const MAX_SHARDS = 8;

/**
 * @param {'heavy' | 'statistical'} pass the pass of a file that runs in a job of its own
 * @param {string} file the test file
 * @returns {{pass: string, id: string, files: string}} its matrix entry: `heavy-train-pool` for test/train-pool.slow.test.js
 */
function ownJob(pass, file) {
    const name = file.replace(/^test\//, '').replace(/\.slow\.test\.js$|\.test\.js$/, '');
    return { pass, id: `${pass}-${name.split('/').pop()}`, files: file };
}

/**
 * Every job of the whole suite: the numbered shards, each heavy file and each statistical file.
 * @returns {{pass: string, id: string, shard?: string, files?: string}[]} the matrix entries
 */
export function fullMatrix() {
    const shards = Array.from({ length: MAX_SHARDS }, (_, i) => ({
        pass: 'shard',
        id: `shard-${i + 1}`,
        shard: `${i + 1}/${MAX_SHARDS}`,
    }));
    return [
        ...shards,
        ...HEAVY_TESTS.map((f) => ownJob('heavy', f)),
        ...STATISTICAL_TESTS.map((f) => ownJob('statistical', f)),
    ];
}

/**
 * The jobs for the reached files: one shard per FILES_PER_SHARD files (at most MAX_SHARDS), and a job of its own for each
 * heavy or statistical file reached.
 * @param {string[]} tests the reached test files
 * @returns {{pass: string, id: string, files: string}[]} the matrix entries; empty for no tests
 */
export function affectedMatrix(tests) {
    const heavy = tests.filter((file) => HEAVY_TESTS.includes(file));
    const statistical = tests.filter((file) => STATISTICAL_TESTS.includes(file));
    const rest = tests.filter((file) => !heavy.includes(file) && !statistical.includes(file));
    const count = Math.min(MAX_SHARDS, Math.ceil(rest.length / FILES_PER_SHARD));
    const shards = Array.from({ length: count }, (_, i) => ({
        pass: 'shard',
        id: `shard-${i + 1}`,
        files: rest.filter((_file, at) => at % count === i).join(' '),
    }));
    return [...shards, ...heavy.map((f) => ownJob('heavy', f)), ...statistical.map((f) => ownJob('statistical', f))];
}
