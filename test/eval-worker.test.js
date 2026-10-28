import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_STRIDE, EVENT_TYPE } from '../js/sim/events.js';
import { FEATURES_OFF } from '../scripts/lib/features-on.mjs';

/** @type {number[]} */
const seenTicks = [];
/** @type {Record<string, any>[]} */
const created = [];

vi.mock('../js/evo/policies/index.js', async (importOriginal) => {
    /** @type {Record<string, any>} */
    const original = await importOriginal();
    return {
        ...original,
        getPolicy: () => ({
            create: (/** @type {Record<string, any>} */ options) => (
                created.push(options),
                {
                    ...original.getPolicy('baseline-v5').create(options),
                    onEvent(/** @type {Record<string, any>} */ world, /** @type {number} */ offset) {
                        if (world.events.data[offset] === EVENT_TYPE.AGENT_BORN) {
                            seenTicks.push(world.events.data[offset + 1]);
                        }
                        expect(offset % EVENT_STRIDE).toBe(0);
                    },
                }
            ),
        }),
    };
});

describe('runSeed', () => {
    beforeEach(() => {
        seenTicks.length = 0;
    });

    it('passes the initial births from createWorld to onEvent before the first step', async () => {
        const { runSeed } = await import('../scripts/eval-worker.mjs');
        const overrides = {
            ...FEATURES_OFF,
            maxAgents: 40,
            initialAgents: 12,
            minAgents: 4,
            worldWidth: 1500,
            worldHeight: 1000,
        };
        await runSeed({ seed: 3, ticks: 5, policy: 'baseline-v5', overrides });
        expect(seenTicks.filter((tick) => tick === 0)).toHaveLength(12);
    });

    it('hands the policyOptions of the task to the policy beside config, log and observer', async () => {
        const { runSeed } = await import('../scripts/eval-worker.mjs');
        const overrides = { ...FEATURES_OFF, maxAgents: 40, initialAgents: 12, minAgents: 4, worldWidth: 1500 };
        created.length = 0;
        await runSeed({ seed: 3, ticks: 2, policy: 'baseline-v5', overrides, policyOptions: { archiveShare: 0.2 } });
        expect(created[0]).toMatchObject({ archiveShare: 0.2 });
        expect(created[0]).toHaveProperty('observer');
    });
});
