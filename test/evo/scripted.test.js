import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { createBaselineV5 } from '../../js/evo/policies/baseline-v5.js';
import { CONSTANT_THRUSTS, MEAL_ENERGY, SCRIPTED_CONTROLLERS, SEEK_THRUST } from '../../js/evo/scripted.js';
import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';

/** The seeking thrust as the Float32 outputs row stores it. */
const SEEK = Math.fround(SEEK_THRUST);

const RAYS = 16;
const CH = { food: 1, threat: 2, prey: 3, other: 4, kin: 5, wall: 6, obstacle: 7 };

/**
 * A tiny world with every agent's rays empty; returns it with a controller of the given name.
 * @param {keyof typeof SCRIPTED_CONTROLLERS} name
 * @param {number} [seed]
 */
function setup(name, seed = 1) {
    const config = createConfig({ seed, initialAgents: 3, maxAgents: 6, minAgents: 0, immigrationInterval: 0 });
    const world = createWorld(config, createBaselineV5().brain);
    const run = SCRIPTED_CONTROLLERS[name]({ world, rng: fork(createRng(seed), 'scripted') });
    return { world, run };
}

/**
 * Puts a hit on ray `k` of `slot`: proximity and one class channel (an agent class holds the proximity, as `castRays` writes it).
 * @param {Record<string, any>} world
 * @param {number} slot
 * @param {number} k
 * @param {number} channel
 * @param {number} [proximity]
 */
function hit(world, slot, k, channel, proximity = 0.5) {
    const base = slot * world.layout.inputCount + k * RAY_CHANNELS;
    world.inputs[base] = proximity;
    world.inputs[base + channel] = channel >= CH.threat && channel <= CH.kin ? proximity : 1;
}

/**
 * @param {Record<string, any>} world
 * @param {number} [slot]
 * @returns {number[]} the slot's [thrust, turn, sprint, mate, bite, alarm, smoke, hunt]
 */
function out(world, slot = 0) {
    return Array.from(world.outputs.subarray(slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT));
}

describe('SCRIPTED_CONTROLLERS', () => {
    it('is frozen and names the seven controllers, the five constant-thrust ones, the four combat ones and the five intent ones', () => {
        expect(Object.isFrozen(SCRIPTED_CONTROLLERS)).toBe(true);
        expect(Object.keys(SCRIPTED_CONTROLLERS).sort()).toEqual(
            [
                'bumper',
                'biteSeeker',
                'explorerAfterMeal',
                'foodSeeker',
                'sitter',
                'spinner',
                'wanderer',
                'thrust0',
                'thrust20',
                'thrust40',
                'thrust60',
                'thrust100',
                'hunter',
                'fleer',
                'alarmSpammer',
                'smokeSpammer',
                'sloppyForager',
                'jawSitter',
                'huntCallSpammer',
                'grouper',
                'cruiser',
            ].sort(),
        );
    });

    it('each constant-thrust controller writes its thrust and the foodSeeker steering', () => {
        expect(Object.values(CONSTANT_THRUSTS)).toEqual([0, 0.2, 0.4, 0.6, 1]);
        for (const [name, thrust] of Object.entries(CONSTANT_THRUSTS)) {
            const { world, run } = setup(/** @type {keyof typeof SCRIPTED_CONTROLLERS} */ (name));
            hit(world, 0, 1, CH.food);
            hit(world, 1, RAYS - 1, CH.food);
            run(world);
            expect(out(world, 0), name).toEqual([Math.fround(thrust), 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
            expect(out(world, 1), name).toEqual([Math.fround(thrust), -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
            expect(out(world, 2), name).toEqual([Math.fround(thrust), 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        }
    });

    it('foodSeeker turns to the positive side for food on ray 1 and the negative side for ray 15, thrusting', () => {
        const { world, run } = setup('foodSeeker');
        hit(world, 0, 1, CH.food);
        hit(world, 1, RAYS - 1, CH.food);
        run(world);
        expect(out(world, 0)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)).toEqual([SEEK, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 2)).toEqual([SEEK, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('foodSeeker picks the nearest food and ignores other classes', () => {
        const { world, run } = setup('foodSeeker');
        hit(world, 0, 3, CH.food, 0.2);
        hit(world, 0, 13, CH.food, 0.9);
        hit(world, 0, 5, CH.threat, 0.99);
        run(world);
        expect(out(world)[1]).toBe(-1);
    });

    it('sitter writes all zeros', () => {
        const { world, run } = setup('sitter');
        hit(world, 0, 1, CH.food);
        world.outputs.fill(0.7);
        run(world);
        expect(out(world, 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('spinner turns fully with half thrust whatever it sees', () => {
        const { world, run } = setup('spinner');
        hit(world, 0, 13, CH.food);
        run(world);
        expect(out(world, 0)).toEqual([0.5, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('bumper turns towards the nearest agent of any class and ignores food', () => {
        const { world, run } = setup('bumper');
        hit(world, 0, 2, CH.other, 0.3);
        hit(world, 0, 14, CH.prey, 0.8);
        hit(world, 0, 4, CH.food, 0.99);
        hit(world, 1, 12, CH.kin, 0.4);
        run(world);
        expect(out(world, 0)).toEqual([1, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)).toEqual([1, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 2)[1]).toBe(0);
    });

    it('biteSeeker steers to the nearest threat, not prey, and never bites', () => {
        const { world, run } = setup('biteSeeker');
        hit(world, 0, 2, CH.prey, 0.9);
        hit(world, 0, 14, CH.threat, 0.3);
        run(world);
        expect(out(world, 0)).toEqual([1, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('wanderer turns away from food and otherwise turns slowly and randomly', () => {
        const { world, run } = setup('wanderer');
        hit(world, 0, 2, CH.food);
        for (let i = 0; i < 50; i++) {
            run(world);
            expect(out(world, 0)).toEqual([1, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
            expect(Math.abs(out(world, 1)[1])).toBeLessThanOrEqual(0.3);
        }
        const turns = new Set();
        for (let i = 0; i < 20; i++) {
            run(world);
            turns.add(out(world, 1)[1]);
        }
        expect(turns.size).toBeGreaterThan(1);
    });

    it('explorerAfterMeal seeks food until it has eaten MEAL_ENERGY, then turns only at walls', () => {
        const { world, run } = setup('explorerAfterMeal');
        hit(world, 0, 1, CH.food);
        hit(world, 0, 0, CH.wall, 0.9);
        run(world);
        expect(out(world, 0)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        world.foodEnergy[0] += MEAL_ENERGY;
        run(world);
        expect(out(world, 0)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        world.inputs.fill(0);
        hit(world, 0, 1, CH.food);
        hit(world, 0, 1, CH.wall, 0.2);
        run(world);
        expect(out(world, 0)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        hit(world, 0, 1, CH.wall, 0.9);
        run(world);
        expect(out(world, 0)).toEqual([1, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('explorerAfterMeal restarts the meal count when a slot gets a new genome', () => {
        const { world, run } = setup('explorerAfterMeal');
        hit(world, 0, 1, CH.food);
        run(world);
        world.foodEnergy[0] = MEAL_ENERGY;
        run(world);
        expect(out(world, 0)[1]).toBe(0);
        world.genomeId[0] += 100;
        world.foodEnergy[0] = 0;
        run(world);
        expect(out(world, 0)[1]).toBe(1);
    });

    it('every controller holds SPLIT at 1 and both memory outputs at 0, with or without a hit on its rays', () => {
        for (const name of /** @type {(keyof typeof SCRIPTED_CONTROLLERS)[]} */ (Object.keys(SCRIPTED_CONTROLLERS))) {
            const { world, run } = setup(name);
            run(world);
            const quiet = out(world, 0);
            hit(world, 0, 1, CH.food);
            hit(world, 0, 2, CH.threat);
            run(world);
            for (const row of [quiet, out(world, 0)]) {
                expect([row[OUTPUT_INDEX.SPLIT], row[OUTPUT_INDEX.MEMORY_A], row[OUTPUT_INDEX.MEMORY_B]], name).toEqual(
                    [1, 0, 0],
                );
            }
        }
    });

    it('keeps outputs within [-1, 1] and writes only alive slots', () => {
        for (const name of /** @type {(keyof typeof SCRIPTED_CONTROLLERS)[]} */ (Object.keys(SCRIPTED_CONTROLLERS))) {
            const { world, run } = setup(name);
            hit(world, 0, 1, CH.food);
            run(world);
            expect(
                world.outputs.every((/** @type {number} */ v) => v >= -1 && v <= 1),
                name,
            ).toBe(true);
            expect(out(world, 5), name).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        }
    });

    it('is deterministic for the same rng seed and differs across seeds', () => {
        const trace = (/** @type {number} */ seed) => {
            const { world, run } = setup('wanderer', seed);
            const turns = [];
            for (let i = 0; i < 30; i++) {
                run(world);
                turns.push(out(world, 0)[1]);
            }
            return turns;
        };
        expect(trace(5)).toEqual(trace(5));
        expect(trace(5)).not.toEqual(trace(6));
    });
});
