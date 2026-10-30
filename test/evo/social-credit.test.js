// Social credit pays the actors only (natural-selection.md T9; principles rules 7 and 8): a convergent pack kill pays the
// two agents that bit, once each, by the skill group's `convergedKills`, and nothing is paid to the kin who stood around.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { DEATH_CAUSE } from '../../js/sim/events.js';
import { createFitnessV6 } from '../../js/evo/fitness-v6.js';
import { createLifeCounters } from '../../js/evo/life-counters.js';
import { observeCombat } from '../../js/evo/observer-combat.js';
import { noteIntentEvents } from '../../js/evo/observer-intent-events.js';
import { updateIntent } from '../../js/evo/observer-intent.js';
import { FORAGER, PREDATOR, intentArena } from './helpers/intent-world.js';
import { addBorn, nextTick, pushDied } from './helpers/observer-world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';

const CREDITS = ['convergedKills', 'deliberateKills', 'alarmCredits', 'huntCredits'];

/**
 * Observes one tick the way `observe` does before it reassigns slots.
 * @param {{world: any, observer: any}} arena the arena
 * @param {number} at the tick
 * @param {() => void} before sets up the tick after the clock moves and the event ring clears
 * @returns {void}
 */
function tick(arena, at, before) {
    const { world, observer } = arena;
    nextTick(world, at);
    before();
    observeCombat(observer.combat, world, observer.intent);
    updateIntent(observer.intent, world, observer.slotOf);
    noteIntentEvents(observer, world);
}

/**
 * A kill of a forager at tick 2 by hunters `a` (killer) and `b` (previous biter) of lineage 4, with one more hunter per
 * `bystanders` entry standing at `[lineageId, dx]` from the victim, at (500, 500).
 * @param {Array<[number, number]>} bystanders lineage and x offset of the others
 * @param {{convergent?: boolean, killerGone?: boolean}} [f] whether both of the last two bites were deliberate (default
 *   true), and whether the killer died the same tick
 * @returns {{arena: any, slots: number[], a: number, b: number}} the arena, the bystanders' slots, a and b
 */
function packKill(bystanders, { convergent = true, killerGone = false } = {}) {
    const arena = intentArena();
    const { world, intent, observer } = arena;
    const a = addBorn(world, { spec: PREDATOR, lineageId: 4 });
    const b = addBorn(world, { spec: PREDATOR, lineageId: 4 });
    const slots = bystanders.map(([lineageId, dx]) => addBorn(world, { spec: PREDATOR, lineageId, x: 500 + dx }));
    const victim = addBorn(world, { spec: FORAGER });
    for (let slot = 0; slot < world.alive.length; slot++) {
        if (world.alive[slot] === 1) {
            observer.slotOf.set(world.genomeId[slot], slot);
            observer.genomeId[slot] = world.genomeId[slot];
        }
    }
    observeCombat(observer.combat, world, intent);
    intent.lastBiteDeliberate[victim] = 1;
    intent.prevBiteDeliberate[victim] = convergent ? 1 : 0;
    tick(arena, 2, () => {
        world.alive[a] = killerGone ? 0 : 1;
        pushDied(world, {
            slot: victim,
            genomeId: world.genomeId[victim],
            cause: DEATH_CAUSE.EATEN,
            by: world.genomeId[a],
            prevBiter: world.genomeId[b],
        });
    });
    return { arena, slots, a, b };
}

/**
 * @param {any} intent the intent state
 * @param {number} slot a slot
 * @returns {number[]} the slot's social and kill credits
 */
const creditsOf = (intent, slot) => CREDITS.map((name) => intent[name][slot]);

describe('a convergent pack kill', () => {
    it('pays the killer and the previous biter once each, and the kin standing around nothing', () => {
        const { arena, slots, a, b } = packKill([
            [4, 10],
            [4, 100],
            [4, -299],
        ]);
        const { intent } = arena.observer;
        expect(creditsOf(intent, a)[0]).toBe(1);
        expect(creditsOf(intent, b)[0]).toBe(1);
        for (const slot of slots) {
            expect(creditsOf(intent, slot)).toEqual([0, 0, 0, 0]);
        }
    });

    it('leaves no bystander counter on the observer', () => {
        const { arena } = packKill([[4, 10]]);
        expect('packKills' in arena.observer).toBe(false);
    });

    it('pays nobody when the last two bites were not both deliberate', () => {
        const { arena, slots, a, b } = packKill([[4, 10]], { convergent: false });
        const { intent } = arena.observer;
        expect([a, b, ...slots].map((slot) => creditsOf(intent, slot)[0])).toEqual([0, 0, 0]);
    });

    it('pays the previous biter alone when the killer is gone, and still no kin', () => {
        const { arena, slots, a, b } = packKill([[4, 10]], { killerGone: true });
        const { intent } = arena.observer;
        expect([creditsOf(intent, a)[0], creditsOf(intent, b)[0], creditsOf(intent, slots[0])[0]]).toEqual([0, 1, 0]);
    });
});

describe('the fitness of the actors and the bystanders', () => {
    /**
     * A stand-in observer with slot 0 holding the given intent counters.
     * @param {Record<string, number>} fields intent counters of slot 0
     * @returns {any} the observer
     */
    function observerWith(fields) {
        const intent = Object.fromEntries(
            [
                ...CREDITS,
                'deliberateFood',
                'deliberateBite',
                'chanceFood',
                'chanceBite',
                'respondedEscape',
                'idleSignal',
                'undefendedBite',
            ].map((k) => [k, Float64Array.of(fields[k] ?? 0)]),
        );
        return {
            intent,
            spec: Uint8Array.of(99),
            ageTicks: Float64Array.of(100),
            children: Uint32Array.of(0),
            maturedChildren: Uint32Array.of(0),
            descendantsAlive: Uint32Array.of(0),
            niche: Uint8Array.of(0),
        };
    }
    const config = createConfig({ ...SIMPLE_WORLD, maxAgents: 8, initialAgents: 0, minAgents: 0 });
    const fitness = createFitnessV6(createLifeCounters(config));

    it('pays a biter its converged-kill credit and a bystander with the same life nothing for the kill', () => {
        const life = { deliberateFood: 500 };
        const bystander = fitness(observerWith(life), 0, config);
        const biter = fitness(observerWith({ ...life, convergedKills: 2 }), 0, config);
        expect(biter - bystander).toBe(100);
    });

    it('has no pack weight and no watch group to pay it in', () => {
        expect(() => createFitnessV6({}, { PACK: 30 })).toThrow(/PACK/);
        expect(existsSync(new URL('../../js/evo/fitness-v6-watch.js', import.meta.url))).toBe(false);
    });
});
