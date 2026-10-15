import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.js'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text-summary', 'json-summary'],
            include: ['js/sim/**', 'js/evo/**', 'scripts/**/*.{js,mjs}'],
            exclude: ['scripts/alloc-check.mjs'], // runs in a child process under --expose-gc
            reportsDirectory: 'coverage',
        },
    },
});
