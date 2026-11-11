import { describe, expect, it } from 'vitest';
import { statusOf } from '../../js/evo/compare-rules.js';

describe('statusOf', () => {
    it('reads the registry status of a registered metric', () => {
        expect(statusOf('eval.births_per_1k')).toBe('verified');
        expect(statusOf('eval.floor_episodes')).toBe('unverified');
    });

    it('does not gate a name outside the registry', () => {
        for (const name of ['bench.step_ms@500', 'browser.frame_p95_ms', 'eval.p90_fitness.all', 'nope']) {
            expect(statusOf(name), name).toBe('verified');
        }
    });
});
