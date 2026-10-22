import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { createRng, fork, nextFloat, nextInt } from '../../js/sim/rng.js';
import { createWorld, spawnAgent } from '../../js/sim/spawn.js';
import { testPolicy } from './helpers/test-policy.js';
import { FEATURES_OFF } from '../../scripts/lib/features-on.mjs';

const SEED = 31;
const TWO_PI = 6.283185307179586;

/**
 * @param {Record<string, any>} [over] config overrides
 * @returns {ReturnType<typeof createWorld>} an empty 1000x1000 world
 */
function empty(over = {}) {
    return createWorld(
        createConfig({
            ...FEATURES_OFF,
            seed: SEED,
            worldWidth: 1000,
            worldHeight: 1000,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            rayCount: 4,
            brainHidden: 3,
            maxFood: 4,
            initialFood: 0,
            obstacleCount: 0,
            fertileZoneMax: 2,
            ...over,
        }),
        testPolicy,
    );
}

describe('spawnAgent draws', () => {
    it('draws spec, position and heading from the spawn stream in that order', () => {
        const w = empty({ baseSize: 25, minSize: 20, initialEnergy: 800, energyToSize: 250 });
        const slot = spawnAgent(w, testPolicy, BORN_CAUSE.INITIAL);
        const rng = fork(createRng(SEED), 'spawn');
        const spec = nextInt(rng, 5);
        const r = 25 + 800 / 250;
        const x = r + nextFloat(rng) * (1000 - 2 * r);
        const y = r + nextFloat(rng) * (1000 - 2 * r);
        const angle = nextFloat(rng) * TWO_PI - Math.PI;
        expect(w.spec[slot]).toBe(spec);
        expect(w.x[slot]).toBeCloseTo(x, 3);
        expect(w.y[slot]).toBeCloseTo(y, 3);
        expect(w.angle[slot]).toBeCloseTo(angle, 5);
    });

    it('hands initSpec the spawn stream and initBrain the brain-init stream, spec first', () => {
        const w = empty();
        /** @type {any[]} */
        const log = [];
        const policy = {
            initSpec: (/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) => {
                log.push(['spec', world, slot, rng]);
                return 2;
            },
            initBrain: (/** @type {any} */ world, /** @type {number} */ slot, /** @type {any} */ rng) => {
                log.push(['brain', world, slot, rng]);
            },
        };
        const slot = spawnAgent(w, policy, BORN_CAUSE.INITIAL);
        expect(log).toHaveLength(2);
        expect(log[0][0]).toBe('spec');
        expect(log[0][1]).toBe(w);
        expect(log[0][2]).toBe(slot);
        expect(log[0][3]).toBe(w.rng.spawn);
        expect(log[1][0]).toBe('brain');
        expect(log[1][1]).toBe(w);
        expect(log[1][2]).toBe(slot);
        expect(log[1][3]).toBe(w.rng['brain-init']);
        expect(w.spec[slot]).toBe(2);
    });

    it('names the offending cause in the error', () => {
        const w = empty();
        expect(() => spawnAgent(w, testPolicy, BORN_CAUSE.MATE)).toThrow(
            `spawnAgent: cause must be initial, floor or immigrant, got ${BORN_CAUSE.MATE}`,
        );
    });
});
