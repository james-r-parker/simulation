import { describe, expect, it } from 'vitest';
import { stageArena } from '../../js/evo/chase-arena.js';
import { preStep5Arena } from '../helpers/pre-step5.js';
import { evaderBrain, pursuerBrain } from '../../js/evo/chase-oracles.js';
import { step } from '../../js/sim/step.js';
import { DISTANCE_SHARES, FAIR_BAND, MAX_TICKS, fairBand, runEnvelope } from '../../js/evo/chase-envelope.js';
import { scaleTimeout } from '../../scripts/lib/test-timeout.mjs';

describe('fairBand', () => {
    it('lists the start distances whose catch share is inside the band, ends included', () => {
        expect(fairBand([1, 0.8, 0.5, 0.2, 0])).toEqual([DISTANCE_SHARES[1], DISTANCE_SHARES[2], DISTANCE_SHARES[3]]);
        expect(fairBand([1, 1, 1, 1, 1])).toEqual([]);
        expect(fairBand([0, 0, 0, 0, 0])).toEqual([]);
        expect([FAIR_BAND.low, FAIR_BAND.high]).toEqual([0.2, 0.8]);
    });
});

describe('runEnvelope', () => {
    it(
        'plays the named pairs only, one grid cell per distance and bearing',
        () => {
            const [only, ...rest] = runEnvelope(preStep5Arena(), { pairs: [['predator', 'forager']], trials: 1 });
            expect(rest).toEqual([]);
            expect([only.pursuer, only.evader, only.grid.length, only.grid[0].length]).toEqual([
                'predator',
                'forager',
                5,
                8,
            ]);
            expect(only.byDistance).toHaveLength(5);
        },
        scaleTimeout(30_000),
    );

    it(
        'plays every hunting specialisation against every body when no pairs are named',
        () => {
            const config = preStep5Arena();
            const specs = Object.entries(config.specialisations);
            const hunters = specs.filter(([, spec]) => /** @type {any} */ (spec).canHunt);
            expect(hunters.length).toBeGreaterThan(0);
            expect(hunters.length).toBeLessThan(specs.length);
            const results = runEnvelope(config, { trials: 1 });
            expect(results).toHaveLength(hunters.length * specs.length);
            expect(new Set(results.map((r) => r.pursuer))).toEqual(new Set(hunters.map(([name]) => name)));
        },
        scaleTimeout(120_000),
    );

    it('rejects a named pair with an unknown specialisation, listing the known ones', () => {
        expect(() => runEnvelope(preStep5Arena(), { pairs: [['dragon', 'forager']], trials: 1 })).toThrow(
            /unknown specialisation "dragon"; known: .*forager/,
        );
    });
});

describe('the envelope with the sprint store on', () => {
    /**
     * A predator chases a straight-running forager from 300 apart, both scripted, for up to `MAX_TICKS`.
     * @param {number} evaderStore the forager's store at the start (the predator's is full)
     * @returns {boolean} whether the predator caught it
     */
    function caught(evaderStore) {
        const { world, policy } = stageArena(preStep5Arena({ sprintStoreEnabled: true }), [
            { spec: 1, x: 4000, y: 4000, angle: 0 },
            { spec: 0, x: 4300, y: 4000, angle: 0 },
        ]);
        world.sprintStore.level[1] = evaderStore;
        const hunt = pursuerBrain({ pursuer: 0, evader: 1, sprint: true });
        const flee = evaderBrain({ pursuer: 0, evader: 1, sprint: true, jinkRange: 0 });
        const brain = (/** @type {Record<string, any>} */ w) => {
            hunt(w);
            flee(w);
        };
        for (let t = 0; t < MAX_TICKS && world.alive[1] === 1; t++) {
            step(world, policy, { brain });
        }
        return world.alive[1] === 0;
    }

    it('catches a spent evader from a distance where a fresh one escapes', () => {
        expect(caught(1)).toBe(false);
        expect(caught(0)).toBe(true);
    });
});
