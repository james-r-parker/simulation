import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { FITNESS_V6_SKILL } from '../../js/evo/fitness-v6-skill.js';
import { createBaselineV5 } from '../../js/evo/policies/baseline-v5.js';
import { BAIT_FLEE_TICKS, PATROL_REACH, SPAMMER_TURN, V6_CONTROLLERS } from '../../js/evo/scripted-v6.js';
import { SCRIPTED_CONTROLLERS, SEEK_THRUST } from '../../js/evo/scripted.js';

const CH = { food: 1, threat: 2, prey: 3 };
const O = OUTPUT_INDEX;
const BODY_BITTEN = 12;
const SEEK = Math.fround(SEEK_THRUST);

/**
 * @param {keyof typeof V6_CONTROLLERS} name the controller
 * @param {Record<string, any>} [extra] config overrides
 * @returns {{world: any, run: (w: any) => void}} a small world and the controller's brain phase
 */
function setup(name, extra = {}) {
    const config = createConfig({
        seed: 1,
        initialAgents: 3,
        maxAgents: 6,
        minAgents: 0,
        ...extra,
    });
    const world = createWorld(config, createBaselineV5().brain);
    return { world, run: V6_CONTROLLERS[name]({ world, rng: fork(createRng(1), 'scripted') }) };
}

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} k the ray
 * @param {number} channel the class channel
 * @returns {void}
 */
function hit(world, slot, k, channel) {
    const base = slot * world.layout.inputCount + k * RAY_CHANNELS;
    world.inputs[base] = 0.5;
    world.inputs[base + channel] = channel >= CH.threat ? 0.5 : 1;
}

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @param {number} value the bitten input
 * @returns {void}
 */
function bitten(world, slot, value) {
    world.inputs[slot * world.layout.inputCount + world.config.rayCount * RAY_CHANNELS + BODY_BITTEN] = value;
}

/**
 * @param {any} world the world
 * @param {number} [slot] the agent
 * @returns {number[]} the slot's output row
 */
function out(world, slot = 0) {
    return Array.from(world.outputs.subarray(slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT));
}

describe('v6 exploit controllers', () => {
    it('are frozen, named by the plan and merged into SCRIPTED_CONTROLLERS', () => {
        expect(Object.keys(V6_CONTROLLERS)).toEqual([
            'baiter',
            'sprinter',
            'gateThenIdle',
            'splitSpammer',
            'mateHopper',
            'chaseDrifter',
            'patrol',
        ]);
        expect(Object.isFrozen(V6_CONTROLLERS)).toBe(true);
        for (const [name, factory] of Object.entries(V6_CONTROLLERS)) {
            expect(SCRIPTED_CONTROLLERS[/** @type {keyof typeof SCRIPTED_CONTROLLERS} */ (name)], name).toBe(factory);
        }
    });

    it('sprinter seeks food with SPRINT held on every tick, whatever it sees', () => {
        const { world, run } = setup('sprinter');
        run(world);
        expect(out(world)).toEqual([SEEK, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0]);
        hit(world, 0, 1, CH.food);
        run(world);
        expect(out(world)).toEqual([SEEK, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('splitSpammer circles at a fixed turn and never steers at food', () => {
        const { world, run } = setup('splitSpammer');
        hit(world, 0, 3, CH.food);
        run(world);
        for (const slot of [0, 1, 2]) {
            expect(out(world, slot)).toEqual([SEEK, Math.fround(SPAMMER_TURN), 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        }
    });

    it('gateThenIdle seeks food until the food eaten reaches the gate, then holds still', () => {
        const { world, run } = setup('gateThenIdle');
        hit(world, 0, 1, CH.food);
        run(world);
        expect(out(world)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        world.foodEnergy[0] += FITNESS_V6_SKILL.GATE - 1;
        run(world);
        expect(out(world)[O.THRUST]).toBe(SEEK);
        world.foodEnergy[0] += 1;
        run(world);
        expect(out(world)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)[O.THRUST]).toBe(SEEK);
    });

    it('gateThenIdle counts a reused slot from its new genome', () => {
        const { world, run } = setup('gateThenIdle');
        world.foodEnergy[0] = 10 * FITNESS_V6_SKILL.GATE;
        run(world);
        expect(out(world)[O.THRUST]).toBe(SEEK);
        world.foodEnergy[0] += FITNESS_V6_SKILL.GATE;
        run(world);
        expect(out(world)[O.THRUST]).toBe(0);
        world.genomeId[0] = 999;
        world.foodEnergy[0] = 0;
        run(world);
        expect(out(world)[O.THRUST]).toBe(SEEK);
    });

    it('mateHopper walks a ready adult to the nearest agent, feeds one that is not ready, and burns a mating child', () => {
        const { world, run } = setup('mateHopper');
        const { maturityTicks, mateMinEnergy } = world.config;
        world.ageTicks.set([maturityTicks, 0, 0]);
        world.parentA.set([0, 5, 5]);
        world.parentB.set([0, 6, 5]);
        world.energy.fill(mateMinEnergy + 1);
        world.cooldown.fill(0);
        world.pregnancy.fill(0);
        hit(world, 0, 2, CH.prey);
        hit(world, 0, 1, CH.food);
        run(world);
        expect(out(world, 0)).toEqual([SEEK, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0]);
        // A young split child (one parent twice) is not a mating child: it feeds as it can, and is not ready to mate.
        expect(out(world, 2)).toEqual([SEEK, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
        // Not ready (in cooldown): it seeks the food in sight and still holds MATE.
        world.cooldown[0] = 5;
        run(world);
        expect(out(world, 0)).toEqual([SEEK, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
        hit(world, 0, 3, CH.prey);
        world.cooldown[0] = 0;
        world.ageTicks[1] = maturityTicks;
        run(world);
        expect(out(world, 1)[O.THRUST]).toBe(SEEK);
        expect(out(world, 1)[O.MATE]).toBe(1);
    });

    it('chaseDrifter follows prey at full thrust without biting, and seeks food when none is in sight', () => {
        const { world, run } = setup('chaseDrifter');
        hit(world, 0, 2, CH.prey);
        hit(world, 1, 1, CH.food);
        run(world);
        expect(out(world, 0)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 2)).toEqual([SEEK, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('baiter seeks a threat until bitten, runs fleer for BAIT_FLEE_TICKS, then seeks again', () => {
        const { world, run } = setup('baiter');
        hit(world, 0, 2, CH.threat);
        run(world);
        expect(out(world)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        bitten(world, 0, 1);
        world.tick = 100;
        run(world);
        bitten(world, 0, 0);
        expect(out(world)[O.SPRINT]).toBe(1);
        expect(out(world)[O.TURN]).toBe(-1);
        world.tick = 100 + BAIT_FLEE_TICKS - 1;
        run(world);
        expect(out(world)[O.SPRINT]).toBe(1);
        world.tick = 100 + BAIT_FLEE_TICKS;
        run(world);
        expect(out(world)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('baiter seeks food with no threat in sight and forgets a flee when the slot gets a new genome', () => {
        const { world, run } = setup('baiter');
        hit(world, 0, 1, CH.food);
        run(world);
        expect(out(world)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        bitten(world, 0, 1);
        run(world);
        bitten(world, 0, 0);
        hit(world, 0, 2, CH.threat);
        world.tick = 5;
        world.genomeId[0] = 777;
        run(world);
        expect(out(world)).toEqual([SEEK, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('patrol heads for its patch, moves on inside PATROL_REACH and ignores food in sight', () => {
        const { world, run } = setup('patrol');
        const { foodPatchRadius, foodPatchCount } = world.config;
        expect(foodPatchCount).toBeGreaterThan(3);
        world.angle.fill(0);
        world.x.fill(1000);
        world.y.fill(1000);
        // Slot 0 targets patch 0 dead ahead, slot 1 patch 1 on its left, slot 2 patch 2 on its right.
        world.patchX.fill(5000);
        world.patchY.fill(1000);
        world.patchY[1] = 4000;
        world.patchY[2] = -2000;
        hit(world, 0, 5, CH.food);
        run(world);
        expect(out(world, 0)).toEqual([SEEK, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)[O.TURN]).toBe(1);
        expect(out(world, 2)[O.TURN]).toBe(-1);
        // Slot 0 inside the reach of patch 0 moves on to patch 1, which lies to its left.
        world.patchX[0] = 1000 + PATROL_REACH * foodPatchRadius - 1;
        world.patchY[0] = 1000;
        run(world);
        expect(out(world, 0)[O.TURN]).toBe(1);
    });

    it('patrol holds SEEK_THRUST straight ahead when the world has no patches', () => {
        const { world, run } = setup('patrol', { foodPatchCount: 0 });
        hit(world, 0, 1, CH.food);
        run(world);
        for (const slot of [0, 1, 2]) {
            expect(out(world, slot)).toEqual([SEEK, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        }
    });
});
