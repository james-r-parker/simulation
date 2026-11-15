import { describe, expect, it } from 'vitest';
import { BORN_CAUSE, DEATH_CAUSE, EVENT_TYPE, pushEvent } from '../../js/sim/events.js';
import { BURN_IN_TICKS } from '../../js/evo/observer-events.js';
import { observe } from '../../js/evo/observer.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { addBorn, nextTick, observed, pushBorn, pushDied } from './helpers/observer-world.js';

describe('observer events', () => {
    it('caches identity on AgentBorn and counts births by cause', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 2, genomeId: 7, lineageId: 3, spec: 4, cause: BORN_CAUSE.MATE, tick: 0 });
        observe(observer, world);
        expect([observer.genomeId[2], observer.lineageId[2], observer.spec[2]]).toEqual([7, 3, 4]);
        expect(observer.births[BORN_CAUSE.MATE]).toBe(1);
    });

    it('gives a child of a mated or split mother her instinct prior spec, whatever its own spec mutated to', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1, spec: 2, cause: BORN_CAUSE.FLOOR, tick: 0 });
        observe(observer, world);
        nextTick(world, 1);
        pushBorn(world, { slot: 1, genomeId: 2, spec: 4, parentA: 1, parentB: 1, cause: BORN_CAUSE.SPLIT, tick: 1 });
        observe(observer, world);
        nextTick(world, 2);
        pushBorn(world, { slot: 2, genomeId: 3, spec: 0, parentA: 2, parentB: 1, cause: BORN_CAUSE.MATE, tick: 2 });
        pushBorn(world, { slot: 3, genomeId: 4, spec: 3, parentA: 99, cause: BORN_CAUSE.MATE, tick: 2 });
        observe(observer, world);
        expect([...observer.priorSpec.subarray(0, 4)]).toEqual([2, 2, 2, 3]);
        expect([...observer.spec.subarray(0, 4)]).toEqual([2, 4, 0, 3]);
    });

    it('counts births by cause again from BURN_IN_TICKS, not before', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 1, genomeId: 5, cause: BORN_CAUSE.MATE, tick: BURN_IN_TICKS - 1 });
        pushBorn(world, { slot: 2, genomeId: 6, cause: BORN_CAUSE.SPLIT, tick: BURN_IN_TICKS });
        pushBorn(world, { slot: 3, genomeId: 7, cause: BORN_CAUSE.FLOOR, tick: BURN_IN_TICKS });
        observe(observer, world);
        expect(Array.from(observer.births)).toEqual([0, 1, 1, 1, 0]);
        expect(Array.from(observer.birthsAfterBurnIn)).toEqual([0, 0, 1, 1, 0]);
    });

    it('resets every counter when a new agent is born into a slot', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 1, genomeId: 5 });
        observe(observer, world);
        for (const name of observer.slotArrays) {
            observer[name][1] = 9;
        }
        observer.cellBits.fill(255);
        nextTick(world, 1);
        pushDied(world, { slot: 1, genomeId: 5 });
        pushBorn(world, { slot: 1, genomeId: 6, tick: 0 });
        observe(observer, world);
        expect(observer.genomeId[1]).toBe(6);
        for (const name of observer.slotArrays.filter(
            (/** @type {string} */ n) => !/^(genomeId|lineageId|sizeTrait|visionTrait)$/.test(n),
        )) {
            expect(observer[name][1], name).toBe(0);
        }
        expect([observer.sizeTrait[1], observer.visionTrait[1]]).toEqual([1, 1]);
        expect(
            observer.cellBits
                .subarray(observer.cellBytes, 2 * observer.cellBytes)
                .every((/** @type {number} */ b) => b === 0),
        ).toBe(true);
    });

    it('handles the deaths of a tick before a birth into the same slot', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1 });
        observe(observer, world);
        nextTick(world, 1);
        // The birth record comes first in the ring; the death must still see the old agent's counters.
        pushBorn(world, { slot: 0, genomeId: 2 });
        pushDied(world, { slot: 0, genomeId: 1, ageTicks: 50 });
        observer.children[0] = 4;
        observe(observer, world);
        expect(observer.deathCount).toBe(1);
        expect(observer.deaths.genomeId[0]).toBe(1);
        expect(observer.deaths.children[0]).toBe(4);
        expect(observer.genomeId[0]).toBe(2);
        expect(observer.children[0]).toBe(0);
    });

    it('credits a child once to a living parent, even when a split names it twice', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1 });
        pushBorn(world, { slot: 1, genomeId: 2 });
        observe(observer, world);
        nextTick(world, 1);
        pushBorn(world, { slot: 2, genomeId: 3, parentA: 1, parentB: 1, cause: BORN_CAUSE.SPLIT });
        pushBorn(world, { slot: 3, genomeId: 4, parentA: 1, parentB: 2, cause: BORN_CAUSE.MATE });
        observe(observer, world);
        expect([observer.children[0], observer.children[1]]).toEqual([2, 1]);
        expect([observer.childrenFromSplit[0], observer.childrenFromSplit[1]]).toEqual([1, 0]);
    });

    it('does not credit a father who died earlier', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1 });
        pushBorn(world, { slot: 1, genomeId: 2 });
        observe(observer, world);
        nextTick(world, 1);
        pushDied(world, { slot: 1, genomeId: 2 });
        observe(observer, world);
        nextTick(world, 2);
        pushBorn(world, { slot: 2, genomeId: 3, parentA: 1, parentB: 2, cause: BORN_CAUSE.MATE });
        observe(observer, world);
        expect([observer.children[0], observer.children[1]]).toEqual([1, 0]);
    });

    it('credits a mother who dies the tick she gives birth', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1 });
        observe(observer, world);
        nextTick(world, 1);
        pushBorn(world, { slot: 1, genomeId: 2, parentA: 1, parentB: 1, cause: BORN_CAUSE.SPLIT });
        pushDied(world, { slot: 0, genomeId: 1 });
        observe(observer, world);
        expect(observer.deaths.children[0]).toBe(1);
    });

    it('credits kills through `by`, even when the biter dies the same tick', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1 });
        pushBorn(world, { slot: 1, genomeId: 2 });
        observe(observer, world);
        nextTick(world, 1);
        pushDied(world, { slot: 0, genomeId: 1 });
        pushDied(world, { slot: 1, genomeId: 2, cause: DEATH_CAUSE.EATEN, by: 1 });
        observe(observer, world);
        expect(observer.kills[0]).toBe(1);
        expect(observer.deaths.fitness[0]).toBeNaN();
    });

    it('logs final values from the record, totals and the fitness computed before the reset', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 0, genomeId: 1, spec: 1 });
        observe(observer, world);
        nextTick(world, 1);
        pushDied(world, { slot: 0, genomeId: 1, cause: DEATH_CAUSE.OLD_AGE, spec: 1, ageTicks: 9, foodEnergy: 30 });
        pushDied(world, { slot: 1, genomeId: 8, cause: DEATH_CAUSE.OLD_AGE, foodEnergy: 12 });
        /** @type {number[][]} */
        const seen = [];
        observe(observer, world, (_o, slot) => {
            seen.push([slot, _o.ageTicks[slot], _o.foodEnergy[slot]]);
            return 2.5;
        });
        expect(seen).toEqual([
            [0, 9, 30],
            [1, 0, 12],
        ]);
        expect(Array.from(observer.deaths.fitness.subarray(0, 2))).toEqual([2.5, 2.5]);
        expect(observer.deathsByCause[DEATH_CAUSE.OLD_AGE]).toBe(2);
        expect(observer.foodEnergyDead).toBe(42);
    });

    it('does not track a newborn that died in the same tick', () => {
        const { world, observer } = observed();
        pushBorn(world, { slot: 3, genomeId: 9 });
        pushDied(world, { slot: 3, genomeId: 9 });
        world.tick = 1;
        observe(observer, world);
        expect(observer.deathCount).toBe(1);
        expect(observer.slotOf.has(9)).toBe(false);
    });

    it('grows the death log by doubling', () => {
        const { world, observer } = observed();
        for (let i = 0; i < 70; i++) {
            nextTick(world, i + 1);
            pushDied(world, { slot: 0, genomeId: i + 1, ageTicks: i });
            observe(observer, world);
        }
        expect(observer.deathCount).toBe(70);
        expect(observer.deaths.capacity).toBe(128);
        expect(observer.deaths.ageTicks[69]).toBe(69);
    });

    it('counts floor episodes as runs of consecutive ticks from tick 10000', () => {
        const { world, observer } = observed();
        const floorAt = (/** @type {number} */ tick) => {
            nextTick(world, tick + 1);
            pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, tick);
            observe(observer, world);
        };
        for (const tick of [9998, 9999, 10000, 10001, 10003, 10004, 10005, 10010]) {
            floorAt(tick);
        }
        expect(observer.floorEpisodes).toBe(3);
    });

    it('counts a floor tick at exactly 10000 and ignores earlier ones', () => {
        const { world, observer } = observed();
        nextTick(world, 10000);
        pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 9999);
        observe(observer, world);
        expect(observer.floorEpisodes).toBe(0);
        nextTick(world, 10001);
        pushEvent(world.events, EVENT_TYPE.POPULATION_FLOOR, 10000);
        observe(observer, world);
        expect(observer.floorEpisodes).toBe(1);
    });

    it('ignores BirthBlocked records', () => {
        const { world, observer } = observed();
        addBorn(world);
        nextTick(world, 1);
        pushEvent(world.events, EVENT_TYPE.BIRTH_BLOCKED, 0);
        expect(() => observe(observer, world)).not.toThrow();
    });

    it('feeds post-burn-in mate and split children to the pools, and logs a mature child death', () => {
        const T0 = BURN_IN_TICKS + 10;
        const { world, observer } = observed({}, { runTicks: 10 * BURN_IN_TICKS });
        const mother = addBlob(world, { genomeId: 1 });
        const father = addBlob(world, { genomeId: 2 });
        world.tick = T0;
        pushBorn(world, { slot: mother, genomeId: 1 });
        pushBorn(world, { slot: father, genomeId: 2 });
        observe(observer, world);
        nextTick(world, T0 + 1);
        const mated = addBlob(world, { genomeId: 3 });
        const split = addBlob(world, { genomeId: 4 });
        pushBorn(world, { slot: mated, genomeId: 3, parentA: 1, parentB: 2, cause: BORN_CAUSE.MATE });
        pushBorn(world, { slot: split, genomeId: 4, parentA: 1, parentB: 1, cause: BORN_CAUSE.SPLIT });
        observe(observer, world);
        expect(observer.eligibleChild[mated]).toBe(1);
        expect(observer.eligibleChild[split]).toBe(1);
        expect(observer.generation[mated]).toBe(1);
        nextTick(world, T0 + 2);
        pushDied(world, { slot: mated, genomeId: 3, ageTicks: world.config.maturityTicks + 5 });
        observe(observer, world);
        expect(observer.deathCount).toBe(1);
        expect(observer.slotOf.has(3)).toBe(false);
        nextTick(world, T0 + 3);
        pushDied(world, { slot: split, genomeId: 4, ageTicks: 5 });
        observe(observer, world);
        expect(observer.deathCount).toBe(2);
    });

    it('keeps a newborn that died in its own tick out of the merit pool after burn-in', () => {
        const { world, observer } = observed();
        world.tick = BURN_IN_TICKS + 2;
        pushBorn(world, { slot: 3, genomeId: 9, tick: BURN_IN_TICKS + 1 });
        pushDied(world, { slot: 3, genomeId: 9, ageTicks: world.config.maturityTicks + 1 });
        observe(observer, world);
        expect(observer.deathCount).toBe(1);
        expect(observer.slotOf.has(9)).toBe(false);
    });

    it('marks a newborn drawn from the archive as archive lineage', () => {
        const { world, observer } = observed();
        observer.archiveDraw = (/** @type {number} */ slot) => slot === 1;
        pushBorn(world, { slot: 1, genomeId: 5 });
        pushBorn(world, { slot: 2, genomeId: 6 });
        observe(observer, world);
        expect([observer.archiveLineage[1], observer.archiveLineage[2]]).toEqual([1, 0]);
    });

    it('tracks births and deaths in a lean observer, including a newborn that died in its tick', () => {
        const { world, observer } = observed({}, { lean: true });
        pushBorn(world, { slot: 0, genomeId: 1, cause: BORN_CAUSE.MATE });
        observe(observer, world);
        nextTick(world, 1);
        pushBorn(world, { slot: 0, genomeId: 2 });
        pushDied(world, { slot: 0, genomeId: 1, ageTicks: 7 });
        pushBorn(world, { slot: 1, genomeId: 3 });
        pushDied(world, { slot: 1, genomeId: 3 });
        observe(observer, world);
        expect(observer.deathCount).toBe(2);
        expect(observer.genomeId[0]).toBe(2);
        expect(observer.slotOf.has(3)).toBe(false);
    });
});
