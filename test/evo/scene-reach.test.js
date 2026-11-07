// Prey reach to cover on hand-built positions (habitat-cover.md, Detectors): the median distance to a ring edge, the
// share within a dash, and the share inside a food patch, on a `basins` world with two rings.

import { describe, expect, it } from 'vitest';
import { computeMetrics } from '../../js/evo/metrics.js';
import { DASH_PX, MIN_REACH_SAMPLES, sampleReach } from '../../js/evo/scene-reach.js';
import { refugeCentres } from '../../js/evo/scene-terrain.js';
import { ringRadius } from '../../js/sim/terrain.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { observed } from './helpers/observer-world.js';

const T0 = 10000;
const BASINS = { worldWidth: 4000, worldHeight: 2000, refugeCount: 2, wallGaps: 1, maxAgents: 256 };

/** A world and its first ring; `at(i)` is the `[x, y]` offset from the ring centre of agent `i`. */
function setup(over = {}) {
    const r = observed({ ...BASINS, ...over });
    const [cx, cy] = refugeCentres(r.observer.scenes.terrain, r.world);
    return { ...r, cx, cy, radius: ringRadius(r.world.config) };
}

/** Adds one agent per entry, each at a distance `d` from the first ring's centre along +y (clamped to the world). */
function place(/** @type {any} */ r, /** @type {number[]} */ distances) {
    const slots = distances.map((d) => {
        const slot = addBlob(r.world);
        r.world.x[slot] = r.cx;
        r.world.y[slot] = Math.max(0, Math.min(r.world.config.worldHeight, r.cy + d));
        return slot;
    });
    return slots;
}

function sample(/** @type {any} */ r, /** @type {number} */ tick = T0) {
    r.world.tick = tick;
    sampleReach(r.observer.scenes.reach, r.observer, r.world);
}

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

describe('eval.prey_cover_distance and eval.prey_within_dash_share', () => {
    it('reads a known distance, its dash share and zero inside a ring', () => {
        const r = setup();
        // Agents on a line through the ring centre; the world is tall enough that the other ring is not nearer.
        const slots = place(r, [0, 0, 0]);
        r.world.y[slots[0]] = r.cy;
        const d = r.radius + 410;
        r.world.y[slots[1]] = r.cy - d;
        r.world.y[slots[2]] = r.cy - d;
        expect(r.cy - d).toBeGreaterThan(0);
        for (let i = 0; i < 40; i++) {
            sample(r, T0 + 10 * i);
        }
        expect(read(r, 'prey_cover_distance').value).toBe(400);
        expect(read(r, 'prey_within_dash_share').value).toBeCloseTo(1);
    });

    it('counts samples past the dash as outside it', () => {
        const r = setup();
        const near = place(r, [0]);
        const far = place(r, [0]);
        r.world.y[near[0]] = r.cy - r.radius - (DASH_PX - 20);
        r.world.y[far[0]] = r.cy - r.radius - (DASH_PX + 400);
        for (let i = 0; i < 60; i++) {
            sample(r, T0 + 10 * i);
        }
        expect(read(r, 'prey_within_dash_share').value).toBeCloseTo(0.5);
        expect(read(r, 'prey_cover_distance').value).toBeGreaterThan(DASH_PX - 40);
    });

    it('leaves hunters out and is null before burn-in and under the sample floor', () => {
        const r = setup();
        const [a, b] = place(r, [0, 0]);
        r.world.spec[b] = 1;
        r.observer.intent.hunterSpec[1] = 1;
        sample(r, 10);
        expect(r.observer.scenes.reach.samples).toBe(0);
        sample(r);
        expect(r.observer.scenes.reach.samples).toBe(1);
        expect(r.world.alive[a]).toBe(1);
        expect(read(r, 'prey_cover_distance').value).toBeNull();
        expect(read(r, 'prey_in_patch_share').value).toBeNull();
        for (let i = 1; i < MIN_REACH_SAMPLES; i++) {
            sample(r, T0 + 10 * i);
        }
        expect(read(r, 'prey_cover_distance').value).toBe(0);
    });

    it('is null for the ring metrics when the layout has no rings', () => {
        const r = setup({ refugeCount: 0 });
        place(r, [0]);
        for (let i = 0; i < MIN_REACH_SAMPLES; i++) {
            sample(r, T0 + 10 * i);
        }
        expect(read(r, 'prey_cover_distance')).toEqual({ value: null, reason: 'no refuge rings' });
        expect(read(r, 'prey_within_dash_share').value).toBeNull();
        expect(read(r, 'prey_in_patch_share').value).toBe(0);
    });
});

describe('eval.prey_in_patch_share', () => {
    it('is the share of prey samples inside a living patch disc', () => {
        const r = setup();
        const [a, b] = place(r, [0, 0]);
        r.world.patchX[0] = 3000;
        r.world.patchY[0] = 1000;
        r.world.patchAlive[0] = 1;
        r.world.x[a] = 3000;
        r.world.y[a] = 1000;
        r.world.x[b] = 100;
        r.world.y[b] = 100;
        for (let i = 0; i < 60; i++) {
            sample(r, T0 + 10 * i);
        }
        expect(read(r, 'prey_in_patch_share').value).toBeCloseTo(0.5);
        r.world.patchAlive[0] = 0;
        for (let i = 60; i < 120; i++) {
            sample(r, T0 + 10 * i);
        }
        expect(read(r, 'prey_in_patch_share').value).toBeCloseTo(0.25);
    });
});
