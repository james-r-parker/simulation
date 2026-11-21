import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../../js/sim/effect-list.js';
import {
    EFFECT,
    EFFECT_INDEX,
    GATE,
    LANE_ID,
    RESULT,
    allocEffects,
    computeFactor,
    factorOf,
    fadeEffects,
    gateOpen,
    liveOf,
} from '../../js/sim/effects.js';
import { allocBody } from './helpers/body.js';
import { smallWorld } from './helpers/small-world.js';

describe('the default registry', () => {
    it('names each effect once, by `EFFECT_INDEX` and in UPPER_SNAKE by `EFFECT`', () => {
        expect(Object.keys(EFFECT_INDEX)).toEqual(EFFECTS.map((effect) => effect.name));
        expect(Object.values(EFFECT)).toEqual(Object.values(EFFECT_INDEX));
    });

    it('leaves every scaled lane at its base and every gate open for a calm body, with every level at 0', () => {
        const world = smallWorld({ maxAgents: 4 });
        const slot = allocBody(world, 0);
        world.temperature[slot] = 50;
        world.energy[slot] = 1;
        world.ateTimer[slot] = 255;
        world.ageTicks[slot] = world.config.maturityTicks;
        world.lanes.visionRange[slot] = 7;
        expect(liveOf(world, slot, 'visionRange')).toBe(7);
        for (const gate of Object.values(GATE)) {
            expect(gateOpen(world, slot, gate)).toBe(true);
        }
        for (const lane of new Set(EFFECTS.flatMap((effect) => effect.scales.map((scale) => scale.lane)))) {
            expect(liveOf(world, slot, lane), `${lane} of a calm body`).toBe(world.lanes[lane][slot]);
        }
    });

    it('gives the product of the factors on a lane, returned by factorOf and left in RESULT by computeFactor', () => {
        const world = smallWorld({ maxAgents: 4 });
        const slot = allocBody(world, 0);
        world.temperature[slot] = 50;
        world.energy[slot] = world.lanes.maxEnergy[slot] / 2;
        world.ateTimer[slot] = 255;
        const fat = 1 - world.lanes.fatSlowShare[slot] * 0.5;
        expect(factorOf(world, slot, 'maxThrust')).toBeCloseTo(fat, 12);
        computeFactor(world, slot, 'maxThrust');
        expect(RESULT[0]).toBe(factorOf(world, slot, 'maxThrust'));
        expect(factorOf(world, slot, 'sprintCost')).toBe(1);
    });

    it('allocates a row pair for each stored effect only, once, and fades nothing it has not stored', () => {
        const world = smallWorld({ maxAgents: 4 });
        const stored = EFFECTS.filter((effect) => effect.level === 'stacks').length;
        expect(world.effectStacks).toHaveLength(stored);
        expect(world.effectTicks).toHaveLength(stored);
        const rows = world.agentRows.length;
        allocEffects(world);
        // The rows are declared by `agentSpecs`, so a second call finds them and adds none.
        expect(world.agentRows).toHaveLength(rows);
        fadeEffects(world);
    });
});

describe('the rules a world folds', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @param {number} effect an `EFFECT` code
     * @returns {boolean} whether the world folds the effect's rule on `maxThrust`
     */
    function folds(over, effect) {
        const world = smallWorld({ maxAgents: 4, ...over });
        return world.laneRules[LANE_ID.maxThrust].some(
            (/** @type {{effect: number}} */ rule) => rule.effect === effect,
        );
    }

    it('leaves out a rule whose strength is 0, and keeps one that is on, a table and a rule that reads a lane', () => {
        expect(folds({}, EFFECT.WOUNDED)).toBe(false);
        expect(folds({ woundThrust: 0.1 }, EFFECT.WOUNDED)).toBe(true);
        expect(folds({}, EFFECT.COLD_BAND)).toBe(true);
        expect(folds({}, EFFECT.FAT)).toBe(true);
    });

    it('treats a power rule as off at a factor of 1', () => {
        const hoarse = (/** @type {Record<string, any>} */ over) =>
            smallWorld({ maxAgents: 4, ...over }).laneRules[LANE_ID.alarmCost].some(
                (/** @type {{effect: number}} */ rule) => rule.effect === EFFECT.HOARSE,
            );
        expect(hoarse({})).toBe(false);
        expect(hoarse({ hoarseFactor: 2 })).toBe(true);
    });
});
