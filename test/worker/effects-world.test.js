import { describe, expect, it } from 'vitest';
import { EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { createEffectLog } from '../../js/worker/effects.js';
import { EFFECT_KIND, EFFECT_WORDS } from '../../js/worker/effect-ring.js';
import { addWorldEffect } from '../../js/worker/effects-world.js';
import { smallWorld } from '../sim/helpers/small-world.js';

/**
 * @param {any} world the world
 * @param {number} type an `EVENT_TYPE`
 * @param {number[]} fields the record's fields 2 and up
 * @returns {number} the event's offset
 */
function event(world, type, fields) {
    const o = pushEvent(world.events, type, world.tick);
    fields.forEach((value, i) => {
        world.events.data[o + 2 + i] = value;
    });
    return o;
}

/**
 * @param {any} log the log
 * @param {number} i the record
 * @returns {{kind: number, tick: number, x: number, y: number, words: number[]}} the record
 */
function record(log, i) {
    const o = ((log.start + i) % 512) * EFFECT_WORDS;
    return {
        kind: log.u32[o],
        tick: log.u32[o + 1],
        x: log.f32[o + 2],
        y: log.f32[o + 3],
        words: Array.from(log.u32.subarray(o + 4, o + 8)),
    };
}

describe('addWorldEffect', () => {
    it('places a herd death and a calf at the animal, with its group', () => {
        const world = smallWorld();
        world.tick = 40;
        world.herdX = new Float32Array(4);
        world.herdY = new Float32Array(4);
        world.herdX[2] = 100;
        world.herdY[2] = 200;
        const log = createEffectLog(world.config.maxAgents);
        expect(
            addWorldEffect(log, world, event(world, EVENT_TYPE.HERD_ANIMAL_DIED, [1, 2, 900, 3, 0]), undefined),
        ).toBe(true);
        expect(addWorldEffect(log, world, event(world, EVENT_TYPE.HERD_ANIMAL_BORN, [1, 2]), undefined)).toBe(true);
        expect(record(log, 0)).toEqual({ kind: EFFECT_KIND.HERD_DIED, tick: 40, x: 100, y: 200, words: [1, 2, 0, 0] });
        expect(record(log, 1).kind).toBe(EFFECT_KIND.CALF_BORN);
    });

    it('places a dung seeding at its point and a wilt at the patch, with the species and the hue', () => {
        const world = smallWorld();
        world.patchHue[4] = 1;
        world.patchX[4] = 30;
        world.patchY[4] = 60;
        const log = createEffectLog(world.config.maxAgents);
        addWorldEffect(log, world, event(world, EVENT_TYPE.HERD_SEEDED, [0, 2, 1, 4, 3, 11, 22]), undefined);
        addWorldEffect(log, world, event(world, EVENT_TYPE.PATCH_DIED, [4, 2]), undefined);
        expect(record(log, 0)).toMatchObject({ kind: EFFECT_KIND.DUNG_DROPPED, x: 11, y: 22, words: [3, 4, 4095, 0] });
        expect(record(log, 1)).toMatchObject({ kind: EFFECT_KIND.PATCH_WILTED, x: 30, y: 60, words: [2, 4095, 0, 0] });
    });

    it("marks a hunter's first kill at the killer, and not a later kill or a killer that is gone", () => {
        const world = smallWorld();
        world.alive[5] = 1;
        world.genomeId[5] = 77;
        world.x[5] = 9;
        world.y[5] = 8;
        world.spec[5] = 1;
        world.lineageId[5] = 3;
        const log = createEffectLog(world.config.maxAgents);
        const slots = new Map([[77, 5]]);
        addWorldEffect(log, world, event(world, EVENT_TYPE.HUNTER_KILL, [77, 500, 2, 0]), slots);
        addWorldEffect(log, world, event(world, EVENT_TYPE.HUNTER_KILL, [78, 500, 1, 0]), slots);
        expect(log.count).toBe(0);
        addWorldEffect(log, world, event(world, EVENT_TYPE.HUNTER_KILL, [77, 500, 1, 0]), slots);
        expect(record(log, 0)).toMatchObject({ kind: EFFECT_KIND.FIRST_KILL, x: 9, y: 8, words: [77, 1, 3, 0] });
    });

    it('leaves every other event to effects.js', () => {
        const world = smallWorld();
        const log = createEffectLog(world.config.maxAgents);
        expect(addWorldEffect(log, world, event(world, EVENT_TYPE.SEASON_CHANGED, [1, 0]), undefined)).toBe(false);
        expect(log.count).toBe(0);
    });
});
