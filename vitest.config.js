import { configDefaults, defineConfig } from 'vitest/config';

// TEST_SCOPE=fast leaves out the *.slow.test.js files (real worlds over many ticks, worker pools, the golden runs). They
// sit beside the fast test of the same module; CI runs the fast scope, every local run and the nightly run everything.
const FAST = process.env.TEST_SCOPE === 'fast';

export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
        exclude: FAST ? [...configDefaults.exclude, '**/*.slow.test.js'] : configDefaults.exclude,
        environment: 'node',
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
                'scripts/lib/perf-v6-run.mjs',
                'scripts/lib/vite-server.mjs',
            ],
            reportsDirectory: 'coverage',
        },
    },
});
