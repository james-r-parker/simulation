import { describe, expect, it } from 'vitest';
import { arenaConfig } from '../../js/evo/chase-arena.js';
import { GRIP, decoyProfile } from '../../js/evo/role-budget-decoy.js';
import { roleParams } from '../../js/evo/role-budget-params.js';
import { hunterXs, smokeCell } from '../../js/evo/role-budget-smoke.js';
import { MODEL_DEFAULTS } from '../../js/evo/role-budget-model.js';

const config = arenaConfig();
const hunter = roleParams(config, 'predator');
const prey = roleParams(config, 'forager');
const cloud = { x: 240 - (prey.size + prey.smoke.radius), r: prey.smoke.radius };
const run = hunterXs(hunter, { speed: hunter.cap.sprint });

describe('decoyProfile', () => {
    it('returns the profile itself with no decoy', () => {
        expect(decoyProfile(hunter, { xs: run, from: 0, cloud, held: 0, speed: hunter.cap.sprint })).toBe(run);
    });

    it('is the straight run up to the grip, which lies (1 - GRIP) of the view short of the cloud', () => {
        const xs = decoyProfile(hunter, { xs: run, from: 0, cloud, held: 60, speed: hunter.cap.sprint });
        const grip = cloud.x - cloud.r - (1 - GRIP) * hunter.view.range;
        const at = xs.findIndex((x) => x >= grip);
        expect(xs.slice(0, at)).toEqual(run.slice(0, at));
        expect(xs).toHaveLength(run.length);
    });

    it('coasts on the damping with no thrust while the cloud is a decoy, then runs on', () => {
        const xs = decoyProfile(hunter, { xs: run, from: 0, cloud, held: 60, speed: hunter.cap.sprint });
        const step = (/** @type {number} */ t) => xs[t] - xs[t - 1];
        expect(step(60)).toBeLessThan(step(30));
        expect(step(59)).toBeLessThan(2);
        expect(step(100)).toBeGreaterThan(step(61));
        expect(xs[60]).toBeLessThan(cloud.x + cloud.r);
    });

    it('leaves the profile before the release unchanged', () => {
        const xs = decoyProfile(hunter, { xs: run, from: 8, cloud, held: 60 });
        expect(xs.slice(0, 9)).toEqual(run.slice(0, 9));
    });
});

describe('smokeCell with the decoy', () => {
    it('hides the prey for the decoy ticks and lets it leave the view, at the defaults', () => {
        const cell = smokeCell(hunter, prey, { ...MODEL_DEFAULTS });
        expect(cell.hiddenTicks).toBeGreaterThanOrEqual(60);
        expect(cell.escapeNeed).toBeLessThan(cell.hiddenTicks);
    });

    it('reads the old 15 hidden ticks with the decoy off', () => {
        const off = roleParams(arenaConfig({ smokeDecoyTicks: 0 }), 'forager');
        expect(smokeCell(hunter, off, { ...MODEL_DEFAULTS }).hiddenTicks).toBe(15);
    });
});
