// Gate 2 of fair-chase.md, "Before any training": each role metric against a planted scene (docs/designs/metric-noise.md,
// Phase 6, T21). A scene is a staged arena where the role's job happens and one where it does not; the metric must read
// the difference, equal to what the scene fixes. Only the predator's scene is built (role-budget.md Phase 1 stages the
// chase); the other roles wait on the scenes of role-budget.md Phases 2 to 5, listed in the last test.

import { describe, expect, it } from 'vitest';
import { ROLE_METRICS } from '../../js/evo/metric-registry/roles.js';
import { playChase, HUNTER } from './helpers/role-scene.js';

const TICKS = 300;
/** A gap the oracle hunter closes and bites inside the scene, and one it never closes. */
const NEAR = 300;
const FAR = 9000;
/** An age past `juvenileTicks` (3000 in the defaults). */
const ADULT = 3100;

/**
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
const starveHunter = (world) => {
    world.energy[HUNTER] = 0.0001;
};

describe('the predator metrics against a planted chase', () => {
    const caught = playChase({ gap: NEAR, ticks: TICKS });
    const missed = playChase({ gap: FAR, ticks: TICKS });

    it('plants a kill in one scene and none in the other', () => {
        expect(caught.killTick).toBeGreaterThan(0);
        expect(caught.killTick).toBeLessThan(TICKS);
        expect(missed.killTick).toBeNull();
    });

    it('chase_catch_share reads 1 when the chase ends in the catch, and no chase when there was none', () => {
        expect(caught.metrics['eval.chase_catch_share'].value).toBe(1);
        expect(missed.metrics['eval.chase_catch_share'].value).toBeNull();
    });

    it('pursuit_kill_share reads 1 for a deliberate kill, and no kill when there was none', () => {
        expect(caught.metrics['eval.pursuit_kill_share'].value).toBe(1);
        expect(missed.metrics['eval.pursuit_kill_share'].value).toBeNull();
    });

    it('hunter_catches_per_1k_settled is one kill per the hunter-ticks played, and 0 for none', () => {
        expect(caught.metrics['eval.hunter_catches_per_1k_settled'].value).toBeCloseTo(1000 / caught.hunterTicks, 9);
        expect(missed.metrics['eval.hunter_catches_per_1k_settled'].value).toBe(0);
    });

    it('bite_idle reads the ticks the hunter asked to bite with nothing in its jaws, and 0 when it never asks', () => {
        const asks = playChase({ gap: FAR, ticks: TICKS, bite: true });
        const never = playChase({ gap: FAR, ticks: TICKS, bite: false });
        expect(asks.metrics['eval.bite_idle'].value).toBeCloseTo(TICKS / (TICKS + 1), 9);
        expect(never.metrics['eval.bite_idle'].value).toBe(0);
    });

    it('hunter_kills_per_life_mean reads the kills of the hunter that died: 1 after the catch, 0 without', () => {
        const dies = (/** @type {number} */ gap) =>
            playChase({
                gap,
                ticks: TICKS,
                ageTicks: ADULT,
                before: (world, tick) => (tick === TICKS - 10 ? starveHunter(world) : undefined),
            });
        expect(dies(NEAR).metrics['eval.hunter_kills_per_life_mean'].value).toBe(1);
        expect(dies(FAR).metrics['eval.hunter_kills_per_life_mean'].value).toBe(0);
    });

    it('hunter_juvenile_death_share reads 1 for a death before juvenileTicks and 0 after', () => {
        const dies = (/** @type {number} */ age) =>
            playChase({
                gap: FAR,
                ticks: TICKS,
                ageTicks: age,
                before: (world, tick) => (tick === TICKS - 10 ? starveHunter(world) : undefined),
            });
        expect(dies(0).metrics['eval.hunter_juvenile_death_share'].value).toBe(1);
        expect(dies(ADULT).metrics['eval.hunter_juvenile_death_share'].value).toBe(0);
    });

    it('reads every predator metric of the role table', () => {
        for (const name of ROLE_METRICS.predator) {
            expect(Object.hasOwn(caught.metrics, name)).toBe(true);
        }
    });
});

describe('the roles that wait on the scenes of role-budget.md Phases 2 to 5', () => {
    it('are the roles with a tagged metric and no planted scene yet', () => {
        const waiting = Object.entries(ROLE_METRICS)
            .filter(([role]) => role !== 'predator')
            .map(([role]) => role);
        expect(waiting).toEqual(['forager', 'reproducer', 'scout', 'defender', 'herd']);
    });
});
