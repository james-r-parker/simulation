// The group reads against `liveOf`: a lane folded from the levels its group read once is the lane `liveOf` folds, to the
// bit, on every body of running worlds, at neutral numbers and with Phase 2 numbers and stacks on.

import { describe, expect, it } from 'vitest';
import { cloneWithNoisePolicy } from '../../js/sim/birth-policy.js';
import { createConfig } from '../../js/sim/config.js';
import { GROUP_LANES, compileGroups, readGroup } from '../../js/sim/effect-group.js';
import { LEVEL, LANE_ID } from '../../js/sim/effect-refs.js';
import { EFFECT, GROUP, SYSTEM, costFactors, liveIn, liveOf, motionFactors } from '../../js/sim/effects.js';
import { createWorld } from '../../js/sim/spawn.js';
import { step } from '../../js/sim/step.js';

/** Phase 2 numbers on, so the stored effects reach the motion and cost lanes. */
const ON = {
    woundThrust: 0.1,
    panicThrust: 0.2,
    panicBurn: 0.1,
    rallyThrust: 0.1,
    rallyBurn: 0.05,
    coldStackRate: 0.02,
};

/**
 * Reads each group of a slot and compares each of its lanes with `liveOf`, noting a lane that differs.
 * @param {any} world the world
 * @param {number} slot an alive slot
 * @param {string[]} differ where a lane that differs is noted
 * @returns {number} the lanes compared
 */
function compareSlot(world, slot, differ) {
    const read = [motionFactors, costFactors];
    let compared = 0;
    for (let group = 0; group < GROUP_LANES.length; group++) {
        read[group](world, slot);
        for (const lane of GROUP_LANES[group]) {
            if (liveIn(world, slot, group, lane) !== liveOf(world, slot, lane)) {
                differ.push(`lane ${lane} of slot ${slot} at tick ${world.tick}`);
            }
            compared += 1;
        }
    }
    return compared;
}

/**
 * @param {Record<string, any>} over config overrides
 * @returns {{compared: number, differ: string[]}} the lanes compared, and each that differs from `liveOf`
 */
function compareRun(over) {
    const policy = cloneWithNoisePolicy();
    const world = createWorld(createConfig({ seed: 9, initialAgents: 40, maxAgents: 60, ...over }), policy);
    let compared = 0;
    /** @type {string[]} */
    const differ = [];
    for (let t = 0; t < 80; t++) {
        step(world, policy);
        for (let slot = 0; slot < world.alive.length; slot++) {
            if (world.alive[slot] === 1) {
                world.effectStacks[SYSTEM.rowOf[EFFECT.PANICKED]][slot] = slot % 3;
                world.effectStacks[SYSTEM.rowOf[EFFECT.WOUNDED]][slot] = (slot + t) % 2;
                compared += compareSlot(world, slot, differ);
            }
        }
    }
    return { compared, differ };
}

describe('the group reads', () => {
    it('fold each lane of a group to the bits liveOf gives, at neutral numbers', () => {
        const { compared, differ } = compareRun({});
        expect(differ).toEqual([]);
        expect(compared).toBeGreaterThan(1000);
    });

    it('fold each lane of a group to the bits liveOf gives, with the stored effects on', () => {
        const { compared, differ } = compareRun(ON);
        expect(differ).toEqual([]);
        expect(compared).toBeGreaterThan(1000);
    });

    it('read each effect the active rules of the group name, the temperature ones by the band read', () => {
        const world = createWorld(
            createConfig({ seed: 9, initialAgents: 4, minAgents: 4, maxAgents: 8 }),
            cloneWithNoisePolicy(),
        );
        const motion = world.effectGroups[GROUP.MOTION];
        expect(Array.from(motion.effects)).toEqual([
            EFFECT.FAT,
            EFFECT.GRAZING,
            EFFECT.HANDLING,
            EFFECT.RESTING,
            EFFECT.SICK,
        ]);
        expect(Array.from(motion.band)).toEqual([EFFECT.COLD_BAND, EFFECT.HEAT_BAND, -1, -1, -1]);
        const cost = world.effectGroups[GROUP.COST];
        expect(Array.from(cost.effects)).toEqual([EFFECT.JUVENILE]);
        expect(Array.from(cost.band)).toEqual([-1, -1, EFFECT.COLD_RAMP, EFFECT.HOT_RAMP, -1]);
    });

    it('reads a group with no temperature effect without the band read', () => {
        const laneRules = [];
        laneRules[LANE_ID.maxTurn] = [{ effect: 0 }];
        const effectGroups = compileGroups([{ name: 'calm' }], laneRules);
        expect(effectGroups[GROUP.MOTION].banded).toBe(false);
        const world = { effectGroups, temperature: null };
        readGroup(
            () => {
                LEVEL[0] = 0.5;
            },
            world,
            0,
            GROUP.MOTION,
        );
        expect(effectGroups[GROUP.MOTION].levels[0]).toBe(0.5);
    });
});
