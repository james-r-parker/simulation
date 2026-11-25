// reads: evals/role-budget/step5-d.json
// The cheats of the social effects, checked on the finalist's numbers (docs/designs/status-effects.md, T17): each test is a
// scripted body that tries to make a call, a rally or a huddle pay without the thing the effect stands for, and asserts
// that it does not. `step5-d.json` (T15) chooses `rallyThrust`, `rallyBurn`, the stagger and the cold stack; the numbers
// it leaves off (`hoarseFactor`, `answeredBite`, `alertBoost`, `huddleWarmth`) are switched on below, since a cheat on a
// number that is off proves nothing.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OUTPUT_INDEX, CH_THREAT } from '../../js/sim/brain-layout.js';
import { ENERGY_SOURCE, addEnergy, applyCosts, tickCost } from '../../js/sim/energy.js';
import { applyEffect } from '../../js/sim/effect-appliers.js';
import { huddlePass } from '../../js/sim/effect-huddle.js';
import { EFFECT, effectFactor, fadeEffects } from '../../js/sim/effects.js';
import { FORAGER, feedPairs } from './helpers/bite-stage.js';
import { addAgent, rebuild, senseWorld } from './helpers/sense-world.js';
import { chase, hold, pack, shareKill, stacks, tick } from './helpers/pack-stage.js';

/** The finalist of T15, which the adoption (T18) makes the defaults. */
const FINALIST = JSON.parse(readFileSync('evals/role-budget/step5-d.json', 'utf8'));

/** The pack numbers the finalist leaves off, on at the values the effect tests use. */
const SOCIAL = { hoarseFactor: 2, answeredBite: 0.5, alertBoost: 0.3, huddleWarmth: 0.1 };

/** The config of every scripted body: the call numbers of the pack stage, the finalist, then the social numbers. */
const NUMBERS = { ...FINALIST, ...SOCIAL };

describe('the finalist numbers', () => {
    it('hold the rally and the cold stack the cheat tests below depend on', () => {
        expect([FINALIST.rallyThrust, FINALIST.rallyBurn, FINALIST.coldStackRate]).toEqual([0.1, 4, 0.5]);
    });
});

describe('two hunters that only call at each other', () => {
    /**
     * @param {boolean} calling whether both hold HUNT
     * @returns {any} a kin pair that ran 30 ticks of the signal phase, then one tick of cost
     */
    function run(calling) {
        const w = pack(NUMBERS);
        if (calling) {
            hold(w, 0, OUTPUT_INDEX.HUNT);
            hold(w, 1, OUTPUT_INDEX.HUNT);
        }
        for (let t = 0; t < 30; t++) {
            tick(w);
        }
        return w;
    }

    it('gain no answered stack and add no hoarse stack, since each call is heard', () => {
        const w = run(true);
        expect([stacks(w, 0, 'rallied'), stacks(w, 1, 'rallied')].every((n) => n > 0)).toBe(true);
        expect([stacks(w, 0, 'answered'), stacks(w, 1, 'answered')]).toEqual([0, 0]);
        expect([stacks(w, 0, 'hoarse'), stacks(w, 1, 'hoarse')]).toEqual([0, 0]);
    });

    it('lose energy to the rallied burn relative to two silent hunters', () => {
        const calling = run(true);
        const silent = run(false);
        for (const slot of [0, 1]) {
            const burn = effectFactor(calling, slot, EFFECT.RALLIED, 'passiveLoss');
            expect(burn).toBeGreaterThan(1);
            expect(effectFactor(silent, slot, EFFECT.RALLIED, 'passiveLoss')).toBe(1);
            expect(tickCost(calling, slot)).toBeGreaterThan(tickCost(silent, slot));
            expect(calling.energy[slot]).toBeLessThan(silent.energy[slot]);
        }
    });
});

describe('a hunter that stands by while its pack-mate kills', () => {
    it('gains no answered stack, keeps its hoarse stacks and bites no harder', () => {
        const { w, caller, killer, prey } = chase({ ...NUMBERS, hashCellSize: 600 });
        feedPairs(w, [killer, prey]);
        w.tick += 1;
        feedPairs(w, [killer, prey]);
        expect(w.energy[prey]).toBe(0);
        expect(stacks(w, caller, 'answered')).toBe(0);
        expect(stacks(w, caller, 'hoarse')).toBe(2);
        expect(effectFactor(w, caller, EFFECT.ANSWERED, 'biteEnergy')).toBe(1);
    });

    it('is the control: a caller that bit the prey first is answered at the same numbers', () => {
        const staged = chase({ ...NUMBERS, hashCellSize: 600 });
        shareKill(staged.w, staged);
        expect(stacks(staged.w, staged.caller, 'answered')).toBe(1);
    });
});

describe('a body that calls alone', () => {
    it('reaches 5 hoarse stacks, the cap', () => {
        const w = pack({ ...NUMBERS, huntCallCost: 1 });
        w.parentA[1] = 0;
        w.energy[0] = 100000;
        hold(w, 0, OUTPUT_INDEX.HUNT);
        for (let t = 0; t < 80; t++) {
            tick(w);
        }
        expect(stacks(w, 0, 'hoarse')).toBe(5);
        expect(stacks(w, 1, 'rallied')).toBe(0);
    });
});

/**
 * @param {boolean} threat whether the caller has a threat in view
 * @returns {any} a forager that holds ALARM (slot 0) and a forager listener 100 away (slot 1), not yet ticked
 */
function alarmed(threat) {
    const w = pack(NUMBERS);
    w.spec[0] = FORAGER;
    w.spec[1] = FORAGER;
    w.parentA[1] = 0;
    w.energy[0] = 100000;
    hold(w, 0, OUTPUT_INDEX.ALARM);
    w.inputs[CH_THREAT] = threat ? 1 : 0;
    return w;
}

describe('a body that holds ALARM with no threat in view', () => {
    it('reaches maxStacks and pays the geometric cost, doubling to the cap', () => {
        const w = alarmed(false);
        const base = w.config.alarmCost;
        const paid = [];
        let before = w.energy[0];
        for (let t = 0; t < 80; t++) {
            tick(w);
            if (w.energy[0] < before) {
                paid.push(before - w.energy[0]);
            }
            before = w.energy[0];
        }
        expect(stacks(w, 0, 'hoarse')).toBe(5);
        expect(paid.slice(0, 7)).toEqual([1, 2, 4, 8, 16, 32, 32].map((n) => n * base));
    });

    it('alerts nobody, while the same alarm with a threat in view alerts its listener', () => {
        const quiet = alarmed(false);
        for (let t = 0; t < 30; t++) {
            tick(quiet);
        }
        expect(stacks(quiet, 1, 'alert')).toBe(0);
        const real = alarmed(true);
        tick(real);
        expect(stacks(real, 1, 'alert')).toBe(1);
    });
});

/**
 * Runs the cost phase and the fade pass for `ticks` ticks, with nobody moving.
 * @param {any} w the world
 * @param {number} ticks how many ticks
 * @returns {void}
 */
function sit(w, ticks) {
    for (let t = 0; t < ticks; t++) {
        applyCosts(w);
        fadeEffects(w);
        w.tick += 1;
    }
}

describe('a rallied hunter that never closes', () => {
    it('ends below an unrallied one, over the whole rally', () => {
        const w = pack(NUMBERS);
        applyEffect(w, 0, EFFECT.RALLIED, 1);
        expect(w['effect.rallied.stacks'][0]).toBe(1);
        sit(w, w.config.rallyTicks);
        expect(w['effect.rallied.stacks'][0]).toBe(0);
        expect(w.energy[0]).toBeLessThan(w.energy[1]);
        expect([w.x[0], w.x[1]]).toEqual([500, 600]);
    });
});

/**
 * @param {number} bodies how many kin sit in a row, 10 apart
 * @returns {any} a world of fed siblings with a small store, in the cold
 */
function sitters(bodies) {
    const w = senseWorld(NUMBERS);
    for (let i = 0; i < bodies; i++) {
        const slot = addAgent(w, 500 + i * 10, 500, 20);
        w.parentA[slot] = 900;
        w.size[slot] = 20;
        w.temperature[slot] = w.lanes.temperatureOptimalMin[slot];
        w.lanes.maxEnergy[slot] = 40;
        addEnergy(w, slot, 40, ENERGY_SOURCE.INITIAL);
    }
    return w;
}

/**
 * @param {any} w a world of sitters
 * @returns {number[]} the tick each body's energy reached 0, 0 for one that never did
 */
function deaths(w) {
    const died = new Array(w.population).fill(0);
    for (let t = 1; t <= 20000 && died.includes(0); t++) {
        huddlePass(w, rebuild(w));
        sit(w, 1);
        w.energy.forEach((e, slot) => {
            if (slot < died.length && died[slot] === 0 && e <= 0) {
                died[slot] = t;
            }
        });
    }
    return died;
}

describe('a huddle of bodies that never move', () => {
    it('dies no later than a lone sitter by more than a tenth', () => {
        const [lone] = deaths(sitters(1));
        const warm = sitters(4);
        huddlePass(warm, rebuild(warm));
        expect(Math.max(...warm['effect.huddled.stacks'].subarray(0, 4))).toBeGreaterThan(0); // the huddle is on
        const group = deaths(sitters(4));
        const mean = group.reduce((a, b) => a + b, 0) / group.length;
        expect(lone).toBeGreaterThan(0);
        expect(group.every((t) => t > 0)).toBe(true);
        expect(mean).toBeLessThanOrEqual(lone * 1.1);
    });
});
