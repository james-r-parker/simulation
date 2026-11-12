import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/observer-events.js';
import { checkpoint, createObserver, observe, observerPhases } from '../../js/evo/observer.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { createRng } from '../../js/sim/rng.js';
import { lifeWorld } from '../sim/helpers/life-world.js';
import { nextTick, pushBorn, pushDied } from './helpers/observer-world.js';

const EVAL_POOLS = ['lineage', 'diet', 'merit', 'body', 'environment', 'watch', 'watchability', 'windows'];

/** @returns {{world: any, observer: any}} a small world and a lean observer */
function lean() {
    const world = lifeWorld();
    return { world, observer: createObserver(world.config, createRng(1), { lean: true }) };
}

describe('a lean observer', () => {
    it('refuses computeMetrics and checkpoint', () => {
        const { world, observer } = lean();
        expect(observer.lean).toBe(true);
        expect(() => computeMetrics(observer, world)).toThrow('computeMetrics: the observer is lean');
        expect(() => checkpoint(observer, world)).toThrow('checkpoint: the observer is lean');
    });

    it('builds no scene but style and terrain, and overrides no step phase', () => {
        const { observer } = lean();
        expect(Object.keys(observer.scenes).sort()).toEqual(['lean', 'style', 'terrain']);
        expect(Object.keys(observerPhases(observer))).toEqual([]);
    });

    it('counts a birth and a death in the policy core and touches no eval pool', () => {
        const { world, observer } = lean();
        const fresh = lean().observer;
        pushBorn(world, { slot: 1, genomeId: 5, cause: BORN_CAUSE.FLOOR, tick: 0 });
        observe(observer, world);
        nextTick(world, BURN_IN_TICKS + 1);
        pushBorn(world, { slot: 2, genomeId: 6, parentA: 5, parentB: 5, cause: BORN_CAUSE.MATE });
        pushDied(world, { slot: 1, genomeId: 5, cause: DEATH_CAUSE.STARVED, ageTicks: 900, foodEnergy: 40 });
        observe(observer, world);
        expect(observer.births[BORN_CAUSE.MATE]).toBe(1);
        expect(observer.deathsByCause[DEATH_CAUSE.STARVED]).toBe(1);
        expect(observer.deathCount).toBe(1);
        expect(observer.deaths.ageTicks[0]).toBe(900);
        expect(observer.slotOf.get(6)).toBe(2);
        for (const name of EVAL_POOLS) {
            expect(observer[name], name).toEqual(fresh[name]);
        }
    });
});
