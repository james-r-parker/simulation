import { describe, expect, it } from 'vitest';
import { RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import {
    CLOSING_MIN,
    ESCAPE_TICKS,
    FLEE_SPEED,
    INTENT_WINDOW,
    RESPONSE_WINDOW,
    biteDeliberate,
    mealDeliberate,
    noteMeritBite,
    resolveEscape,
    slotOfGenome,
    trackMerit,
} from '../../js/sim/merit-state.js';
import { advancePregnancies, splitAll } from '../../js/sim/reproduction.js';
import { allocAgent, freeAgent } from '../../js/sim/world.js';
import { hashWorld } from '../../js/sim/world-hash.js';
import { addBlob, lifeWorld, recordingPolicy } from './helpers/life-world.js';

const CH_FOOD = 1;
const CH_THREAT = 2;
const CH_PREY = 3;
const NEVER = -Infinity;

/** @returns {any} a 16-ray arena with the default bite arc */
function arena() {
    return lifeWorld({ rayCount: 16, biteArc: Math.PI / 4, maxAgents: 8 });
}

/**
 * Adds an agent that is past its birth tick.
 * @param {any} w the world
 * @returns {number} the slot
 */
function adult(w) {
    const slot = addBlob(w);
    w.ageTicks[slot] = 1;
    return slot;
}

/**
 * Shows the agent one hit on ray `k`, or clears its rays when `channel` is 0.
 * @param {any} w the world
 * @param {number} slot the agent
 * @param {number} k the ray
 * @param {number} channel the class channel
 * @returns {void}
 */
function setRay(w, slot, k, channel) {
    const base = slot * w.layout.inputCount;
    w.inputs.fill(0, base, base + w.config.rayCount * RAY_CHANNELS);
    if (channel > 0) {
        w.inputs[base + k * RAY_CHANNELS] = 0.5;
        w.inputs[base + k * RAY_CHANNELS + channel] = channel === CH_FOOD ? 1 : 0.5;
    }
}

/**
 * Runs `count` ticks with the hit on ray `k` and the agent moving along it at `speed` x `maxVelocity`.
 * @param {any} w the world
 * @param {{slot: number, k: number, channel: number, count: number, speed?: number}} f the run
 * @returns {void}
 */
function approach(w, { slot, k, channel, count, speed = 0.5 }) {
    const theta = (2 * Math.PI * k) / w.config.rayCount;
    for (let i = 0; i < count; i++) {
        w.tick += 1;
        setRay(w, slot, k, channel);
        w.vx[slot] = speed * w.config.maxVelocity * Math.cos(theta);
        w.vy[slot] = speed * w.config.maxVelocity * Math.sin(theta);
        trackMerit(w, slot);
    }
}

describe('merit arrays', () => {
    it('start as a fresh slot holds them and reset when a slot is reused', () => {
        const w = arena();
        const slot = allocAgent(w);
        expect([w.merit[slot], w.deliberateIntake[slot], w.meritStamp[slot]]).toEqual([0, 0, 0]);
        expect([w.parentSlotA[slot], w.parentSlotB[slot]]).toEqual([-1, -1]);
        expect([w.meritFoodSeen[slot], w.meritPreyStart[slot]]).toEqual([NEVER, NEVER]);
        w.merit[slot] = 5;
        w.meritFoodBits[slot] = 7;
        w.meritFoodSeen[slot] = 9;
        w.biteOpen[slot] = 1;
        w.parentSlotA[slot] = 3;
        freeAgent(w, slot);
        expect(allocAgent(w)).toBe(slot);
        expect([w.merit[slot], w.meritFoodBits[slot], w.biteOpen[slot]]).toEqual([0, 0, 0]);
        expect([w.meritFoodSeen[slot], w.parentSlotA[slot]]).toEqual([NEVER, -1]);
    });

    it('are not hashed yet: setting them leaves hashWorld unchanged', () => {
        const w = arena();
        const slot = adult(w);
        const before = hashWorld(w);
        w.merit[slot] = 12;
        w.deliberateIntake[slot] = 3;
        w.parentSlotA[slot] = 2;
        w.meritFoodSeen[slot] = 4;
        w.biteOpen[slot] = 1;
        expect(hashWorld(w)).toBe(before);
    });
});

describe('parent slots', () => {
    it('are the splitter twice for a split', () => {
        const w = lifeWorld();
        const a = addBlob(w, { energy: 1700, spec: 2 });
        splitAll(w, recordingPolicy([]));
        expect([w.parentSlotA[1], w.parentSlotB[1]]).toEqual([a, a]);
    });

    it('are the mother and the living father for a mating birth, and -1 for a dead father', () => {
        const w = lifeWorld();
        const father = addBlob(w, { energy: 500 });
        const mother = addBlob(w, { energy: 900, pregnancy: 1, fatherId: w.genomeId[father] });
        advancePregnancies(w, recordingPolicy([]));
        expect([w.parentSlotA[2], w.parentSlotB[2]]).toEqual([mother, father]);
        expect(slotOfGenome(w, w.parentB[2])).toBe(father);
        expect(slotOfGenome(w, 0)).toBe(-1);
        freeAgent(w, father);
        w.pregnancy[mother] = 1;
        w.energy[mother] = 900;
        advancePregnancies(w, recordingPolicy([]));
        expect([w.parentSlotA[father], w.parentSlotB[father]]).toEqual([mother, -1]);
    });
});

describe('the food tracker', () => {
    it('is deliberate after CLOSING_MIN closing ticks straight ahead, and not after one fewer', () => {
        const six = arena();
        const a = adult(six);
        approach(six, { slot: a, k: 0, channel: CH_FOOD, count: CLOSING_MIN });
        expect(mealDeliberate(six, a)).toBe(true);
        const five = arena();
        const b = adult(five);
        approach(five, { slot: b, k: 0, channel: CH_FOOD, count: CLOSING_MIN - 1 });
        expect(mealDeliberate(five, b)).toBe(false);
    });

    it('is not deliberate when the sighting is older than INTENT_WINDOW', () => {
        const w = arena();
        const slot = adult(w);
        approach(w, { slot, k: 0, channel: CH_FOOD, count: 8 });
        expect(mealDeliberate(w, slot)).toBe(true);
        w.tick += INTENT_WINDOW;
        expect(mealDeliberate(w, slot)).toBe(true);
        w.tick += 1;
        expect(mealDeliberate(w, slot)).toBe(false);
    });

    it('needs a turn towards the target when it was seen off the dead-ahead ray', () => {
        const w = arena();
        const slot = adult(w);
        approach(w, { slot, k: 2, channel: CH_FOOD, count: 8 });
        expect(mealDeliberate(w, slot)).toBe(false);
        w.turnRate[slot] = w.config.maxTurn;
        approach(w, { slot, k: 2, channel: CH_FOOD, count: 1 });
        expect(mealDeliberate(w, slot)).toBe(true);
    });

    it('loses its closing history when the agent turns away from the food', () => {
        const w = arena();
        const slot = adult(w);
        approach(w, { slot, k: 0, channel: CH_FOOD, count: 8 });
        w.turnRate[slot] = -w.config.maxTurn;
        approach(w, { slot, k: 1, channel: CH_FOOD, count: 1 });
        expect(w.meritFoodBits[slot]).toBe(0);
        expect(mealDeliberate(w, slot)).toBe(false);
    });

    it('does not count a tick that is not closing', () => {
        const w = arena();
        const slot = adult(w);
        approach(w, { slot, k: 0, channel: CH_FOOD, count: 20, speed: 0.2 });
        expect(mealDeliberate(w, slot)).toBe(false);
    });

    it('skips a slot born this tick (ageTicks 0)', () => {
        const w = arena();
        const slot = adult(w);
        w.ageTicks[slot] = 0;
        approach(w, { slot, k: 0, channel: CH_FOOD, count: 8 });
        expect(w.meritFoodSeen[slot]).toBe(NEVER);
        expect(w.meritFoodBits[slot]).toBe(0);
    });
});

describe('the prey tracker', () => {
    it('follows prey on an arc ray, kept apart from the food tracker', () => {
        const w = arena();
        const slot = adult(w);
        approach(w, { slot, k: 0, channel: CH_PREY, count: CLOSING_MIN });
        expect(biteDeliberate(w, slot)).toBe(true);
        expect(mealDeliberate(w, slot)).toBe(false);
    });

    it('ignores prey off the arc', () => {
        const w = arena();
        const slot = adult(w);
        approach(w, { slot, k: 6, channel: CH_PREY, count: 12 });
        expect(w.meritPreySeen[slot]).toBe(NEVER);
    });

    it('ignores a ray that shows a threat as well as prey', () => {
        const w = arena();
        const slot = adult(w);
        const base = slot * w.layout.inputCount;
        for (let i = 0; i < 8; i++) {
            w.tick += 1;
            w.inputs[base] = 0.5;
            w.inputs[base + CH_THREAT] = 0.5;
            w.inputs[base + CH_PREY] = 0.5;
            w.vx[slot] = w.config.maxVelocity * 0.5;
            trackMerit(w, slot);
        }
        expect(w.meritPreySeen[slot]).toBe(NEVER);
    });
});

describe('the escape episode', () => {
    it('is an escape when the agent flees within RESPONSE_WINDOW and lives ESCAPE_TICKS after the first bite', () => {
        const w = arena();
        const slot = adult(w);
        w.tick = 100;
        noteMeritBite(w, slot);
        w.tick = 150;
        noteMeritBite(w, slot);
        expect(w.biteFirst[slot]).toBe(100);
        w.tick = 100 + RESPONSE_WINDOW;
        w.vx[slot] = FLEE_SPEED * w.config.maxVelocity * 1.01;
        expect(resolveEscape(w, slot)).toBe(false);
        w.vx[slot] = 0;
        w.tick = 100 + ESCAPE_TICKS - 1;
        expect(resolveEscape(w, slot)).toBe(false);
        w.tick = 100 + ESCAPE_TICKS;
        expect(resolveEscape(w, slot)).toBe(true);
        expect(w.biteOpen[slot]).toBe(0);
        expect(resolveEscape(w, slot)).toBe(false);
    });

    it('is not an escape when the flee comes after RESPONSE_WINDOW', () => {
        const w = arena();
        const slot = adult(w);
        w.tick = 100;
        noteMeritBite(w, slot);
        w.tick = 100 + RESPONSE_WINDOW + 1;
        w.vx[slot] = w.config.maxVelocity;
        resolveEscape(w, slot);
        w.tick = 100 + ESCAPE_TICKS;
        expect(resolveEscape(w, slot)).toBe(false);
        expect(w.biteOpen[slot]).toBe(0);
    });
});
