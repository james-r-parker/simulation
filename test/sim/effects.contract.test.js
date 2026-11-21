// The effect registry's contract (docs/designs/status-effects.md, "Unit tests"), run over fixture effects: the engine is
// the same for any list, so what holds for these holds for every entry of `EFFECTS`.

import { describe, expect, it } from 'vitest';
import { GATE, GATE_COUNT, createEffects, numberOf } from '../../js/sim/effects.js';
import { applyEffectOn } from '../../js/sim/effect-appliers.js';
import { freeAgent } from '../../js/sim/world.js';
import { RALLY_I, HOARSE_I, SYSTEM, chill, fixtureWorld } from './helpers/effect-fixtures.js';
import { smallWorld } from './helpers/small-world.js';

describe('liveOf', () => {
    it('leaves a lane at its base while every level is 0', () => {
        const world = fixtureWorld();
        expect(SYSTEM.liveOf(world, 0, 'maxThrust')).toBe(2);
        expect(SYSTEM.liveOf(world, 0, 'maxTurn')).toBe(0.5);
        expect(SYSTEM.liveOf(world, 0, 'sprintCost')).toBe(world.lanes.sprintCost[0]);
    });

    it('equals the base times each factor in registry order, against a naive loop', () => {
        const world = fixtureWorld();
        for (const cold of [0, 1]) {
            for (const fat of [0, 0.25, 1]) {
                for (let stacks = 0; stacks <= 3; stacks++) {
                    world.fixture.chill[0] = cold;
                    world.fixture.fat[0] = fat;
                    world.effectStacks[0][0] = stacks;
                    let naive = 2;
                    naive *= cold === 1 ? 0.5 : 1;
                    naive *= Math.max(0, 1 + -0.5 * fat);
                    naive *= Math.max(0, 1 + 0.1 * stacks);
                    expect(SYSTEM.liveOf(world, 0, 'maxThrust')).toBe(naive);
                }
            }
        }
    });

    it('reads a config key named by a string, with a scale or an offset alone', () => {
        const world = fixtureWorld();
        world.config.fixtureRate = 0.25;
        const rate = (/** @type {any} */ perStack) =>
            createEffects([chill({ scales: [{ lane: 'maxThrust', perStack }], read: () => 1 })]);
        expect(rate('fixtureRate').liveOf(world, 0, 'maxThrust')).toBe(2.5);
        expect(rate({ key: 'fixtureRate', scale: 2 }).liveOf(world, 0, 'maxThrust')).toBe(3);
        expect(rate({ key: 'fixtureRate', offset: 1 }).liveOf(world, 0, 'maxThrust')).toBe(2 * (1 + 1.25));
    });

    it('reads a lane or a config key for a number, scaled and offset', () => {
        const world = fixtureWorld();
        world.fixture.fat[0] = 0.5;
        world.lanes.maxTurn[0] = 1;
        world.lanes.fatSlowShare[0] = 0.5;
        expect(SYSTEM.liveOf(world, 0, 'maxTurn')).toBe(0.75);
        expect(numberOf(world, 0, { kind: 'literal', value: 7 })).toBe(7);
        expect(numberOf(world, 0, { kind: 'key', key: 'maxTurn', scale: 2, offset: -1 })).toBe(1);
    });

    it('never goes below 0', () => {
        const world = fixtureWorld();
        world.fixture.fat[0] = 4;
        expect(SYSTEM.liveOf(world, 0, 'maxThrust')).toBe(0);
    });

    it('reads each slot on its own', () => {
        const world = fixtureWorld();
        world.fixture.chill[1] = 1;
        expect(SYSTEM.liveOf(world, 0, 'maxThrust')).toBe(2);
        expect(SYSTEM.liveOf(world, 1, 'maxThrust')).toBe(1);
    });
});

describe('gateOpen', () => {
    it('is closed exactly while an effect that names the gate has a level above 0', () => {
        const world = fixtureWorld();
        expect(SYSTEM.gateOpen(world, 0, GATE.EAT)).toBe(true);
        world.fixture.chill[0] = 1;
        expect(SYSTEM.gateOpen(world, 0, GATE.EAT)).toBe(false);
        expect(SYSTEM.gateOpen(world, 1, GATE.EAT)).toBe(true);
        expect(SYSTEM.gateOpen(world, 0, GATE.BITE)).toBe(true);
        world.effectStacks[0][0] = 1;
        expect(SYSTEM.gateOpen(world, 0, GATE.BITE)).toBe(false);
    });

    it('has one list of closing effects per gate', () => {
        expect(SYSTEM.gates).toHaveLength(GATE_COUNT);
    });
});

describe('stored stacks', () => {
    it('end together on the tick a timer of n ticks runs out, and a new stack restarts the timer', () => {
        const world = fixtureWorld();
        applyEffectOn(SYSTEM, world, 0, { effect: RALLY_I, source: 0 });
        for (let tick = 0; tick < 4; tick++) {
            SYSTEM.fade(world);
            expect(world.effectStacks[0][0], `after fade ${tick + 1}`).toBe(1);
        }
        applyEffectOn(SYSTEM, world, 0, { effect: RALLY_I, source: 0 });
        for (let tick = 0; tick < 4; tick++) {
            SYSTEM.fade(world);
            expect(world.effectStacks[0][0]).toBe(2);
        }
        SYSTEM.fade(world);
        expect(world.effectStacks[0][0]).toBe(0);
        expect(world.effectTicks[0][0]).toBe(0);
    });

    it('lose one stack every n ticks for an every effect, and stop at 0', () => {
        const world = fixtureWorld();
        for (let k = 0; k < 3; k++) {
            applyEffectOn(SYSTEM, world, 1, { effect: HOARSE_I, source: 0 });
        }
        const seen = [];
        for (let tick = 0; tick < 10; tick++) {
            SYSTEM.fade(world);
            seen.push(world.effectStacks[1][1]);
        }
        expect(seen).toEqual([3, 3, 2, 2, 2, 1, 1, 1, 0, 0]);
    });

    it('are zeroed with the rest of a freed slot', () => {
        const world = fixtureWorld();
        applyEffectOn(SYSTEM, world, 0, { effect: RALLY_I, source: 0 });
        applyEffectOn(SYSTEM, world, 0, { effect: HOARSE_I, source: 0 });
        freeAgent(world, 0);
        for (const row of [...world.effectStacks, ...world.effectTicks]) {
            expect(row[0]).toBe(0);
        }
    });
});

describe('createEffects', () => {
    it('refuses a duplicate name, an unknown lane or gate and a scale of neither or both forms', () => {
        const make = (/** @type {Record<string, any>} */ over) => () => createEffects([chill(over)]);
        expect(() => createEffects([chill({}), chill({})])).toThrow(/own name/);
        expect(make({ scales: [{ lane: 'nope', perStack: 1 }] })).toThrow(/not a lane/);
        expect(make({ gates: ['NOPE'] })).toThrow(/not a gate/);
        expect(make({ scales: [{ lane: 'maxThrust' }] })).toThrow(/exactly one/);
        expect(make({ scales: [{ lane: 'maxThrust', perStack: 1, levels: [1] }] })).toThrow(/exactly one/);
        expect(make({ level: 'stacks' })).toThrow(/needs fades/);
    });

    it('stores nothing for an empty list', () => {
        const world = smallWorld({ maxAgents: 4 });
        const rows = world.agentRows.length;
        createEffects([]).allocRows(world);
        expect(world.agentRows).toHaveLength(rows);
        expect(world.effectStacks).toEqual([]);
    });
});

describe('factorOf and effectFactor', () => {
    it('give the product of the factors on a lane, and 1 for a lane or an effect that scales nothing', () => {
        const world = fixtureWorld();
        world.fixture.chill[0] = 1;
        world.fixture.fat[0] = 0.5;
        expect(SYSTEM.factorOf(world, 0, 'maxThrust')).toBe(0.5 * 0.75);
        expect(SYSTEM.factorOf(world, 0, 'sprintCost')).toBe(1);
        expect(SYSTEM.effectFactor(world, 0, 0, 'maxThrust')).toBe(0.5);
        expect(SYSTEM.effectFactor(world, 0, 1, 'maxThrust')).toBe(0.75);
        expect(SYSTEM.effectFactor(world, 0, 0, 'maxTurn')).toBe(1);
        expect(SYSTEM.effectFactor(world, 0, 0, 'sprintCost')).toBe(1);
    });
});
