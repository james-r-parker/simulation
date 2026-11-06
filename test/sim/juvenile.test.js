// The juvenile burn (realistic-keepers.md T4): a canHunt body below juvenileTicks pays juvenileBurn of its standing, movement,
// turn and sprint cost under juvenileDependency, and exactly the plain cost otherwise; the hunter ledger's terms still sum to
// what was removed.

import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { applyCosts } from '../../js/sim/energy.js';
import { juvenileBurnOf } from '../../js/sim/juvenile.js';
import { allocateWorld } from '../../js/sim/world.js';
import { SIMPLE_WORLD } from '../helpers/simple-world.js';
import { allocBody } from './helpers/body.js';

const FORAGER = 0;
const PREDATOR = 1;

/**
 * Two agents moving and sprinting alike, a forager (slot 0) and a predator (slot 1), each with 1000 energy.
 * @param {Record<string, any>} [over] config overrides
 * @returns {Record<string, any>} the world
 */
function pair(over = {}) {
    const world = allocateWorld(
        createConfig({
            ...SIMPLE_WORLD,
            maxAgents: 4,
            initialAgents: 0,
            minAgents: 0,
            initialFood: 0,
            juvenileTicks: 3000,
            juvenileBurn: 0.5,
            ...over,
        }),
    );
    [FORAGER, PREDATOR].forEach((spec, slot) => {
        allocBody(world);
        world.temperature[slot] = world.config.temperatureStart;
        world.spec[slot] = spec;
        world.energy[slot] = 1000;
        world.vx[slot] = 3;
        world.vy[slot] = 4;
        world.turnRate[slot] = 0.2;
        world.size[slot] = 20;
        world.outputs[slot * OUTPUT_COUNT + 2] = 1;
    });
    return world;
}

/**
 * @param {Record<string, any>} world the world
 * @param {number} slot the agent
 * @returns {number} the energy `applyCosts` takes from it in one tick
 */
function costOf(world, slot) {
    const before = world.energy[slot];
    applyCosts(world);
    return before - world.energy[slot];
}

describe('juvenileBurnOf', () => {
    it('is juvenileBurn for a hunter below juvenileTicks while juvenileDependency is on', () => {
        const world = pair({ juvenileDependency: true });
        expect(juvenileBurnOf(world, PREDATOR)).toBe(0.5);
        world.ageTicks[PREDATOR] = 2999;
        expect(juvenileBurnOf(world, PREDATOR)).toBe(0.5);
    });

    it('is 1 for an adult hunter, a non-hunter and the switch off', () => {
        const world = pair({ juvenileDependency: true });
        world.ageTicks[PREDATOR] = 3000;
        expect(juvenileBurnOf(world, PREDATOR)).toBe(1);
        expect(juvenileBurnOf(world, FORAGER)).toBe(1);
        expect(juvenileBurnOf(pair({ juvenileDependency: false }), PREDATOR)).toBe(1);
    });
});

describe('the juvenile burn in applyCosts', () => {
    it('charges a juvenile hunter juvenileBurn of the plain cost, a forager the plain cost', () => {
        const on = pair({ juvenileDependency: true });
        const off = pair({ juvenileDependency: false });
        const plain = costOf(off, PREDATOR);
        const forager = costOf(off, FORAGER);
        expect(costOf(on, PREDATOR)).toBeCloseTo(0.5 * plain, 9);
        expect(costOf(on, FORAGER)).toBe(forager);
    });

    it('charges exactly the plain cost with the switch off, adult or not', () => {
        const a = pair({ juvenileDependency: false, juvenileBurn: 0.1 });
        const b = pair({ juvenileDependency: true, juvenileBurn: 0.1 });
        b.ageTicks[PREDATOR] = 5000;
        expect(costOf(b, PREDATOR)).toBe(costOf(a, PREDATOR));
    });

    it('keeps the ledger terms summing to the energy removed', () => {
        for (const burn of [0.3, 0.6, 1]) {
            const world = pair({ juvenileDependency: true, juvenileBurn: burn });
            const paid = costOf(world, PREDATOR);
            const booked = world.ledgerStanding[PREDATOR] + world.ledgerMove[PREDATOR] + world.ledgerSprint[PREDATOR];
            expect(booked).toBeCloseTo(paid, 9);
            expect(world.ledgerSprint[PREDATOR]).toBeCloseTo(burn * world.config.sprintCost, 9);
        }
    });

    it('steps back up to the plain cost on the tick the hunter reaches juvenileTicks', () => {
        const plain = costOf(pair({ juvenileDependency: false }), PREDATOR);
        const last = pair({ juvenileDependency: true });
        last.ageTicks[PREDATOR] = 2998;
        expect(costOf(last, PREDATOR)).toBeCloseTo(0.5 * plain, 9);
        const first = pair({ juvenileDependency: true });
        first.ageTicks[PREDATOR] = 2999;
        expect(costOf(first, PREDATOR)).toBeCloseTo(plain, 9);
    });
});
