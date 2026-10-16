import { describe, expect, it } from 'vitest';
import { runBenchTask } from '../scripts/bench-parallel-worker.mjs';

describe('runBenchTask', () => {
    it('steps a small world and reports the ticks and the loop time', () => {
        const result = runBenchTask({ seed: 1, ticks: 10, agents: 20 });
        expect(result.ticks).toBe(10);
        expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    });
});
