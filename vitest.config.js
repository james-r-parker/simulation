import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'json-summary'],
            include: ['js/sim/**', 'js/evo/**', 'scripts/**/*.{js,mjs}'],
            // Shells measured end to end rather than by unit tests: alloc-check runs in a child process under
            // --expose-gc; the browser helpers only run inside Vite and Chromium (browser-perf, browser-hash).
            exclude: [
                'scripts/alloc-check.mjs',
                'scripts/browser/**',
                'scripts/lib/browser-session.mjs',
                'scripts/lib/vite-server.mjs',
            ],
            reportsDirectory: 'coverage',
        },
    },
});
