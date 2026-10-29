// Skill heritability and social return on hand-built meals, deaths and family trees with known answers.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { computeMetrics } from '../../js/evo/metrics.js';
import { noteBirthLineage } from '../../js/evo/observer-lineage-counters.js';
import {
    AGE_BUCKET_TICKS,
    MIN_HERITABILITY_PAIRS,
    TENTH_MEAL,
    creditGrandparents,
    noteHeritageBirth,
    noteHeritageDeath,
    trackHeritage,
} from '../../js/evo/scene-heritage.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushBorn } from './helpers/observer-world.js';

const T0 = 10000;

const read = (/** @type {any} */ r, /** @type {string} */ name) => computeMetrics(r.observer, r.world)[`eval.${name}`];

/** Plays `n` split births of one parent whose deliberate share is i / 10 and whose child reaches ten meals at `child(i)`. */
function breed(/** @type {any} */ r, /** @type {number} */ n, /** @type {(i: number) => number} */ child) {
    const parent = addBlob(r.world);
    const kid = addBlob(r.world);
    r.world.tick = T0;
    for (let i = 0; i < n; i++) {
        r.world.mealsTotal[parent] = TENTH_MEAL;
        r.world.mealsDeliberate[parent] = i;
        r.world.parentSlotA[kid] = parent;
        r.world.parentSlotB[kid] = parent;
        r.world.parentA[kid] = r.world.genomeId[parent];
        r.world.parentB[kid] = r.world.genomeId[parent];
        noteHeritageBirth(r.observer.scenes.heritage, r.world, kid);
        r.world.mealsTotal[kid] = TENTH_MEAL;
        r.world.mealsDeliberate[kid] = child(i);
        trackHeritage(r.observer.scenes.heritage, r.world, kid);
    }
    return { parent, kid };
}

describe('eval.skill_heritability', () => {
    it('is the correlation of parent share at the birth and child share at its tenth meal', () => {
        const same = observed({});
        breed(same, MIN_HERITABILITY_PAIRS, (i) => i);
        expect(read(same, 'skill_heritability').value).toBeCloseTo(1, 12);
        const opposite = observed({});
        breed(opposite, MIN_HERITABILITY_PAIRS, (i) => 9 - i);
        expect(read(opposite, 'skill_heritability').value).toBeCloseTo(-1, 12);
    });

    it('leaves out a child with fewer than ten meals, and reads the mean of two live parents', () => {
        const r = observed({});
        const { parent, kid } = breed(r, 1, () => 0);
        const other = addBlob(r.world);
        r.world.mealsTotal[parent] = 10;
        r.world.mealsDeliberate[parent] = 2;
        r.world.mealsTotal[other] = 10;
        r.world.mealsDeliberate[other] = 6;
        r.world.parentSlotB[kid] = other;
        r.world.parentB[kid] = r.world.genomeId[other];
        noteHeritageBirth(r.observer.scenes.heritage, r.world, kid);
        expect(r.observer.scenes.heritage.parentShare[kid]).toBeCloseTo(0.4, 12);
        r.world.mealsTotal[kid] = TENTH_MEAL - 1;
        trackHeritage(r.observer.scenes.heritage, r.world, kid);
        expect(r.observer.scenes.heritage.pairCount).toBe(1);
        expect(r.observer.scenes.heritage.pending[kid]).toBe(1);
    });

    it('opens no pair before burn-in or with no parent alive; null below the least pairs', () => {
        const early = observed({});
        const parent = addBlob(early.world);
        const kid = addBlob(early.world);
        early.world.parentSlotA[kid] = parent;
        early.world.parentA[kid] = early.world.genomeId[parent];
        early.world.tick = T0 - 1;
        noteHeritageBirth(early.observer.scenes.heritage, early.world, kid);
        expect(early.observer.scenes.heritage.pending[kid]).toBe(0);
        early.world.tick = T0;
        early.world.alive[parent] = 0;
        noteHeritageBirth(early.observer.scenes.heritage, early.world, kid);
        expect(early.observer.scenes.heritage.pending[kid]).toBe(0);
        expect(read(observed({}), 'skill_heritability').reason).toContain('fewer than');
    });
});

describe('eval.social_return', () => {
    /** One mature death at `age` with `grand` matured grandchildren, credited or not. */
    function die(/** @type {any} */ r, /** @type {Record<string, number>} */ f) {
        r.observer.packKills[0] = f.social;
        r.observer.scenes.heritage.grand[0] = f.grand;
        noteHeritageDeath(r.observer.scenes.heritage, r.observer, { slot: 0, age: f.age });
    }

    it('is the age-matched grandchild difference between credited and uncredited agents, weighted by the smaller group', () => {
        const r = observed();
        const a = 1.5 * AGE_BUCKET_TICKS;
        const b = 3.5 * AGE_BUCKET_TICKS;
        for (const grand of [3, 1]) {
            die(r, { social: 1, grand, age: a });
        }
        for (const grand of [0, 0, 1, 1]) {
            die(r, { social: 0, grand, age: a });
        }
        die(r, { social: 0, grand: 1, age: b });
        die(r, { social: 1, grand: 0, age: b });
        // Age 1: 2 against 0.5, weight 2. Age 3: 0 against 1, weight 1.
        expect(read(r, 'social_return').value).toBeCloseTo((2 * 1.5 - 1) / 3, 12);
    });

    it('counts an alarm or hunt-call credit as social, and is null without both groups at one age', () => {
        const r = observed();
        r.observer.intent.alarmCredits[0] = 1;
        r.observer.scenes.heritage.grand[0] = 2;
        noteHeritageDeath(r.observer.scenes.heritage, r.observer, { slot: 0, age: 100 });
        expect(r.observer.scenes.heritage.creditedAgents[0]).toBe(1);
        expect(read(r, 'social_return').value).toBeNull();
    });
});

describe('creditGrandparents', () => {
    it('credits a living grandparent once, even when it is both of a parent', () => {
        const r = observed();
        const g = addBlob(r.world);
        const p = addBlob(r.world);
        const c = addBlob(r.world);
        nextTick(r.world, 5);
        const [gid, pid, cid] = [g, p, c].map((s) => r.world.genomeId[s]);
        pushBorn(r.world, { slot: g, genomeId: gid, cause: BORN_CAUSE.INITIAL });
        pushBorn(r.world, { slot: p, genomeId: pid, parentA: gid, parentB: gid, cause: BORN_CAUSE.SPLIT });
        pushBorn(r.world, { slot: c, genomeId: cid, parentA: pid, parentB: pid, cause: BORN_CAUSE.SPLIT });
        noteBirthLineage(r.observer, r.world.events.data, r.world.events.count);
        r.observer.slotOf.set(gid, g);
        r.observer.slotOf.set(pid, p);
        r.observer.genomeId[c] = cid;
        creditGrandparents(r.observer.scenes.heritage, r.observer, c);
        expect(Array.from(r.observer.scenes.heritage.grand.slice(0, 3))).toEqual([1, 0, 0]);
    });
});
