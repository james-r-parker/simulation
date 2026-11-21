// The `huddled` pass (docs/designs/status-effects.md, "The social effects"): every 8 ticks each body holds one stack for each
// fed kin within `huddleRange` of its size.

import { describe, expect, it } from 'vitest';
import { ENERGY_SOURCE, addEnergy } from '../../js/sim/energy.js';
import { EFFECT, effectFactor } from '../../js/sim/effects.js';
import { HUDDLE_EVERY, huddlePass } from '../../js/sim/effect-huddle.js';
import { addAgent, rebuild, senseWorld } from './helpers/sense-world.js';

/**
 * @param {number[]} xs the x of each body, all siblings of one parent at y 500
 * @param {Record<string, any>} [over] config overrides
 * @returns {any} the world; each body holds a full store unless it is set otherwise
 */
function huddle(xs, over = {}) {
    const w = senseWorld({ huddleWarmth: 0.1, ...over });
    for (const x of xs) {
        const slot = addAgent(w, x, 500, 20);
        w.parentA[slot] = 900;
        addEnergy(w, slot, w.lanes.maxEnergy[slot], ENERGY_SOURCE.INITIAL);
        w.size[slot] = 20;
    }
    return w;
}

/**
 * @param {any} w the world
 * @returns {number[]} each body's stacks after a pass
 */
function pass(w) {
    huddlePass(w, rebuild(w));
    return [...w['effect.huddled.stacks'].subarray(0, w.population)];
}

describe('huddlePass', () => {
    it('gives each body one stack for each fed kin inside huddleRange x its size', () => {
        const w = huddle([500, 530, 560, 900]);
        // reach 40: 500 and 530 are neighbours, 530 and 560 too, 500 and 560 are 60 apart; 900 is alone.
        expect(pass(w)).toEqual([1, 2, 1, 0]);
    });

    it('searches nothing and holds no stack while huddleWarmth is 0', () => {
        const w = huddle([500, 520, 540], { huddleWarmth: 0 });
        expect(pass(w)).toEqual([0, 0, 0]);
        expect(w.events.count).toBe(0);
    });

    it('counts a body once however many cells its box covers', () => {
        const w = huddle([45, 75], { hashCellSize: 50 });
        expect(pass(w)).toEqual([1, 1]);
    });

    it('stops at 4 stacks', () => {
        const w = huddle([500, 510, 520, 530, 540, 550, 560]);
        expect(Math.max(...pass(w))).toBe(4);
    });

    it('gives nothing for a body that is not kin, not fed or out of range, and none to a dead slot', () => {
        const w = huddle([500, 520, 535]);
        w.parentA[1] = 0;
        expect(pass(w)).toEqual([1, 0, 1]);
        const hungry = huddle([500, 520]);
        hungry.energy[1] = hungry.lanes.maxEnergy[1] / 2;
        expect(pass(hungry)).toEqual([0, 1]);
        const far = huddle([500, 541]);
        expect(pass(far)).toEqual([0, 0]);
        const dead = huddle([500, 520]);
        dead.alive[1] = 0;
        expect(pass(dead)).toEqual([0, 0]);
    });

    it('recounts only on every eighth tick, lets stacks fall without a record, and logs each gain', () => {
        const w = huddle([500, 520, 540]);
        w.tick = 3;
        expect(pass(w)).toEqual([0, 0, 0]);
        w.tick = HUDDLE_EVERY;
        expect(pass(w)).toEqual([1, 2, 1]);
        expect(w.events.count).toBe(4);
        w.energy[2] = 1;
        w.tick = 2 * HUDDLE_EVERY;
        expect(pass(w)).toEqual([1, 1, 1]);
        expect(w.events.count).toBe(4);
    });

    it('cools a body less by huddleWarmth a stack', () => {
        const w = huddle([500, 520]);
        pass(w);
        expect(effectFactor(w, 0, EFFECT.HUDDLED, 'temperatureLossPassive')).toBeCloseTo(0.9, 12);
    });
});
