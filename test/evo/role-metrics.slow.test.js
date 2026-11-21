// reads: test/evo/role-metrics-defender.slow.test.js, test/evo/role-metrics-scout.slow.test.js, test/evo/role-metrics-forager.slow.test.js, test/evo/role-metrics-reproducer.slow.test.js, test/evo/role-metrics-herd.slow.test.js
// Gate 2 of fair-chase.md, "Before any training": each role metric against a planted scene (docs/designs/metric-noise.md,
// Phase 6, T21). A scene is a staged arena where the role's job happens and one where it does not; the metric must read
// the difference, equal to what the scene fixes. This file holds the predator's chase (role-budget.md Phase 1); the defender
// is in role-metrics-defender.slow.test.js, the scout in role-metrics-scout.slow.test.js (Phases 2 and 3), the forager in
// role-metrics-forager.slow.test.js, the reproducer in role-metrics-reproducer.slow.test.js (Phase 4) and the herd in
// role-metrics-herd.slow.test.js (Phase 5). The last test checks every tagged metric is read by one of them.

import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROLE_METRICS } from '../../js/evo/metric-registry/roles.js';
import { unassertedMetrics } from './helpers/role-asserted.js';
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

describe('every role of the registry', () => {
    it('has each of its tagged metrics asserted by value against a planted scene in a role-metrics test', () => {
        const dir = new URL('.', import.meta.url);
        const sources = readdirSync(dir)
            .filter((file) => /^role-metrics.*\.slow\.test\.js$/.test(file))
            .map((file) => readFileSync(new URL(file, dir), 'utf8'));
        expect(unassertedMetrics(sources, Object.values(ROLE_METRICS).flat())).toEqual([]);
    });

    it('does not count a metric that is only quoted or checked for presence', () => {
        const quoted = `const A = 'eval.bite_idle'; expect(Object.hasOwn(m, A)).toBe(true); const l = ['eval.bite_idle'];`;
        const read = `const A = 'eval.bite_idle'; expect(run.metrics[A].value).toBeCloseTo(1, 9);`;
        const literal = `expect(run.metrics['eval.alarm_lift'].value).toBeNull();`;
        expect(unassertedMetrics([quoted], ['eval.bite_idle'])).toEqual(['eval.bite_idle']);
        expect(unassertedMetrics([quoted, read, literal], ['eval.bite_idle', 'eval.alarm_lift'])).toEqual([]);
    });
});
