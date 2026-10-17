import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX } from '../../js/sim/brain-layout.js';
import {
    CLOSING_MIN,
    INTENT_WINDOW,
    arcRays,
    createIntentState,
    resetIntentSlot,
    updateIntent,
} from '../../js/evo/observer-intent.js';
import { observe } from '../../js/evo/observer.js';
import { CH, FORAGER, PREDATOR, approach, clearRays, intentArena, setRay, tickIntent } from './helpers/intent-world.js';
import { addBorn, nextTick, pushBorn, pushDied } from './helpers/observer-world.js';

/**
 * Closes on food along ray 0 for `count` ticks and eats on the last one.
 * @param {number} count rising ticks
 * @returns {{world: any, intent: any, slot: number}}
 */
function mealAfter(count) {
    const arena = intentArena();
    const slot = addBorn(arena.world, { spec: FORAGER });
    approach(arena, {
        slot,
        k: 0,
        channel: CH.FOOD,
        count,
        before: (tick) => {
            arena.world.foodEnergy[slot] = tick === count ? 10 : 0;
        },
    });
    return { world: arena.world, intent: arena.intent, slot };
}

describe('arcRays', () => {
    it('marks rays 0, 1, 2, 14 and 15 of 16 at the default biteArc, and every ray at PI', () => {
        const { world } = intentArena();
        const marked = [...arcRays(world.config)].flatMap((v, k) => (v === 1 ? [k] : []));
        expect(marked).toEqual([0, 1, 2, 14, 15]);
        expect([...arcRays({ rayCount: 16, biteArc: Math.PI })].every((v) => v === 1)).toBe(true);
    });
});

describe('meals', () => {
    it('are deliberate after 6 closing ticks and chance after 5', () => {
        const six = mealAfter(CLOSING_MIN);
        expect([six.intent.deliberateFood[six.slot], six.intent.chanceFood[six.slot]]).toEqual([10, 0]);
        expect(six.intent.run.foodDeliberate).toBe(10);
        const five = mealAfter(CLOSING_MIN - 1);
        expect([five.intent.deliberateFood[five.slot], five.intent.chanceFood[five.slot]]).toEqual([0, 10]);
        expect(five.intent.run.foodChance).toBe(10);
    });

    it('are credited once: a tick without a rise adds nothing', () => {
        const { world, intent, slot } = mealAfter(CLOSING_MIN);
        tickIntent(world, intent, world.tick + 1);
        expect(intent.deliberateFood[slot]).toBe(10);
    });

    it('are chance with no food on any ray, and with a sighting 31 ticks old', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const slot = addBorn(world, { spec: FORAGER });
        tickIntent(world, intent, 40);
        intent.foodBits[slot] = 0x3f;
        intent.lastFood[slot] = 40 - INTENT_WINDOW - 1;
        world.foodEnergy[slot] = 4;
        tickIntent(world, intent, 41);
        expect(intent.chanceFood[slot]).toBe(4);
        intent.foodBits[slot] = 0x3f;
        intent.lastFood[slot] = 42 - INTENT_WINDOW;
        world.foodEnergy[slot] = 9;
        tickIntent(world, intent, 42);
        expect(intent.deliberateFood[slot]).toBe(5);
    });

    it('are chance while turning away from the food', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const slot = addBorn(world, { spec: FORAGER });
        const away = -world.config.maxTurn;
        approach(arena, {
            slot,
            k: 3,
            channel: CH.FOOD,
            count: 8,
            before: (tick) => {
                world.turnRate[slot] = away;
                world.foodEnergy[slot] = tick === 8 ? 10 : 0;
            },
        });
        expect(intent.chanceFood[slot]).toBe(10);
        expect(intent.deliberateFood[slot]).toBe(0);
    });
});

describe('bites', () => {
    it('are deliberate only when the prey is on an arc ray', () => {
        const deliberate = [];
        for (let k = 0; k < 16; k++) {
            const arena = intentArena();
            const slot = addBorn(arena.world, { spec: PREDATOR });
            approach(arena, {
                slot,
                k,
                channel: CH.SMALLER,
                count: 6,
                before: (tick) => {
                    arena.world.biteEnergy[slot] = tick === 6 ? 7 : 0;
                },
            });
            if (arena.intent.deliberateBite[slot] === 7) {
                deliberate.push(k);
            }
        }
        expect(deliberate).toEqual([0, 1, 2, 14, 15]);
    });

    it('count toward the run only for agents that can hunt', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const hunter = addBorn(world, { spec: PREDATOR });
        const forager = addBorn(world, { spec: FORAGER });
        approach(arena, {
            slot: hunter,
            k: 0,
            channel: CH.SMALLER,
            count: 6,
            before: (tick) => {
                world.biteEnergy[hunter] = tick === 6 ? 7 : 0;
                world.biteEnergy[forager] = tick === 6 ? 3 : 0;
            },
        });
        expect([intent.run.huntBiteDeliberate, intent.run.huntBiteChance]).toEqual([7, 0]);
        expect(intent.chanceBite[forager]).toBe(3);
    });

    it('record on the victim, shifting only when the biter changes, and an unfound biter is chance', () => {
        const arena = intentArena();
        const { world, intent } = arena;
        const a = addBorn(world, { spec: PREDATOR });
        const b = addBorn(world, { spec: PREDATOR });
        const victim = addBorn(world, { spec: FORAGER });
        const idA = world.genomeId[a];
        const idB = world.genomeId[b];
        const bite = (/** @type {number} */ biterId, /** @type {number} */ tick) => {
            intent.lastPrey[a] = intent.lastPrey[b] = tick - 1;
            world.lastBiter[victim] = biterId;
            world.bittenTimer[victim] = 1;
            tickIntent(world, intent, tick);
            world.bittenTimer[victim] = 30;
        };
        intent.preyBits[a] = 0x3f;
        bite(idA, 1);
        expect([intent.lastBiteDeliberate[victim], intent.prevBiteDeliberate[victim]]).toEqual([1, 0]);
        intent.preyBits[a] = 0;
        bite(idA, 2);
        expect([intent.lastBiteDeliberate[victim], intent.prevBiteDeliberate[victim]]).toEqual([0, 0]);
        intent.preyBits[b] = 0x3f;
        bite(idB, 3);
        expect([intent.lastBiteDeliberate[victim], intent.prevBiteDeliberate[victim]]).toEqual([1, 0]);
        bite(idA, 4);
        expect([intent.lastBiteDeliberate[victim], intent.prevBiteDeliberate[victim]]).toEqual([0, 1]);
        bite(9999, 5);
        expect(intent.lastBiteDeliberate[victim]).toBe(0);
    });
});

describe('responses', () => {
    /**
     * A forager with a threat on ray 2 (the positive side) and the given outputs and turn; returns its last response.
     * @param {{turn?: number, output?: number, threatRay?: number}} f what the agent does
     * @returns {number} `lastResponse` after tick 1
     */
    function respond(f) {
        const { world, intent } = intentArena();
        const slot = addBorn(world, { spec: FORAGER });
        nextTick(world, 1);
        setRay(world, slot, f.threatRay ?? 2, 0.6, CH.BIGGER);
        world.turnRate[slot] = f.turn ?? 0;
        if (f.output !== undefined) {
            world.outputs[slot * OUTPUT_COUNT + f.output] = 1;
        }
        updateIntent(intent, world);
        return intent.lastResponse[slot];
    }

    it('are set by turning away, sprinting, an alarm, smoke, and a bite with the threat on an arc ray', () => {
        const turn = world0().config.maxTurn;
        expect(respond({ turn: -turn })).toBe(1);
        expect(respond({ output: OUTPUT_INDEX.SPRINT })).toBe(1);
        expect(respond({ output: OUTPUT_INDEX.ALARM })).toBe(1);
        expect(respond({ output: OUTPUT_INDEX.SMOKE })).toBe(1);
        expect(respond({ output: OUTPUT_INDEX.BITE })).toBe(1);
    });

    it('are not set by a turn towards the threat, a bite with the threat off the arc, or no response at all', () => {
        const turn = world0().config.maxTurn;
        expect(respond({ turn })).toBe(-Infinity);
        expect(respond({ output: OUTPUT_INDEX.BITE, threatRay: 6 })).toBe(-Infinity);
        expect(respond({})).toBe(-Infinity);
    });

    it('are not set without a threat on the rays, but sitting inside smoke is one', () => {
        const { world, intent } = intentArena();
        const slot = addBorn(world, { spec: FORAGER });
        nextTick(world, 1);
        world.outputs[slot * OUTPUT_COUNT + OUTPUT_INDEX.SPRINT] = 1;
        updateIntent(intent, world);
        expect(intent.lastResponse[slot]).toBe(-Infinity);
        setRay(world, slot, 5, 1, CH.SMOKE);
        nextTick(world, 2);
        updateIntent(intent, world);
        expect(intent.lastResponse[slot]).toBe(2);
    });
});

describe('sightings and reset', () => {
    it('record the last tick of food, prey ahead and a threat', () => {
        const { world, intent } = intentArena();
        const slot = addBorn(world, { spec: FORAGER });
        nextTick(world, 3);
        setRay(world, slot, 4, 0.5, CH.FOOD);
        setRay(world, slot, 1, 0.5, CH.SMALLER);
        setRay(world, slot, 9, 0.8, CH.BIGGER);
        updateIntent(intent, world);
        expect([intent.lastFood[slot], intent.lastPrey[slot], intent.lastThreat[slot]]).toEqual([3, 3, 3]);
        expect(intent.threatProx[slot]).toBeCloseTo(0.8);
        clearRays(world, slot);
        tickIntent(world, intent, 4);
        expect(intent.lastFood[slot]).toBe(3);
    });

    it('resetIntentSlot clears a reused slot', () => {
        const { world, intent } = intentArena();
        const fresh = /** @type {Record<string, any>} */ (createIntentState(world.config));
        intent.deliberateFood[2] = 5;
        intent.lastThreat[2] = 9;
        intent.lastBiteDeliberate[2] = 1;
        intent.episodeOpen[2] = 1;
        resetIntentSlot(intent, 2);
        for (const name of Object.keys(fresh)) {
            if (fresh[name].length === world.config.maxAgents) {
                expect(intent[name][2], name).toBe(fresh[name][2]);
            }
        }
    });

    it('is reset for a slot that dies and is reborn in one tick', () => {
        const { world, observer, intent } = intentArena();
        const slot = addBorn(world, { spec: FORAGER });
        observe(observer, world);
        intent.deliberateFood[slot] = 5;
        intent.lastThreat[slot] = 0;
        nextTick(world, 1);
        const oldId = world.genomeId[slot];
        pushDied(world, { slot, genomeId: oldId });
        world.genomeId[slot] = oldId + 100;
        pushBorn(world, { slot, genomeId: oldId + 100, tick: 1 });
        observe(observer, world);
        expect([intent.deliberateFood[slot], intent.lastThreat[slot]]).toEqual([0, -Infinity]);
    });

    it('skips tick 0 and dead slots', () => {
        const { world, intent } = intentArena();
        const slot = addBorn(world, { spec: FORAGER });
        setRay(world, slot, 0, 0.5, CH.FOOD);
        updateIntent(intent, world);
        expect(intent.lastFood[slot]).toBe(-Infinity);
        world.alive[slot] = 0;
        tickIntent(world, intent, 1);
        expect(intent.lastFood[slot]).toBe(-Infinity);
    });
});

/**
 * @returns {any} a world only for its config
 */
function world0() {
    return intentArena().world;
}
