import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { createInputActivity } from '../../js/sim/input-activity.js';
import {
    SATURATION_TICKS,
    createSaturation,
    resetSaturationSlot,
    sampleSaturation,
} from '../../js/evo/rare-saturation.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const H = 4;

/**
 * @returns {{world: any, state: any, activity: any, slot: number, step: (hidden: number[], fire?: boolean) => void}} an
 *   agent whose input 2 is rare, and a helper that advances one 4-tick sample with the given hidden row
 */
function setup() {
    const { world } = observed({ brainHidden: H, maxAgents: 8 });
    const slot = addBlob(world);
    const state = createSaturation(world.config, world.layout);
    const activity = createInputActivity(world.layout);
    activity.rare[2] = 1;
    activity.rareIdx[0] = 2;
    activity.rareCount = 1;
    world.tick = BURN_IN_TICKS - SATURATION_TICKS;
    const step = (/** @type {number[]} */ hidden, fire = false) => {
        world.tick += SATURATION_TICKS;
        world.hidden.set(hidden, slot * H);
        world.pooled[slot * world.layout.inputCount + 2] = fire ? 1 : 0;
        sampleSaturation(state, { activity, world });
    };
    return { world, state, activity, slot, step };
}

describe('sampleSaturation', () => {
    it('credits a first firing with the saturated share at the next sample minus the one before it', () => {
        const { state, step } = setup();
        step([0, 0, 0, 0]); // k - 1: share 0
        step([1, 0, 0, 0], true); // k: the firing, share 0.25
        expect(state.events).toBe(0);
        step([1, -1, 1, 0]); // k + 1: share 0.75
        expect(state.events).toBe(1);
        expect(state.jumpSum).toBeCloseTo(0.75, 12);
    });

    it('counts an input once per life, however often it fires', () => {
        const { state, step } = setup();
        step([0, 0, 0, 0]);
        step([0, 0, 0, 0], true);
        step([1, 1, 1, 1], true);
        step([1, 1, 1, 1], true);
        step([1, 1, 1, 1]);
        expect(state.events).toBe(1);
    });

    it('credits two rare inputs that first fire at the same sample against the same earlier share', () => {
        const { world, state, activity, slot, step } = setup();
        activity.rare[3] = 1;
        activity.rareIdx[1] = 3;
        activity.rareCount = 2;
        step([0, 0, 0, 0]); // share 0
        world.pooled[slot * world.layout.inputCount + 3] = 1;
        step([1, 0, 0, 0], true); // both fire; share 0.25
        step([1, -1, 1, 0]); // share 0.75
        expect(state.events).toBe(2);
        expect(state.jumpSum).toBeCloseTo(1.5, 12);
    });

    it('does not count a firing with no earlier sample of the life, nor an input that is not rare', () => {
        const first = setup();
        first.step([0, 0, 0, 0], true);
        first.step([1, 1, 1, 1]);
        expect(first.state.events).toBe(0);
        const other = setup();
        other.activity.rareCount = 0;
        other.step([0, 0, 0, 0]);
        other.step([0, 0, 0, 0], true);
        other.step([1, 1, 1, 1]);
        expect(other.state.events).toBe(0);
    });

    it('starts a reused slot afresh, and takes no sample before burn-in', () => {
        const { world, state, slot, step } = setup();
        step([0, 0, 0, 0]);
        step([0, 0, 0, 0], true);
        resetSaturationSlot(state, slot);
        step([1, 1, 1, 1]);
        expect(state.events).toBe(0);
        expect(state.lastShare[slot]).not.toBeNaN();
        resetSaturationSlot(state, slot);
        expect(state.lastShare[slot]).toBeNaN();
        expect(state.fired[slot * world.layout.inputCount + 2]).toBe(0);
        world.tick = 100;
        world.pooled[slot * world.layout.inputCount + 2] = 1;
        sampleSaturation(state, { activity: createInputActivity(world.layout), world });
        expect(state.lastShare[slot]).toBeNaN();
    });
});
