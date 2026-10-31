import { describe, expect, it } from 'vitest';
import {
    ACTIVITY_SAMPLE_TICKS,
    RARE_MIN_SAMPLES,
    activityTable,
    createInputActivity,
    meanActiveShare,
    sampleInputActivity,
} from '../../js/sim/input-activity.js';
import { BURN_IN_TICKS } from '../../js/sim/burn-in.js';
import { step } from '../../js/sim/step.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

/**
 * @param {number} alive agents to add
 * @returns {{world: any, activity: any, n: number}} a world at the first sample tick after burn-in
 */
function setup(alive) {
    const world = lifeWorld({ brainHidden: 2, maxAgents: 8 });
    for (let i = 0; i < alive; i++) {
        addBlob(world);
    }
    world.tick = BURN_IN_TICKS;
    const activity = createInputActivity(world.layout);
    return { world, activity, n: world.layout.inputCount };
}

describe('sampleInputActivity', () => {
    it('keeps the two hue values in the 83-input mask and marks an absent hue rare', () => {
        const { world, activity, n } = setup(1);
        expect(n).toBe(83);
        expect(activity.rare).toHaveLength(83);
        activity.samples = RARE_MIN_SAMPLES;
        activity.active[48] = RARE_MIN_SAMPLES;
        world.pooled[48] = 0.5;
        sampleInputActivity(activity, world);
        expect(activity.rare[48]).toBe(0);
        expect(activity.rare[49]).toBe(1);
    });

    it('counts the nonzero values of each alive agent pooled row, and the samples', () => {
        const { world, activity, n } = setup(2);
        world.pooled[3] = 0.5;
        world.pooled[n + 3] = -1;
        world.pooled[n + 7] = 2;
        sampleInputActivity(activity, world);
        expect(activity.samples).toBe(2);
        expect(activity.active[3]).toBe(2);
        expect(activity.active[7]).toBe(1);
        expect(activityTable(activity)?.[3]).toBe(1);
        expect(activityTable(activity)?.[7]).toBe(0.5);
        expect(meanActiveShare(activity)).toBe(3 / (2 * n));
    });

    it('does not sample before burn-in or off the 16-tick grid, and ignores dead slots', () => {
        const { world, activity } = setup(1);
        world.pooled[0] = 1;
        world.tick = BURN_IN_TICKS - ACTIVITY_SAMPLE_TICKS;
        sampleInputActivity(activity, world);
        world.tick = BURN_IN_TICKS + 1;
        sampleInputActivity(activity, world);
        expect(activity.samples).toBe(0);
        expect(activityTable(activity)).toBeNull();
        expect(meanActiveShare(activity)).toBeNull();
    });

    it('has no rare input before 10000 agent-samples, then marks those under 1 percent', () => {
        const { world, activity, n } = setup(4);
        for (let i = 0; i < n; i++) {
            world.pooled[i] = 1;
            world.pooled[n + i] = 1;
        }
        world.pooled[5] = 0;
        world.pooled[n + 5] = 0;
        world.pooled[2 * n + 5] = 0;
        world.pooled[3 * n + 5] = 0;
        let ticks = 0;
        while (activity.samples < RARE_MIN_SAMPLES) {
            expect(activity.rareCount).toBe(0);
            world.tick = BURN_IN_TICKS + ticks++ * ACTIVITY_SAMPLE_TICKS;
            sampleInputActivity(activity, world);
        }
        expect(activity.rareCount).toBe(
            activity.rare.reduce((/** @type {number} */ s, /** @type {number} */ v) => s + v, 0),
        );
        expect(activity.rare[5]).toBe(1);
        expect(activity.rare[4]).toBe(0);
        expect(Array.from(activity.rareIdx.subarray(0, activity.rareCount))).toContain(5);
    });
});

describe('the world state', () => {
    /**
     * @param {Record<string, any>} over config overrides
     * @returns {any} a one-agent world one tick before the first sample tick
     */
    function stepped(over) {
        const world = lifeWorld({ brainHidden: 2, maxAgents: 8, ...over });
        addBlob(world);
        world.tick = BURN_IN_TICKS;
        return world;
    }

    it('is filled by step on a sample tick after burn-in, from the pooled row of the alive agents', () => {
        const world = stepped({});
        step(world, recordingPolicy([]));
        expect(world.inputActivity.samples).toBe(1);
        expect(world.inputActivity.active.length).toBe(world.layout.inputCount);
        const before = world.inputActivity.samples;
        step(world, recordingPolicy([])); // tick BURN_IN_TICKS + 1 is not a sample tick
        expect(world.inputActivity.samples).toBe(before);
    });

    it('takes no sample before burn-in', () => {
        const world = stepped({});
        world.tick = BURN_IN_TICKS - ACTIVITY_SAMPLE_TICKS;
        step(world, recordingPolicy([]));
        expect(world.inputActivity.samples).toBe(0);
    });

    it('is in the world hash only when weightDecay is above 0', () => {
        const off = stepped({ weightDecay: 0 });
        const on = stepped({ weightDecay: 0.005 });
        const offHash = hashWorld(off);
        const onHash = hashWorld(on);
        off.inputActivity.active[0] += 1;
        on.inputActivity.active[0] += 1;
        on.inputActivity.samples += 1;
        expect(hashWorld(off)).toBe(offHash);
        expect(hashWorld(on)).not.toBe(onHash);
        const again = hashWorld(on);
        on.inputActivity.samples -= 1;
        expect(hashWorld(on)).not.toBe(again);
    });

    it('is deterministic: two identical worlds hold identical counts', () => {
        const a = stepped({ weightDecay: 0.005 });
        const b = stepped({ weightDecay: 0.005 });
        for (let t = 0; t < 40; t++) {
            step(a, recordingPolicy([]));
            step(b, recordingPolicy([]));
        }
        expect(a.inputActivity.samples).toBeGreaterThan(0);
        expect(Array.from(a.inputActivity.active)).toEqual(Array.from(b.inputActivity.active));
        expect(hashWorld(a)).toBe(hashWorld(b));
    });
});
