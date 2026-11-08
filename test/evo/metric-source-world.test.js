// Source tests, world family, birth sources, proof and parent diet (docs/designs/metric-trust.md, T20a): the real
// `step`, `observe` and `computeMetrics` on a scripted world, each value known by construction. Every test plants one
// event in the final tick and one in a tick a body dies.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/burn-in.js';
import { eaten, plantFood, sourceRun, starve, zeroPolicy } from './helpers/source-world.js';

const FORAGER = 0;
const PREDATOR = 1;

/** A policy whose `initSpec` returns `next.spec`. */
function specPolicy(initial = FORAGER) {
    const next = { spec: initial };
    return { next, policy: { ...zeroPolicy(), initSpec: () => next.spec } };
}

/** Makes `slot` ready to split in the next `step`. */
function readyToSplit(/** @type {any} */ world, /** @type {number} */ slot) {
    world.ageTicks[slot] = 100;
    world.energy[slot] = 1500;
    world.cooldown[slot] = 0;
    world.pregnancy[slot] = 0;
}

/** Sets `mother` due to deliver a mating child of `father` in the next `step`. */
function dueToDeliver(/** @type {any} */ world, /** @type {number} */ mother, /** @type {number} */ father) {
    world.ageTicks[mother] = 100;
    world.energy[mother] = 1500;
    world.fatherId[mother] = world.genomeId[father];
    world.fatherLineage[mother] = world.lineageId[father];
    world.pregnancy[mother] = 1;
}

/** Latest alive child of `parent`. */
function childOf(/** @type {any} */ world, /** @type {number} */ parent) {
    for (let slot = world.alive.length - 1; slot >= 0; slot--) {
        if (world.alive[slot] === 1 && world.parentA[slot] === world.genomeId[parent] && slot !== parent) {
            return slot;
        }
    }
    throw new Error(`no child of ${parent}`);
}

/**
 * Six hunter births across the five `BIRTH_SOURCE` categories:
 * - 1 `initial` hunter spawned before Tick 1;
 * - Tick 1 (one body dies): non-hunter `flipper` splits with `rng.mutation` zeroed so `childSpec` flips `0 -> 1`
 *   (`spec-flip`), while every other agent starves so `fillFloor` (`minAgents: 2`) spawns 1 `floor` hunter;
 * - Tick 2 (one body dies): hunter `mother` delivers 1 `mate-hunter-parent` child and hunter `s1` splits 1
 *   `split-hunter-parent` child (`rng.mutation` seeded above `specMutationRate`);
 * - Tick 3, the last (one body dies): hunter `s2` splits a second `split-hunter-parent` child.
 */
function runHunterBirthSources() {
    const { next, policy } = specPolicy(PREDATOR);
    const r = sourceRun({
        policy,
        over: { maxAgents: 16, minAgents: 1, specMutationRate: 0.5 },
    });
    const { world } = r;
    const initialHunter = r.spawn(BORN_CAUSE.INITIAL);
    next.spec = FORAGER;
    const flipper = r.spawn(BORN_CAUSE.INITIAL);
    const doomed1 = r.spawn(BORN_CAUSE.INITIAL);
    next.spec = PREDATOR;
    // Tick 1: `flipper` (forager) splits a `spec-flip` hunter while `initialHunter` and `doomed1` die.
    r.tick((w) => {
        w.rng.mutation.s.fill(0);
        readyToSplit(w, flipper);
        starve(w, initialHunter, 50);
        starve(w, doomed1, 50);
    });
    // Tick 2: `flipper` and its child die, emptying the world so `fillFloor` (`minAgents: 1`) spawns 1 `floor` hunter.
    r.tick((w) => {
        for (let slot = 0; slot < w.alive.length; slot++) {
            if (w.alive[slot] === 1) {
                starve(w, slot, 50);
            }
        }
    });
    next.spec = FORAGER;
    const [father, doomed2, doomed3, mother, s1, s2] = Array.from({ length: 6 }, () => r.spawn());
    [mother, s1, s2].forEach((slot) => {
        world.spec[slot] = PREDATOR;
    });
    r.tick((w) => {
        w.rng.mutation.s.set([0xffffffff, 0xffffffff, 0xffffffff, 0]);
        dueToDeliver(w, mother, father);
        readyToSplit(w, s1);
        starve(w, doomed2, 50);
    });
    r.tick((w) => {
        w.rng.mutation.s.set([0xffffffff, 0xffffffff, 0xffffffff, 0]);
        readyToSplit(w, s2);
        starve(w, doomed3, 50);
    });
    return r.metrics();
}

describe('hunter_birth_source_share.*', () => {
    const m = runHunterBirthSources();

    it('counts mate-hunter-parent (1/6), split-hunter-parent (2/6), spec-flip (1/6), floor (1/6) and initial (1/6)', () => {
        expect(m['eval.hunter_birth_source_share.mate-hunter-parent']).toEqual({ value: 1 / 6 });
        expect(m['eval.hunter_birth_source_share.split-hunter-parent']).toEqual({ value: 2 / 6 });
        expect(m['eval.hunter_birth_source_share.spec-flip']).toEqual({ value: 1 / 6 });
        expect(m['eval.hunter_birth_source_share.floor']).toEqual({ value: 1 / 6 });
        expect(m['eval.hunter_birth_source_share.initial']).toEqual({ value: 1 / 6 });
    });
});

describe('birth_source_share.split, mate and floor', () => {
    it('counts 2 splits, 1 mate birth and 1 floor spawn after burn-in, with one birth in a death tick and one in the last tick', () => {
        const r = sourceRun({ over: { maxAgents: 16, minAgents: 1 } });
        const [mother, father, s1, s2, doomed1, doomed2] = Array.from({ length: 6 }, () => r.spawn());
        r.jump(BURN_IN_TICKS);
        r.tick((w) => {
            dueToDeliver(w, mother, father);
            readyToSplit(w, s1);
            starve(w, doomed1, 50);
        });
        r.tick((w) => {
            readyToSplit(w, s2);
            for (let slot = 0; slot < w.alive.length; slot++) {
                if (w.alive[slot] === 1) {
                    starve(w, slot, 50);
                }
            }
            w.energy[s2] = 1500;
            w.ageTicks[s2] = 100;
            starve(w, doomed2, 50);
        });
        // In the final tick, starve every living agent so `fillFloor` (`minAgents: 1`) spawns 1 floor entrant.
        r.tick((w) => {
            for (let slot = 0; slot < w.alive.length; slot++) {
                if (w.alive[slot] === 1) {
                    starve(w, slot, 50);
                }
            }
        });
        const m = r.metrics();
        expect(m['eval.birth_source_share.split']).toEqual({ value: 2 / 4 });
        expect(m['eval.birth_source_share.mate']).toEqual({ value: 1 / 4 });
        expect(m['eval.birth_source_share.floor']).toEqual({ value: 1 / 4 });
    });
});

describe('proven_share, established_share and lineage_persistence', () => {
    it('counts proven and established deaths after burn-in, and averages winter and hunted-year lineage survival', () => {
        const seasonTicks = 100;
        const r = sourceRun({ over: { maxAgents: 16, eraSeasonTicks: seasonTicks } });
        const { world } = r;
        const [est1, est2, provOnly, unproven, hunter] = Array.from({ length: 5 }, () => r.spawn());
        [est1, est2, provOnly, unproven, hunter].forEach((slot, i) => {
            world.x[slot] = 80 + 80 * i;
            world.y[slot] = 200;
            world.vx[slot] = 0;
            world.vy[slot] = 0;
        });
        world.lineageId[est1] = 10;
        world.lineageId[est2] = 20;
        // Prove est1, est2 and provOnly, split est1 and est2, and prove their children so lineages 10 and 20 are established.
        r.tick((w) => {
            plantFood(w, est1);
            plantFood(w, est2);
            plantFood(w, provOnly);
            readyToSplit(w, est1);
            readyToSplit(w, est2);
        });
        const c1 = childOf(world, est1);
        const c2 = childOf(world, est2);
        r.tick((w) => {
            w.x[c1] = 100;
            w.y[c1] = 500;
            w.x[c2] = 300;
            w.y[c2] = 500;
            plantFood(w, c1);
            plantFood(w, c2);
        });
        // End of winter (`tick = BURN_IN_TICKS + 400`): snapshots established lineages 10 and 20 into `scene.winter`.
        r.jump(BURN_IN_TICKS + 4 * seasonTicks - 1);
        r.tick();
        // During spring, kill lineage 20 (`est2` and `c2`) so 1 of 2 winter lineages survives to the spring sample,
        // and also kill `provOnly`. Deaths so far after burn-in: `est2` (est), `c2` (proven), `provOnly` (proven).
        r.tick((w) => {
            starve(w, est2, 50);
            starve(w, c2, 50);
            starve(w, provOnly, 50);
        });
        // Sample `scene.winter` (1 / 2 = 0.5) and snapshot `scene.year` (lineage 10) at `BURN_IN_TICKS + 500`.
        r.jump(BURN_IN_TICKS + 5 * seasonTicks - 1);
        r.tick();
        // During the year, `c1` (bearer of lineage 10, proven) is eaten, marking lineage 10 hunted (`est1` survives).
        r.tick((w) => eaten(w, c1, hunter));
        // Final tick (`BURN_IN_TICKS + 900`): `unproven` dies (5th death after burn-in) and `scene.year` samples (1 / 1 = 1).
        r.jump(BURN_IN_TICKS + 9 * seasonTicks - 1);
        r.tick((w) => starve(w, unproven, 50));
        const m = r.metrics();
        // 5 deaths after burn-in: est2 (proven+est), c2 (proven), provOnly (proven), c1 (proven), unproven (neither).
        expect(m['eval.proven_share']).toEqual({ value: 4 / 5 });
        expect(m['eval.established_share']).toEqual({ value: 1 / 5 });
        expect(m['eval.lineage_persistence']).toEqual({ value: (0.5 + 1) / 2 });
    });
});

describe('split_parent_delib_share, mate_parent_delib_share and split_bumper_share', () => {
    it('averages deliberate meal shares at split and mate births after burn-in, including the final tick', () => {
        const r = sourceRun({ over: { maxAgents: 16 } });
        const [sBumper, sDelib, mother1, father1, mother2, father2, doomed1, doomed2] = Array.from({ length: 8 }, () =>
            r.spawn(),
        );
        const { world } = r;
        world.mealsTotal[sBumper] = 20;
        world.mealsDeliberate[sBumper] = 1; // 0.05 < BUMPER_SHARE (0.1)
        world.mealsTotal[sDelib] = 10;
        world.mealsDeliberate[sDelib] = 8; // 0.80 >= BUMPER_SHARE
        world.mealsTotal[mother1] = 10;
        world.mealsDeliberate[mother1] = 6; // 0.60
        world.mealsTotal[father1] = 10;
        world.mealsDeliberate[father1] = 2; // 0.20 -> pair mean 0.40
        world.mealsTotal[mother2] = 10;
        world.mealsDeliberate[mother2] = 9; // 0.90 (father2 dies in same tick, before births, so mother2 alone counts)
        r.jump(BURN_IN_TICKS);
        r.tick((w) => {
            readyToSplit(w, sBumper);
            dueToDeliver(w, mother1, father1);
            starve(w, doomed1, 50);
        });
        r.tick((w) => {
            readyToSplit(w, sDelib);
            dueToDeliver(w, mother2, father2);
            starve(w, father2, 50);
            starve(w, doomed2, 50);
        });
        const m = r.metrics();
        expect(m['eval.split_parent_delib_share'].value).toBeCloseTo((0.05 + 0.8) / 2, 12);
        expect(m['eval.split_bumper_share']).toEqual({ value: 1 / 2 });
        expect(m['eval.mate_parent_delib_share'].value).toBeCloseTo((0.4 + 0.9) / 2, 12);
    });
});
