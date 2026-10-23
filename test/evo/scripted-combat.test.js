import { describe, expect, it } from 'vitest';
import { OUTPUT_COUNT, OUTPUT_INDEX, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng, fork } from '../../js/sim/rng.js';
import { createWorld } from '../../js/sim/spawn.js';
import { createBaselineV5 } from '../../js/evo/policies/baseline-v5.js';
import { COMBAT_CONTROLLERS } from '../../js/evo/scripted-combat.js';
import { SCRIPTED_CONTROLLERS, SEEK_THRUST } from '../../js/evo/scripted.js';

const RAYS = 16;
const CH = { food: 1, threat: 2, prey: 3 };
const O = OUTPUT_INDEX;
const BODY = { bitten: 12, attackLeft: 21, attackRight: 22 };

/**
 * @param {keyof typeof COMBAT_CONTROLLERS} name the controller
 * @returns {{world: any, run: (w: any) => void}}
 */
function setup(name) {
    const config = createConfig({ seed: 1, initialAgents: 3, maxAgents: 6, minAgents: 0, immigrationInterval: 0 });
    const world = createWorld(config, createBaselineV5().brain);
    return { world, run: COMBAT_CONTROLLERS[name]({ world, rng: fork(createRng(1), 'scripted') }) };
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
 * @param {number} offset the body input offset
 * @param {number} value the value
 * @returns {void}
 */
function body(world, slot, offset, value) {
    world.inputs[slot * world.layout.inputCount + RAYS * RAY_CHANNELS + offset] = value;
}

/**
 * @param {any} world the world
 * @param {number} slot the agent
 * @returns {number[]} the slot's output row
 */
function out(world, slot = 0) {
    return Array.from(world.outputs.subarray(slot * OUTPUT_COUNT, (slot + 1) * OUTPUT_COUNT));
}

describe('combat controllers', () => {
    it('are merged into SCRIPTED_CONTROLLERS', () => {
        for (const name of Object.keys(COMBAT_CONTROLLERS)) {
            expect(SCRIPTED_CONTROLLERS[/** @type {keyof typeof SCRIPTED_CONTROLLERS} */ (name)], name).toBeDefined();
        }
        expect(Object.isFrozen(COMBAT_CONTROLLERS)).toBe(true);
    });

    it('hunter turns to prey, thrusts, sprints and bites, and calls a hunt once on first sight', () => {
        const { world, run } = setup('hunter');
        hit(world, 0, 3, CH.prey);
        hit(world, 1, RAYS - 2, CH.prey);
        run(world);
        expect(out(world, 0)).toEqual([1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0]);
        expect(out(world, 1)).toEqual([1, -1, 1, 0, 1, 0, 0, 1, 1, 0, 0]);
        run(world);
        expect(out(world, 0)[O.HUNT]).toBe(0);
        expect(out(world, 0)[O.BITE]).toBe(1);
        expect(out(world, 2)).toEqual([Math.fround(SEEK_THRUST), 0, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('hunter calls again after it loses sight and sees prey again', () => {
        const { world, run } = setup('hunter');
        hit(world, 0, 3, CH.prey);
        run(world);
        world.inputs.fill(0);
        run(world);
        hit(world, 0, 3, CH.prey);
        run(world);
        expect(out(world, 0)[O.HUNT]).toBe(1);
    });

    it('hunter follows the stronger attack antenna when it sees no prey, without sprinting or biting', () => {
        const { world, run } = setup('hunter');
        body(world, 0, BODY.attackLeft, 0.6);
        body(world, 0, BODY.attackRight, 0.2);
        body(world, 1, BODY.attackLeft, 0.1);
        body(world, 1, BODY.attackRight, 0.5);
        run(world);
        expect(out(world, 0)).toEqual([1, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)).toEqual([1, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('fleer turns away from a threat and sprints, and raises one alarm on first sight', () => {
        const { world, run } = setup('fleer');
        hit(world, 0, 3, CH.threat);
        hit(world, 1, RAYS - 3, CH.threat);
        hit(world, 2, 0, CH.threat);
        run(world);
        expect(out(world, 0)).toEqual([1, -1, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
        expect(out(world, 1)).toEqual([1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
        expect(out(world, 2)).toEqual([1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0]);
        run(world);
        expect(out(world, 0)[O.ALARM]).toBe(0);
        expect(out(world, 0)[O.SPRINT]).toBe(1);
    });

    it('fleer turns away from the stronger attack antenna, and seeks food when nothing threatens', () => {
        const { world, run } = setup('fleer');
        body(world, 0, BODY.attackLeft, 0.6);
        hit(world, 1, 1, CH.food);
        run(world);
        expect(out(world, 0)).toEqual([1, -1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
        expect(out(world, 1)).toEqual([Math.fround(SEEK_THRUST), 1, 0, 0, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('fleer releases smoke while its bite-timer input shows a bite, and not otherwise', () => {
        const { world, run } = setup('fleer');
        body(world, 0, BODY.bitten, 0.9);
        run(world);
        expect(out(world, 0)[O.SMOKE]).toBe(1);
        expect(out(world, 1)[O.SMOKE]).toBe(0);
    });

    it('the spammers seek food and hold one call output at 1', () => {
        for (const [name, output] of [
            ['alarmSpammer', O.ALARM],
            ['smokeSpammer', O.SMOKE],
        ]) {
            const { world, run } = setup(/** @type {any} */ (name));
            hit(world, 0, 1, CH.food);
            world.outputs.fill(0.7);
            run(world);
            const expected = [Math.fround(SEEK_THRUST), 1, 0, 0, 0, 0, 0, 0, 1, 0, 0];
            expected[/** @type {number} */ (output)] = 1;
            expect(out(world, 0), String(name)).toEqual(expected);
        }
    });
});
