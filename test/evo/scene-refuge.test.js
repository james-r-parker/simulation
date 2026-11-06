// Refuge episodes and visits on hand-built paths (refuge.md, Detectors): the prey-only use, the episode entry against its
// calm control, the dwell and the exit-fed share, on a `basins` world with two rings.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { MIN_REFUGE_EPISODES, MIN_REFUGE_EXITS, REFUGE_WINDOW, sampleRefuge } from '../../js/evo/scene-refuge.js';
import { refugeCentres } from '../../js/evo/scene-terrain.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;
const STEP = 10;
const BASINS = { worldWidth: 4000, worldHeight: 2000, refugeCount: 2, wallGaps: 1, maxAgents: 64 };

/** Builds the world and its ring centre; slot states are `[threat, inside]` per sample. */
function setup() {
    const r = observed(BASINS);
    const [cx, cy] = refugeCentres(r.observer.scenes.terrain, r.world);
    return { ...r, cx, cy, tickIndex: 0 };
}

/**
 * Takes `count` samples, 10 ticks apart. `path(slot, i)` is the `[threat, inside]` of a slot at sample `i`; null kills the
 * slot, and a dead slot stays dead.
 */
function run(
    /** @type {any} */ r,
    /** @type {number[]} */ slots,
    /** @type {number} */ count,
    /** @type {any} */ path,
) {
    for (let i = 0; i < count; i++) {
        r.world.tick = T0 + STEP * r.tickIndex++;
        for (const slot of slots) {
            const state = r.world.alive[slot] === 1 ? path(slot, i) : null;
            if (state === null) {
                r.world.alive[slot] = 0;
                continue;
            }
            r.observer.intent.threatProx[slot] = state[0] === 1 ? 0.9 : 0;
            r.world.x[slot] = state[1] === 1 ? r.cx : 10;
            r.world.y[slot] = state[1] === 1 ? r.cy : 10;
        }
        sampleRefuge(r.observer.scenes.refuge, r.observer, r.world);
    }
}

/** Adds `n` agents and returns their slots. */
function agents(/** @type {any} */ r, /** @type {number} */ n) {
    return Array.from({ length: n }, () => addBlob(r.world));
}

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

describe('eval.refuge_prey_use_under_threat', () => {
    it('leaves hunters out of both shares', () => {
        const r = setup();
        const slots = agents(r, 3);
        r.world.spec[slots[2]] = 1;
        r.observer.intent.hunterSpec[1] = 1;
        const states = [
            [1, 1],
            [0, 0],
            [0, 1],
        ];
        run(r, slots, 1, (/** @type {number} */ slot) => states[slots.indexOf(slot)]);
        expect(read(r, 'refuge_prey_use_under_threat').value).toBe(1);
        expect(r.observer.scenes.refuge.calm).toBe(1);
    });

    it('is null before burn-in and with no calm prey', () => {
        const r = setup();
        const slots = agents(r, 1);
        r.world.tick = 10;
        sampleRefuge(r.observer.scenes.refuge, r.observer, r.world);
        run(r, slots, 1, () => [1, 1]);
        expect(read(r, 'refuge_prey_use_under_threat').value).toBeNull();
    });
});

describe('eval.refuge_episode_entry', () => {
    it('is the threatened episodes that reached a ring minus the calm control episodes that did', () => {
        const r = setup();
        const enter = agents(r, 25);
        const stay = agents(r, 5);
        const calmOut = agents(r, 20);
        const calmIn = agents(r, 5);
        const first = [
            [0, 0],
            [1, 0],
            [1, 1],
        ];
        const control = [
            [1, 0],
            [0, 0],
        ];
        run(r, [...enter, ...stay, ...calmOut, ...calmIn], 3, (/** @type {number} */ slot, /** @type {number} */ i) => {
            if (enter.includes(slot)) {
                return first[i];
            }
            if (stay.includes(slot)) {
                return i === 2 ? null : first[i].map((v, k) => (k === 1 ? 0 : v));
            }
            if (calmOut.includes(slot)) {
                return i === 2 ? null : control[i];
            }
            return i === 2
                ? null
                : [
                      [1, 0],
                      [0, 1],
                  ][i];
        });
        expect(read(r, 'refuge_episode_entry').value).toBeCloseTo(25 / 30 - 5 / 25, 12);
    });

    it('misses an entry after the window and counts the opening sample as inside', () => {
        const r = setup();
        const [late, opening] = agents(r, 2);
        const scene = r.observer.scenes.refuge;
        run(r, [late, opening], 2, (/** @type {number} */ slot, /** @type {number} */ i) =>
            i === 0 ? [0, 0] : [1, slot === opening ? 1 : 0],
        );
        expect([scene.episodes[1], scene.entered[1]]).toEqual([1, 1]);
        run(r, [late], REFUGE_WINDOW / STEP + 1, () => [1, 0]);
        run(r, [late], 1, () => [1, 1]);
        expect([scene.episodes[1], scene.entered[1]]).toEqual([2, 1]);
    });

    it('counts an entry exactly at the window edge, and a replaced agent as a miss', () => {
        const r = setup();
        const [edge, gone] = agents(r, 2);
        const scene = r.observer.scenes.refuge;
        run(r, [edge, gone], 1, () => [0, 0]);
        run(r, [edge, gone], 1, () => [1, 0]);
        run(r, [edge], REFUGE_WINDOW / STEP - 1, () => [1, 0]);
        run(r, [edge], 1, () => [1, 1]);
        expect([scene.episodes[1], scene.entered[1]]).toEqual([1, 1]);
        r.world.genomeId[gone] = r.world.nextId++;
        run(r, [gone], 1, () => [0, 0]);
        expect([scene.episodes[1], scene.entered[1]]).toEqual([2, 1]);
    });

    it('is null under the minimum episodes of either kind', () => {
        const r = setup();
        const slots = agents(r, MIN_REFUGE_EPISODES - 1);
        const path = [
            [0, 0],
            [1, 1],
            [0, 1],
        ];
        run(r, slots, 3, (/** @type {number} */ _slot, /** @type {number} */ i) => path[i]);
        expect(read(r, 'refuge_episode_entry').value).toBeNull();
    });
});

describe('eval.refuge_dwell_ticks and eval.refuge_exit_fed', () => {
    /** 21 prey enter at sample 1; ten leave at sample 2 and eleven at sample 5; ten eat at once, five eat too late. */
    function visits() {
        const r = setup();
        const slots = agents(r, MIN_REFUGE_EXITS + 1);
        const exitAt = (/** @type {number} */ slot) => (slots.indexOf(slot) < 10 ? 2 : 5);
        for (let i = 0; i < 40; i++) {
            run(r, slots, 1, (/** @type {number} */ slot) => [0, i >= 1 && i < exitAt(slot) ? 1 : 0]);
            for (const [k, slot] of slots.entries()) {
                const eats = (k < 10 && i === 3) || (k >= 10 && k < 15 && i === 35);
                r.world.foodEnergy[slot] += eats ? 50 : 0;
            }
        }
        return r;
    }

    it('reports the median ticks from entry to exit', () => {
        expect(read(visits(), 'refuge_dwell_ticks').value).toBe(40);
    });

    it('reports the share of exits followed by a meal inside the window', () => {
        expect(read(visits(), 'refuge_exit_fed').value).toBeCloseTo(10 / 21, 12);
    });

    it('does not count a dwell whose entry was not sampled, and is null under the minimum exits', () => {
        const r = setup();
        const slots = agents(r, MIN_REFUGE_EXITS - 1);
        run(r, slots, 2, (/** @type {number} */ _slot, /** @type {number} */ i) => [0, 1 - i]);
        expect(r.observer.scenes.refuge.dwells).toBe(0);
        expect(read(r, 'refuge_dwell_ticks').value).toBeNull();
        expect(read(r, 'refuge_exit_fed').value).toBeNull();
    });
});
