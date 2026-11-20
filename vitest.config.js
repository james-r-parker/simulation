import { configDefaults, defineConfig } from 'vitest/config';
import { excludedFor, includedFor } from './scripts/lib/test-scope.mjs';
import { busyScale, testTimeoutFor, timeoutFactorFor } from './scripts/lib/test-timeout.mjs';

// TEST_SCOPE picks the files (scripts/lib/test-scope.mjs): unset runs all, `fast` leaves out the *.slow.test.js files
// (real worlds over many ticks, worker pools, the golden runs), `coverage` and `statistical` are check.sh's two passes,
// `shard` and `heavy` are CI's sharded jobs.
const SCOPE = process.env.TEST_SCOPE;

// A busy machine (load above nproc / 8) stretches every limit; a quiet one keeps them exactly.
const BUSY = busyScale();

export default defineConfig({
    test: {
        include: includedFor(SCOPE) ?? ['test/**/*.test.js'],
        exclude: [...configDefaults.exclude, ...excludedFor(SCOPE)],
        environment: 'node',
        // Coverage slows the sim tests several times: a longer default, and tests scale explicit timeouts with
        // scaleTimeout (scripts/lib/test-timeout.mjs) from TEST_TIMEOUT_FACTOR.
        testTimeout: testTimeoutFor(process.argv) * BUSY,
        env: { TEST_TIMEOUT_FACTOR: String(timeoutFactorFor(process.argv) * BUSY) },
        benchmark: { include: ['bench/micro/**/*.bench.js'] },
        coverage: {
            provider: 'v8',
            // `json` writes coverage-final.json, which the ratchet reads to name a missed file's uncovered lines.
            reporter: ['text-summary', 'json-summary', 'json'],
            include: [
                'js/sim/**',
                'js/evo/**',
                'js/worker/**',
                'js/app/**',
                'js/library/**',
                'functions/**',
                'scripts/**/*.{js,mjs}',
            ],
            // Shells measured end to end rather than by unit tests: alloc-check runs in a child process under
            // --expose-gc; the browser helpers only run inside Vite and Chromium (browser-perf, browser-hash).
            exclude: [
                // Browser shells: they need a real worker or window and are covered by test/browser/app.spec.js.
                'js/worker/sim-worker.js',
                'js/app/pack/pack-worker.js',
                'js/app/pack/pack-boot.js',
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
