// Matched hunter conversion and the dose slope on hand-built chase logs (hunter-practice.md, Detectors): strata of energy
// tercile by prior-chase class, equal-weight averages, and a slope of the catch on prior chases within terciles.

import { describe, expect, it } from 'vitest';
import {
    MIN_STRATA,
    MIN_STRATUM_CHASES,
    createMatchedScene,
    matchedMetrics,
    noteMatchedChase,
} from '../../js/evo/scene-matched.js';
import { CHASE_OUTCOME } from '../../js/evo/scene-competence.js';
import { observed } from './helpers/observer-world.js';
import { computeMetrics } from '../../js/evo/metrics.js';

const CAUGHT = CHASE_OUTCOME.CAUGHT;
const ESCAPED = CHASE_OUTCOME.ESCAPED;

/** A scene and a world whose hunter in slot 0 is of the given genome and age at every chase's resolution. */
function setup() {
    const { world, observer } = observed({ maxAgents: 8 });
    world.tick = 20000;
    world.genomeId[0] = 1;
    world.genomeId[1] = 2;
    return { world, observer, scene: createMatchedScene(world.config) };
}

/** Logs a chase of `slot` opened at `age` (resolved at the same tick) with `energy`. */
function chase(/** @type {any} */ r, /** @type {{slot?: number, age: number, energy: number, caught: boolean}} */ f) {
    const slot = f.slot ?? 0;
    r.world.ageTicks[slot] = f.age;
    noteMatchedChase(r.scene, r.world, {
        slot,
        outcome: f.caught ? CAUGHT : ESCAPED,
        openedTick: r.world.tick,
        energy: f.energy,
    });
}

describe('noteMatchedChase', () => {
    it('counts the prior resolved chases of a life, and starts again for a new genome in the slot', () => {
        const r = setup();
        for (let i = 0; i < 3; i++) {
            chase(r, { age: 1500, energy: 10, caught: true });
        }
        expect(Array.from(r.scene.log.prior.slice(0, 3))).toEqual([0, 1, 2]);
        r.world.genomeId[0] = 9;
        chase(r, { age: 1500, energy: 10, caught: true });
        expect(r.scene.log.prior[3]).toBe(0);
        chase(r, { slot: 1, age: 1500, energy: 10, caught: false });
        expect(r.scene.log.prior[4]).toBe(0);
    });

    it('logs the age at opening: the age at resolution less the ticks since it opened', () => {
        const r = setup();
        r.world.ageTicks[0] = 1500;
        noteMatchedChase(r.scene, r.world, { slot: 0, outcome: CAUGHT, openedTick: 19900, energy: 7 });
        expect(r.scene.log.age[0]).toBe(1400);
        expect(r.scene.log.energy[0]).toBe(7);
    });
});

describe('eval.hunter_conversion_matched.<band>', () => {
    it('is null with no chase, and with too few strata holding enough chases', () => {
        const r = setup();
        expect(matchedMetrics(r.scene)['eval.hunter_conversion_matched.1k-2k'].value).toBeNull();
        for (let i = 0; i < MIN_STRATUM_CHASES; i++) {
            chase(r, { age: 1500, energy: 10, caught: true });
        }
        expect(matchedMetrics(r.scene)['eval.hunter_conversion_matched.1k-2k'].value).toBeNull();
        expect(matchedMetrics(r.scene)['eval.hunter_conversion_matched.under1k'].value).toBeNull();
    });

    it('averages the strata with equal weight, not by their chase counts', () => {
        const r = setup();
        // Every chase is the first of a fresh life (prior class 0); the energy spreads them over the three terciles.
        const energies = [1, 2, 3];
        let genome = 100;
        for (const energy of energies) {
            for (let i = 0; i < MIN_STRATUM_CHASES; i++) {
                r.world.genomeId[0] = genome++;
                // Each chase is the first of a fresh life, so it is in prior class 0.
                chase(r, { age: 1500, energy, caught: energy === 1 ? true : i < 2 });
            }
        }
        // Three strata (one per energy tercile), 5 chases each: caught 5/5, 2/5, 2/5.
        const metric = matchedMetrics(r.scene)['eval.hunter_conversion_matched.1k-2k'];
        expect(MIN_STRATA).toBe(3);
        expect(metric.value).toBeCloseTo((1 + 0.4 + 0.4) / 3, 12);
    });

    it('is carried by computeMetrics for each band', () => {
        const { observer, world } = observed({ maxAgents: 8 });
        const all = computeMetrics(observer, world);
        for (const band of ['under1k', '1k-2k', 'over2k']) {
            expect(all[`eval.hunter_conversion_matched.${band}`].value).toBeNull();
        }
        expect(all['eval.hunter_conversion_by_dose'].value).toBeNull();
    });
});

describe('eval.hunter_conversion_by_dose', () => {
    /** One hunter with `n` chases at age 2000 and one energy, catching only the chases after the first `k`. */
    function life(/** @type {any} */ r, /** @type {{genome: number, n: number, k: number, energy: number}} */ f) {
        r.world.genomeId[0] = f.genome;
        for (let i = 0; i < f.n; i++) {
            chase(r, { age: 2000, energy: f.energy, caught: i >= f.k });
        }
    }

    it('is the least-squares slope of the catch on the prior count within an energy tercile', () => {
        const r = setup();
        // Prior counts 0..9; caught = 1 once prior >= 5. Slope of a 0/1 step at the middle of 0..9.
        life(r, { genome: 5, n: 10, k: 5, energy: 10 });
        const xs = Array.from({ length: 10 }, (_, i) => i);
        const ys = xs.map((x) => (x >= 5 ? 1 : 0));
        const mx = 4.5;
        const my = 0.5;
        const slope =
            xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
        const metric = matchedMetrics(r.scene)['eval.hunter_conversion_by_dose'];
        expect(metric.value).toBeCloseTo(slope, 12);
        expect(slope).toBeGreaterThan(0);
    });

    it('is negative when hunters do worse with more attempts, and ignores chases outside ages 1000 to 3999', () => {
        const r = setup();
        r.world.genomeId[0] = 6;
        for (let i = 0; i < 8; i++) {
            chase(r, { age: 2500, energy: 10, caught: i < 4 });
        }
        for (let i = 0; i < 8; i++) {
            chase(r, { age: 500, energy: 10, caught: true });
            chase(r, { age: 4500, energy: 10, caught: true });
        }
        expect(matchedMetrics(r.scene)['eval.hunter_conversion_by_dose'].value).toBeLessThan(0);
    });

    it('is null without a spread of prior counts', () => {
        const r = setup();
        for (let i = 0; i < 10; i++) {
            r.world.genomeId[0] = 200 + i;
            chase(r, { age: 2000, energy: 10, caught: true });
        }
        expect(matchedMetrics(r.scene)['eval.hunter_conversion_by_dose'].value).toBeNull();
    });
});
