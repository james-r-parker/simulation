// Which test files a TEST_SCOPE runs (vitest.config.js reads this; docs/designs/quality-gates-and-test-tiers.md).
//
//   (unset)       every test file
//   fast          everything except `*.slow.test.js` (CI's push path)
//   coverage      everything except STATISTICAL_TESTS: the pass with coverage (check.sh, locally and in the nightly)
//   statistical   only STATISTICAL_TESTS: the pass without coverage
//   shard         coverage minus HEAVY_TESTS: the sharded CI jobs with coverage, which share the files by path hash
//   heavy         only HEAVY_TESTS: each is a CI job of its own with coverage, so no shard waits on one

/**
 * Long statistical slow tests whose real worlds cast billions of rays: V8's 32-bit block counters wrap on them and read
 * hot branches as uncovered (sim-notes.md, 2026-10-21). They run in a pass without coverage; what they reach is covered
 * by the unit tests.
 */
export const STATISTICAL_TESTS = [
    'test/evo/deliberate-controllers.slow.test.js',
    'test/evo/survivable-world.slow.test.js',
    'test/evo/anti-exploit.slow.test.js',
    'test/sim/practice.slow.test.js',
    // 8 live runs of 20000 ticks (4 seeds through a pool, then in process): under coverage on a 4-core runner they ran
    // past 12 minutes, the long pole of the sharded CI test job; no coverage-only code path hides in them.
    'test/evo/metric-invariants.slow.test.js',
];

/**
 * The slowest tests that keep coverage, each longer than a shard's whole share (4 to 5 minutes under coverage on a
 * 4-core runner against about 1 minute for a shard). CI gives each its own job so the wall time is the longest of them,
 * not of the shard they hash into. A file that stops being slow can leave this list; nothing else depends on it.
 */
export const HEAVY_TESTS = [
    'test/train-pool.slow.test.js',
    'test/evo/scripted-temperature.slow.test.js',
    'test/train.slow.test.js',
    // Shard 6 ran this and gate-validity for 257 s and 117 s (CI run 44808518319); gate-validity is now four files of
    // about 25 s each and left this list (agent-workflow.md T49).
    'test/bench.slow.test.js',
];

/**
 * @param {string | undefined} scope the TEST_SCOPE value
 * @returns {string[] | null} the only files the scope runs, or null for all of them
 */
export function includedFor(scope) {
    if (scope === 'statistical') {
        return STATISTICAL_TESTS;
    }
    return scope === 'heavy' ? HEAVY_TESTS : null;
}

/**
 * @param {string | undefined} scope the TEST_SCOPE value
 * @returns {string[]} the globs and files the scope leaves out, beyond Vitest's defaults
 */
export function excludedFor(scope) {
    if (scope === 'fast') {
        return ['**/*.slow.test.js'];
    }
    if (scope === 'coverage') {
        return [...STATISTICAL_TESTS];
    }
    return scope === 'shard' ? [...STATISTICAL_TESTS, ...HEAVY_TESTS] : [];
}
