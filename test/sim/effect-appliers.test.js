// The appliers (docs/designs/status-effects.md, "Appliers") on the fixture effects.

import { describe, expect, it } from 'vitest';
import { applyEffect, applyEffectOn, drainEffectOn } from '../../js/sim/effect-appliers.js';
import { EVENT, EVENT_STRIDE, EVENT_TYPE } from '../../js/sim/events.js';
import { EFFECT, createEffects } from '../../js/sim/effects.js';
import { CHILL_I, FAT_I, RALLY_I, SYSTEM, chill, fixtureWorld } from './helpers/effect-fixtures.js';

describe('applyEffectOn', () => {
    it('never pass maxStacks: a stack past the cap is dropped and logged', () => {
        const world = fixtureWorld();
        const gained = [];
        for (let k = 0; k < 5; k++) {
            gained.push(applyEffectOn(SYSTEM, world, 0, { effect: RALLY_I, source: 9 }));
        }
        expect(gained).toEqual([true, true, true, false, false]);
        expect(world.effectStacks[0][0]).toBe(3);
        const { data } = world.events;
        expect(world.events.count).toBe(5);
        expect(data[0]).toBe(EVENT_TYPE.EFFECT_APPLIED);
        expect(data[EVENT.EFFECT_APPLIED.STACKS]).toBe(1);
        expect(data[EVENT.EFFECT_APPLIED.SOURCE]).toBe(9);
        const capped = 3 * EVENT_STRIDE;
        expect(data[capped]).toBe(EVENT_TYPE.EFFECT_CAPPED);
        expect(data[capped + EVENT.EFFECT_CAPPED.EFFECT]).toBe(RALLY_I);
    });

    it('cannot be raised on an effect that stores nothing', () => {
        const world = fixtureWorld();
        expect(() => applyEffectOn(SYSTEM, world, 0, { effect: CHILL_I, source: 0 })).toThrow(/stores no stacks/);
        expect(() => applyEffectOn(SYSTEM, world, 0, { effect: FAT_I, source: 0 })).toThrow(/stores no stacks/);
    });
});

describe('drains', () => {
    it('remove perTick times the level, booked under the named cause, and nothing at level 0', () => {
        const world = fixtureWorld();
        drainEffectOn(SYSTEM, world, 0, RALLY_I);
        expect(world.energy[0]).toBe(50);
        world.effectStacks[0][0] = 2;
        drainEffectOn(SYSTEM, world, 0, RALLY_I);
        expect(world.energy[0]).toBe(49.5);
        expect(world.lastLoss[0]).toBeGreaterThan(0);
    });

    it('multiply by a named per-slot array when the effect says so', () => {
        const world = fixtureWorld();
        const system = createEffects([
            chill({ name: 'poison', drains: [{ perTick: 0.5, cause: 'COST', times: 'dose' }] }),
        ]);
        world.fixture.chill[0] = 1;
        world.dose[0] = 0.5;
        drainEffectOn(system, world, 0, 0);
        expect(world.energy[0]).toBe(49.75);
    });
});

describe('applyEffect on the registry', () => {
    it('refuses an effect that is computed from the body, since nothing raises it', () => {
        expect(() => applyEffect(fixtureWorld(), 0, EFFECT.FAT, 0)).toThrow(/stores no stacks/);
    });
});
