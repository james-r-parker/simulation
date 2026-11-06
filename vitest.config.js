import { configDefaults, defineConfig } from 'vitest/config';
import { testTimeoutFor, timeoutFactorFor } from './scripts/lib/test-timeout.mjs';

// TEST_SCOPE=fast leaves out the *.slow.test.js files (real worlds over many ticks, worker pools, the golden runs). They
// sit beside the fast test of the same module; CI runs the fast scope, every local run and the nightly run everything.
const SCOPE = process.env.TEST_SCOPE;
const FAST = SCOPE === 'fast';

// Long statistical slow tests whose real worlds cast billions of rays: V8's 32-bit block counters wrap on them and
// read hot branches as uncovered (sim-notes.md, 2026-10-21). check.sh runs them in a second pass without coverage
// (TEST_SCOPE=statistical) and the coverage pass leaves them out (TEST_SCOPE=coverage); what they reach is covered by
// the unit tests.
export const STATISTICAL_TESTS = [
    'test/evo/deliberate-controllers.slow.test.js',
    'test/evo/survivable-world.slow.test.js',
    'test/evo/anti-exploit.slow.test.js',
];

/** @returns {string[]} the test files left out for this scope */
function excluded() {
    if (FAST) {
        return [...configDefaults.exclude, '**/*.slow.test.js'];
    }
    return SCOPE === 'coverage' ? [...configDefaults.exclude, ...STATISTICAL_TESTS] : configDefaults.exclude;
}

export default defineConfig({
    test: {
        include: SCOPE === 'statistical' ? STATISTICAL_TESTS : ['test/**/*.test.js'],
        exclude: excluded(),
        environment: 'node',
        // Coverage slows the sim tests several times: a longer default, and tests scale explicit timeouts with
        // scaleTimeout (scripts/lib/test-timeout.mjs) from TEST_TIMEOUT_FACTOR.
        testTimeout: testTimeoutFor(process.argv),
        env: { TEST_TIMEOUT_FACTOR: String(timeoutFactorFor(process.argv)) },
        benchmark: { include: ['bench/micro/**/*.bench.js'] },
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'json-summary'],
            include: ['js/sim/**', 'js/evo/**', 'js/worker/**', 'js/app/**', 'scripts/**/*.{js,mjs}'],
            // Shells measured end to end rather than by unit tests: alloc-check runs in a child process under
            // --expose-gc; the browser helpers only run inside Vite and Chromium (browser-perf, browser-hash).
            exclude: [
                // Browser shells: they need a real worker or window and are covered by test/browser/app.spec.js.
                'js/worker/sim-worker.js',
                'js/app/main.js',
                'js/app/renderer/scene.js',
                'js/app/renderer/bloom.js',
                'scripts/alloc-check.mjs',
                'scripts/browser/**',
                'scripts/lib/browser-session.mjs',
                'scripts/lib/perf-run.mjs',
                'scripts/lib/perf-v6-run.mjs',
                'scripts/lib/vite-server.mjs',
            ],
            reportsDirectory: 'coverage',
        },
    },
});
