import { describe, expect, it } from 'vitest';
import { EVENT_TYPE } from '../../js/sim/events.js';
import { SMOKE_ESCAPE_TICKS } from '../../js/evo/observer-smoke.js';
import { observeCombat } from '../../js/evo/observer-combat.js';
import { addBorn, nextTick, observed, pushCall } from './helpers/observer-world.js';

/**
 * Releases smoke from a new agent at tick 1.
 * @param {Record<string, number>} fields per-slot values of the releaser
 * @returns {{world: any, combat: any, slot: number}}
 */
function release(fields) {
    const { world, observer } = observed();
    const slot = addBorn(world, fields);
    nextTick(world, 1);
    pushCall(world, EVENT_TYPE.SMOKE_RELEASED, slot);
    observeCombat(observer.combat, world);
    return { world, combat: observer.combat, slot };
}

describe('smoke follow-up', () => {
    it('counts a release by a bitten agent as an escape when it is alive 300 ticks later', () => {
        const { world, combat } = release({ bittenTimer: 3 });
        nextTick(world, 1 + SMOKE_ESCAPE_TICKS - 1);
        observeCombat(combat, world);
        expect(combat.smoke.bittenReleases).toBe(0);
        nextTick(world, 1 + SMOKE_ESCAPE_TICKS);
        observeCombat(combat, world);
        expect([combat.smoke.bittenReleases, combat.smoke.escapes]).toEqual([1, 1]);
    });

    it('counts it as no escape when the releaser is dead or replaced', () => {
        const { world, combat, slot } = release({ bittenTimer: 3 });
        world.genomeId[slot] += 50;
        nextTick(world, 1 + SMOKE_ESCAPE_TICKS);
        observeCombat(combat, world);
        expect([combat.smoke.bittenReleases, combat.smoke.escapes]).toEqual([1, 0]);
    });

    it('ignores a release by an agent not bitten in the last 30 ticks', () => {
        const { world, combat } = release({ bittenTimer: 30 });
        nextTick(world, 1 + SMOKE_ESCAPE_TICKS);
        observeCombat(combat, world);
        expect(combat.smoke.bittenReleases).toBe(0);
    });

    it('excludes releases still pending at the end of the run, and grows past its first capacity', () => {
        const { world, observer } = observed({ maxAgents: 40 });
        for (let i = 0; i < 20; i++) {
            addBorn(world, { bittenTimer: 1 });
        }
        nextTick(world, 1);
        for (let slot = 0; slot < 20; slot++) {
            pushCall(world, EVENT_TYPE.SMOKE_RELEASED, slot);
        }
        observeCombat(observer.combat, world);
        expect(observer.combat.smoke.size).toBe(20);
        nextTick(world, 1 + SMOKE_ESCAPE_TICKS);
        observeCombat(observer.combat, world);
        expect([observer.combat.smoke.bittenReleases, observer.combat.smoke.size]).toEqual([20, 0]);
    });
});
