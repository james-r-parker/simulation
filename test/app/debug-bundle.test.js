import { describe, expect, it } from 'vitest';
import { buildDebugBundle } from '../../js/app/debug-bundle.js';

const READY = { seed: 91, policy: 'map-elites-v6', configHash: 'abc', rulesHash: 'def' };

describe('buildDebugBundle', () => {
    it('carries the run identity and the replay command', () => {
        const bundle = buildDebugBundle({ ready: READY, overrides: { maxAgents: 64 }, tick: 1234 });
        expect(bundle).toMatchObject({ seed: 91, tick: 1234, policy: 'map-elites-v6', config: { maxAgents: 64 } });
        expect(bundle.archive).toBeNull();
        expect(bundle.replay).toBe(
            'npm run replay -- --seed 91 --config replay-config.json --policy map-elites-v6 --ticks 1234',
        );
    });

    it('copies the overrides so a later change does not alter the bundle', () => {
        const overrides = { maxAgents: 10 };
        const bundle = buildDebugBundle({ ready: READY, overrides, tick: 1 });
        overrides.maxAgents = 99;
        expect(bundle.config.maxAgents).toBe(10);
    });

    it('is plain JSON', () => {
        const bundle = buildDebugBundle({ ready: READY, overrides: {}, tick: 0, archive: '{"cells":[]}' });
        expect(JSON.parse(JSON.stringify(bundle))).toEqual(bundle);
    });

    it('throws without a ready message', () => {
        expect(() => buildDebugBundle({ ready: /** @type {any} */ (null), overrides: {}, tick: 0 })).toThrow(
            /no ready message/,
        );
    });
});
