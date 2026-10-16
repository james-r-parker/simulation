import { defineConfig } from 'vitest/config';

// Vitest config for Stryker mutation runs: the fast unit tests of js/sim and js/evo only. The golden and allocation
// tests take ~10 s and test the whole step, and the script, bench and replay tests do not exercise mutated code.
export default defineConfig({
    test: {
        include: ['test/sim/**/*.test.js', 'test/evo/**/*.test.js'],
        exclude: ['test/sim/golden.slow.test.js', 'test/sim/step-alloc.slow.test.js'],
        environment: 'node',
    },
});
