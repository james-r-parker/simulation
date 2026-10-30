import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { CONTROL, applyControl, createControl, inputRanges, windowEnd } from '../../js/evo/memory-probe-controls.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';
import { CH_KIN } from '../../js/evo/scripted-parts.js';

/** The raw-row positions the layout puts the body block's parts at, derived here from the documented body offsets. */
function expectedRanges(/** @type {number} */ rayCount) {
    const body = rayCount * RAY_CHANNELS;
    return {
        rays: [0, body],
        scent: [body + 17, body + 30],
        memory: [body + 31, body + 33],
        allies: [
            [body + 27, body + 30],
            [body + 21, body + 24],
        ],
    };
}

/**
 * @param {Record<string, any>} [config] config overrides
 * @returns {Record<string, any>} a one-agent world whose raw input row is all ones and whose hidden row is all ones
 */
function onesWorld(config = {}) {
    const { world } = stageWorld({
        foods: [],
        rocks: [],
        agents: [{ x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
        seed: 1,
        config,
    });
    world.inputs.fill(1);
    world.hidden.fill(1);
    return world;
}

/**
 * @param {Record<string, any>} world the world
 * @returns {number[]} the indices of the agent's raw row that are zero
 */
function zeroed(world) {
    const row = world.inputs.subarray(0, world.layout.rawInputCount);
    return Array.from(row, (v, i) => (v === 0 ? i : -1)).filter((i) => i >= 0);
}

/**
 * @param {number[]} range `[from, to)`
 * @returns {number[]} the indices in between
 */
function span([from, to]) {
    return Array.from({ length: to - from }, (_, i) => from + i);
}

describe('inputRanges', () => {
    it.each([16, 24, 32])('puts every range where the body block is with %i rays', (rayCount) => {
        const config = { rayCount };
        expect(inputRanges(config)).toEqual(expectedRanges(rayCount));
    });
});

describe('applyControl', () => {
    const always = { trigger: () => true, delay: 2, length: 3 };

    it('zeroes only the ray block inside the blindfold window', () => {
        const world = onesWorld();
        const control = createControl(world.config, { name: CONTROL.BLINDFOLD, timing: always, blind: true });
        world.tick = 1;
        applyControl(world, 0, control);
        expect(zeroed(world)).toEqual([]);
        world.tick = 3;
        applyControl(world, 0, control);
        expect(zeroed(world)).toEqual(span([0, world.config.rayCount * RAY_CHANNELS]));
        expect(Array.from(world.hidden).every((v) => v === 1)).toBe(true);
    });

    it('opens the window delay ticks after the trigger and closes it after its length', () => {
        const world = onesWorld();
        const control = createControl(world.config, { name: CONTROL.BLINDFOLD, timing: always, blind: true });
        world.tick = 0;
        applyControl(world, 0, control);
        expect(control.state.start).toBe(2);
        expect(windowEnd(control)).toBe(5);
        world.inputs.fill(1);
        world.tick = 5;
        applyControl(world, 0, control);
        expect(zeroed(world)).toEqual([]);
    });

    it('also zeroes the scent and call inputs when the control says so', () => {
        const world = onesWorld({ rayCount: 24 });
        const control = createControl(world.config, {
            name: CONTROL.BLINDFOLD,
            timing: always,
            blind: true,
            scent: true,
        });
        world.tick = 0;
        applyControl(world, 0, control);
        world.inputs.fill(1);
        world.tick = 2;
        applyControl(world, 0, control);
        const { rays, scent } = expectedRanges(24);
        expect(zeroed(world)).toEqual([...span(rays), ...span(scent)]);
    });

    it('amnesia zeroes the hidden row and the memory pair, and nothing else', () => {
        const world = onesWorld({ rayCount: 24 });
        const control = createControl(world.config, { name: CONTROL.AMNESIA, amnesia: true });
        applyControl(world, 0, control);
        expect(zeroed(world)).toEqual(span(expectedRanges(24).memory));
        expect(Array.from(world.hidden.subarray(0, world.layout.hidden)).every((v) => v === 0)).toBe(true);
    });

    it('the kin control hides kin rays, the heard hunt call and the hunt scent, and nothing else', () => {
        const world = onesWorld();
        world.inputs.fill(0);
        const kinRay = 3 * RAY_CHANNELS;
        world.inputs.fill(1, kinRay, kinRay + RAY_CHANNELS);
        const otherRay = 5 * RAY_CHANNELS;
        world.inputs[otherRay] = 1;
        world.inputs.fill(1, expectedRanges(16).scent[0], expectedRanges(16).scent[1]);
        const control = createControl(world.config, { name: 'kin-blind', kinBlind: true });
        applyControl(world, 0, control);
        expect(world.inputs[kinRay]).toBe(0);
        expect(world.inputs[kinRay + CH_KIN]).toBe(0);
        expect(world.inputs[kinRay + 1]).toBe(1);
        expect(world.inputs[otherRay]).toBe(1);
        const { allies, scent } = expectedRanges(16);
        const hidden = allies.flatMap((range) => span(range));
        const left = span(scent).filter((i) => !hidden.includes(i));
        expect(left.every((i) => world.inputs[i] === 1)).toBe(true);
        expect(hidden.every((i) => world.inputs[i] === 0)).toBe(true);
    });

    it('leaves the world alone for the intact control', () => {
        const world = onesWorld();
        const control = createControl(world.config, { name: CONTROL.INTACT, timing: always });
        world.tick = 3;
        applyControl(world, 0, control);
        expect(zeroed(world)).toEqual([]);
    });
});
