// The status-effect detectors (status-effects.md, Detectors): the arithmetic of each metric on hand-staged worlds, and the
// names they report: effect_share.chilled, effect_share.wounded, effect_share.panicked, effect_share.shaken,
// effect_share.rallied, effect_share.answered, effect_share.hoarse, effect_share.alert, effect_share.huddled,
// effect_share.staggered, rally_bite_share, hoarse_call_share and huddle_cold_gain.

import { describe, expect, it } from 'vitest';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import {
    SHARED,
    createEffectsScene,
    effectsDetector,
    effectsMetrics,
    tickEffects,
} from '../../js/evo/scene-effects.js';
import { applyEffect } from '../../js/sim/effect-appliers.js';
import { EFFECT } from '../../js/sim/effects.js';
import { EVENT, EVENT_STRIDE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { allocBody } from '../sim/helpers/body.js';
import { smallWorld } from '../sim/helpers/small-world.js';

/**
 * @param {Record<string, any>} [over] config overrides
 * @param {number} [bodies] how many alive bodies
 * @returns {{w: any, scene: any, slots: number[]}} a world past burn-in with bodies, and an empty scene
 */
function stage(over = {}, bodies = 3) {
    const w = smallWorld({ maxAgents: 8, ...over });
    const slots = Array.from({ length: bodies }, () => allocBody(w, 0));
    for (const slot of slots) {
        w.alive[slot] = 1;
    }
    w.tick = BURN_IN_TICKS + 10;
    return { w, scene: createEffectsScene(w.config), slots };
}

/**
 * @param {any} scene the scene
 * @returns {Record<string, {value: number | null}>} its metrics, by name
 */
function metricsOf(scene) {
    return /** @type {any} */ (effectsMetrics(scene));
}

/**
 * Runs the handler the detector registers for an event on the record at the end of the ring.
 * @param {any} w the world
 * @param {any} scene the scene
 * @param {string} name an `EVENT_TYPE` name
 * @returns {void}
 */
function dispatchLast(w, scene, name) {
    const handlers = /** @type {Record<string, (...args: any[]) => void>} */ (effectsDetector.on);
    handlers[name](scene, w, (w.events.count - 1) * EVENT_STRIDE, {});
}

describe('effect_share', () => {
    it('is the share of alive agent-ticks with a stack, for each stored effect, and none before any tick', () => {
        const { w, scene, slots } = stage();
        expect(metricsOf(scene)['eval.effect_share.chilled'].value).toBeNull();
        w['effect.chilled.stacks'][slots[0]] = 2;
        w['effect.hoarse.stacks'][slots[0]] = 1;
        w['effect.hoarse.stacks'][slots[1]] = 1;
        tickEffects(scene, w);
        tickEffects(scene, w);
        const m = metricsOf(scene);
        expect(m['eval.effect_share.chilled'].value).toBeCloseTo(1 / 3, 12);
        expect(m['eval.effect_share.hoarse'].value).toBeCloseTo(2 / 3, 12);
        expect(m['eval.effect_share.huddled'].value).toBe(0);
        for (const name of SHARED) {
            expect(m).toHaveProperty(`eval.effect_share.${name}`);
        }
    });

    it('counts nothing before burn-in or for a dead slot', () => {
        const { w, scene, slots } = stage();
        w['effect.alert.stacks'][slots[0]] = 1;
        w.alive[slots[1]] = 0;
        w.tick = BURN_IN_TICKS - 1;
        tickEffects(scene, w);
        expect(scene.ticks).toBe(0);
        w.tick = BURN_IN_TICKS;
        tickEffects(scene, w);
        expect(scene.ticks).toBe(2);
        expect(metricsOf(scene)['eval.effect_share.alert'].value).toBe(0.5);
    });
});

describe('rally_bite_share', () => {
    /**
     * @param {any} w the world
     * @param {any} scene the scene
     * @param {number} slot the hunter that is rallied
     * @returns {void}
     */
    function rally(w, scene, slot) {
        applyEffect(w, slot, EFFECT.RALLIED, 0);
        dispatchLast(w, scene, 'EFFECT_APPLIED');
    }

    it('is the share of resolved rally stacks followed by a bite: a bite counts, rallyTicks without one is a miss', () => {
        const { w, scene, slots } = stage({ rallyTicks: 5 });
        expect(metricsOf(scene)['eval.rally_bite_share'].value).toBeNull();
        rally(w, scene, slots[0]);
        rally(w, scene, slots[1]);
        w.ledgerBiteGain[slots[0]] += 3;
        tickEffects(scene, w);
        expect([scene.rallyBit, scene.rallyDone, scene.pending]).toEqual([1, 1, 1]);
        w.tick += 5;
        tickEffects(scene, w);
        expect([scene.rallyBit, scene.rallyDone, scene.pending]).toEqual([1, 2, 0]);
        expect(metricsOf(scene)['eval.rally_bite_share'].value).toBe(0.5);
    });

    it('drops a stack whose hunter is gone or replaced, and ignores other effects, a full list and the burn-in', () => {
        const { w, scene, slots } = stage();
        rally(w, scene, slots[0]);
        rally(w, scene, slots[1]);
        w.alive[slots[0]] = 0;
        w.genomeId[slots[1]] += 1;
        tickEffects(scene, w);
        expect([scene.rallyDone, scene.pending]).toEqual([0, 0]);
        applyEffect(w, slots[2], EFFECT.WOUNDED, 0);
        dispatchLast(w, scene, 'EFFECT_APPLIED');
        scene.pending = scene.pendSlot.length;
        rally(w, scene, slots[2]);
        expect(scene.pending).toBe(scene.pendSlot.length);
        w.tick = 3;
        scene.pending = 0;
        rally(w, scene, slots[2]);
        expect(scene.pending).toBe(0);
    });
});

describe('hoarse_call_share', () => {
    /**
     * @param {any} w the world
     * @param {any} scene the scene
     * @param {string} name `ALARM_CALLED` or `PACK_CALLED`
     * @param {number} slot the caller
     * @returns {void}
     */
    function call(w, scene, name, slot) {
        const o = pushEvent(w.events, EVENT_TYPE[name], w.tick);
        w.events.data[o + EVENT[name].SLOT] = slot;
        dispatchLast(w, scene, name);
    }

    it('is the share of calls made by a caller holding 3 or more hoarse stacks, alarms and hunt calls alike', () => {
        const { w, scene, slots } = stage();
        expect(metricsOf(scene)['eval.hoarse_call_share'].value).toBeNull();
        w['effect.hoarse.stacks'][slots[0]] = 3;
        w['effect.hoarse.stacks'][slots[1]] = 2;
        call(w, scene, 'ALARM_CALLED', slots[0]);
        call(w, scene, 'PACK_CALLED', slots[0]);
        call(w, scene, 'PACK_CALLED', slots[1]);
        call(w, scene, 'ALARM_CALLED', slots[2]);
        expect(metricsOf(scene)['eval.hoarse_call_share'].value).toBe(0.5);
        w.tick = 1;
        call(w, scene, 'ALARM_CALLED', slots[0]);
        expect(scene.calls).toBe(4);
    });
});

describe('huddle_cold_gain', () => {
    it('is the passive loss of huddled bodies over that of lone bodies in the same cold band, weighted by huddled ticks', () => {
        const { w, scene, slots } = stage({ huddleWarmth: 0.1 }, 4);
        expect(metricsOf(scene)['eval.huddle_cold_gain'].value).toBeNull();
        for (const slot of slots) {
            w.temperature[slot] = 50;
        }
        w['effect.huddled.stacks'][slots[0]] = 2;
        w['effect.huddled.stacks'][slots[1]] = 1;
        tickEffects(scene, w);
        const m = metricsOf(scene)['eval.huddle_cold_gain'].value;
        expect(m).toBeCloseTo((0.8 + 0.9) / 2, 12);
    });

    it('skips a band with no lone body or no loss, and reads each band apart', () => {
        const { w, scene, slots } = stage({ huddleWarmth: 0.1 }, 4);
        w.temperature[slots[0]] = 50;
        w.temperature[slots[1]] = 50;
        w.temperature[slots[2]] = 0;
        w.temperature[slots[3]] = 0;
        w['effect.huddled.stacks'][slots[0]] = 1;
        w['effect.huddled.stacks'][slots[2]] = 1;
        w.lanes.temperatureLossPassive[slots[3]] = 0;
        tickEffects(scene, w);
        expect(metricsOf(scene)['eval.huddle_cold_gain'].value).toBeCloseTo(0.9, 12);
    });
});

describe('effectsDetector', () => {
    it('names its module and source test, and builds a scene from the config', () => {
        expect(effectsDetector.modules).toEqual(['js/evo/scene-effects.js']);
        expect(effectsDetector.sourceTest).toBe('test/evo/scene-effects.test.js');
        const { w } = stage();
        const scene = effectsDetector.create(w.config, { runTicks: 0 });
        expect(scene.rallyTicks).toBe(w.config.rallyTicks);
        expect(Object.keys(effectsDetector.metrics(scene, w, {}))).toHaveLength(SHARED.length + 3);
    });
});
