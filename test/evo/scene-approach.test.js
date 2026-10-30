// Abort and a real chase: hunters with a hand-set closing history on the intent tracker's prey view, bites set on the
// victims the way `applyBite` leaves them, run through the real `trackApproaches` and `noteApproachKill`.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { noteApproachKill, trackApproaches } from '../../js/evo/scene-approach.js';
import { INTENT_WINDOW } from '../../js/evo/observer-intent-state.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;
const CLOSING = 0x3ff;

/**
 * A world with `hunters` predators and `prey` foragers, each tracked by the observer.
 * @param {number} hunters how many predators
 * @param {number} prey how many foragers
 * @returns {any} the world, the observer and the two slot lists
 */
function arena(hunters, prey) {
    const r = observed();
    const { predator } = r.world.config.specialisations;
    /** @type {{hunters: number[], prey: number[]}} */
    const slots = { hunters: [], prey: [] };
    for (let i = 0; i < hunters; i++) {
        slots.hunters.push(addBlob(r.world, { spec: predator.index }));
    }
    for (let i = 0; i < prey; i++) {
        slots.prey.push(addBlob(r.world));
    }
    for (const slot of [...slots.hunters, ...slots.prey]) {
        r.observer.slotOf.set(r.world.genomeId[slot], slot);
        r.world.bittenTimer[slot] = 100;
    }
    return { ...r, ...slots };
}

/**
 * Plays tick `tick`: the hunters in `closing` close on prey, the others see none; each pair in `bites` lands a bite.
 * @param {any} a the arena
 * @param {number} tick the tick
 * @param {{closing?: number[], bites?: number[][]}} [moves] the hunters closing and the (hunter, victim) bites
 * @returns {void}
 */
function play(a, tick, { closing = [], bites = [] } = {}) {
    a.world.tick = tick;
    for (const h of a.hunters) {
        const closes = closing.includes(h);
        a.observer.intent.prey.seen[h] = closes ? tick : -Infinity;
        a.observer.intent.prey.bits[h] = closes ? CLOSING : 0;
    }
    for (const [hunter, victim] of bites) {
        a.world.bittenTimer[victim] = 1;
        a.world.lastBiter[victim] = a.world.genomeId[hunter];
    }
    trackApproaches(a.observer.scenes.approach, a.observer, a.world);
    for (const [, victim] of bites) {
        a.world.bittenTimer[victim] = 100;
    }
}

const read = (/** @type {any} */ a, /** @type {string} */ name) => computeMetrics(a.observer, a.world)[`eval.${name}`];

describe('hunt approaches and chases', () => {
    it('split a catch, an escape and a lapse into thirds, and abort one approach in three', () => {
        const a = arena(3, 2);
        const [h1, h2, h3] = a.hunters;
        const [v1, v2] = a.prey;
        play(a, T0, { closing: [h1, h2, h3] });
        play(a, T0 + 1, {
            closing: [h1, h2],
            bites: [
                [h1, v1],
                [h2, v2],
            ],
        });
        a.world.tick = T0 + 2;
        noteApproachKill(a.observer.scenes.approach, a.observer, a.world, {
            killerId: a.world.genomeId[h2],
            victimId: a.world.genomeId[v2],
        });
        a.world.alive[v2] = 0;
        play(a, T0 + 1 + INTENT_WINDOW);
        const s = a.observer.scenes.approach;
        expect([s.committed, s.aborted, s.caught, s.escaped]).toEqual([2, 1, 1, 1]);
        expect(read(a, 'hunt_abort_rate').value).toBeCloseTo(1 / 3, 12);
        expect(read(a, 'chase_catch_share').value).toBeCloseTo(1 / 3, 12);
        expect(read(a, 'chase_escape_share').value).toBeCloseTo(1 / 3, 12);
        expect(read(a, 'chase_giveup_share').value).toBeCloseTo(1 / 3, 12);
    });

    it('count a killing bite, which no tick sees on a live victim, as a committed approach and a catch', () => {
        const a = arena(1, 1);
        play(a, T0, { closing: a.hunters });
        a.world.tick = T0 + 1;
        noteApproachKill(a.observer.scenes.approach, a.observer, a.world, {
            killerId: a.world.genomeId[a.hunters[0]],
            victimId: a.world.genomeId[a.prey[0]],
        });
        expect(read(a, 'hunt_abort_rate').value).toBe(0);
        expect(read(a, 'chase_catch_share').value).toBe(1);
    });

    it('keep an approach open while it keeps closing, and lapse it only after the window', () => {
        const a = arena(1, 0);
        play(a, T0, { closing: a.hunters });
        play(a, T0 + 20, { closing: a.hunters });
        play(a, T0 + 20 + INTENT_WINDOW);
        expect(a.observer.scenes.approach.aborted).toBe(0);
        play(a, T0 + 21 + INTENT_WINDOW);
        expect(a.observer.scenes.approach.aborted).toBe(1);
    });

    it('drop a chase whose victim dies of something else inside the window', () => {
        const a = arena(1, 1);
        play(a, T0, { closing: a.hunters });
        play(a, T0 + 1, { closing: a.hunters, bites: [[a.hunters[0], a.prey[0]]] });
        a.world.alive[a.prey[0]] = 0;
        play(a, T0 + 1 + INTENT_WINDOW);
        expect(read(a, 'chase_escape_share').value).toBeNull();
        expect(read(a, 'hunt_abort_rate').value).toBe(0);
    });

    it('ignore grazers, and approaches that end before burn-in', () => {
        const a = arena(1, 1);
        a.observer.intent.prey.seen[a.prey[0]] = T0;
        a.observer.intent.prey.bits[a.prey[0]] = CLOSING;
        play(a, T0 - 100, { closing: a.hunters });
        play(a, T0 - 99 + INTENT_WINDOW);
        play(a, T0 + 5);
        expect(a.observer.scenes.approach.aborted).toBe(0);
        expect(a.observer.scenes.approach.phase[a.prey[0]]).toBe(0);
        expect(read(a, 'hunt_abort_rate').reason).toContain('no hunter approach');
    });
});
