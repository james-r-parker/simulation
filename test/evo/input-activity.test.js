import { describe, expect, it } from 'vitest';
import {
    ACTIVITY_SAMPLE_TICKS,
    RARE_MIN_SAMPLES,
    activityTable,
    createInputActivity,
    meanActiveShare,
    sampleInputActivity,
} from '../../js/evo/input-activity.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

/**
 * @param {number} alive agents to add
 * @returns {{world: any, activity: any, n: number}} a world at the first sample tick after burn-in
 */
function setup(alive) {
    const { world } = observed({ brainHidden: 2, maxAgents: 8 });
    for (let i = 0; i < alive; i++) {
        addBlob(world);
    }
    world.tick = BURN_IN_TICKS;
    const activity = createInputActivity(world.layout);
    return { world, activity, n: world.layout.inputCount };
}

describe('sampleInputActivity', () => {
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
        expect(activity.rareCount).toBe(activity.rare.reduce((s, v) => s + v, 0));
        expect(activity.rare[5]).toBe(1);
        expect(activity.rare[4]).toBe(0);
        expect(Array.from(activity.rareIdx.subarray(0, activity.rareCount))).toContain(5);
    });
});
