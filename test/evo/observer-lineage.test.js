import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { checkpoint } from '../../js/evo/observer-checkpoint.js';
import { observe } from '../../js/evo/observer.js';
import { addBorn, nextTick, observed, pushBorn } from './helpers/observer-world.js';

describe('generation depth and archive lineage', () => {
    it('is 0 for entrants and one more than the deeper parent for a child, through slotOf', () => {
        const { world, observer } = observed();
        for (const [slot, cause] of [
            [0, BORN_CAUSE.INITIAL],
            [1, BORN_CAUSE.FLOOR],
            [2, BORN_CAUSE.IMMIGRANT],
        ]) {
            pushBorn(world, { slot, genomeId: slot + 1, cause, tick: 0 });
        }
        observe(observer, world);
        nextTick(world, 1);
        pushBorn(world, { slot: 3, genomeId: 10, parentA: 1, parentB: 2, cause: BORN_CAUSE.MATE });
        observe(observer, world);
        nextTick(world, 2);
        pushBorn(world, { slot: 4, genomeId: 11, parentA: 10, parentB: 3, cause: BORN_CAUSE.MATE });
        pushBorn(world, { slot: 5, genomeId: 12, parentA: 10, parentB: 10, cause: BORN_CAUSE.SPLIT });
        observe(observer, world);
        expect(Array.from(observer.generation.subarray(0, 6))).toEqual([0, 0, 0, 1, 2, 2]);
    });

    it('marks entrants the policy drew from the archive, inherited by children', () => {
        const { world, observer } = observed();
        observer.archiveDraw = (/** @type {number} */ slot) => slot === 0;
        pushBorn(world, { slot: 0, genomeId: 1, cause: BORN_CAUSE.INITIAL, tick: 0 });
        pushBorn(world, { slot: 1, genomeId: 2, cause: BORN_CAUSE.INITIAL, tick: 0 });
        observe(observer, world);
        nextTick(world, 1);
        pushBorn(world, { slot: 2, genomeId: 3, parentA: 1, parentB: 2, cause: BORN_CAUSE.MATE });
        pushBorn(world, { slot: 3, genomeId: 4, parentA: 2, parentB: 2, cause: BORN_CAUSE.SPLIT });
        observe(observer, world);
        expect(Array.from(observer.archiveLineage.subarray(0, 4))).toEqual([1, 0, 1, 0]);
    });

    it('counts the archive-lineage agents at each checkpoint, and keeps the columns in the death log', () => {
        const { world, observer } = observed();
        observer.archiveDraw = () => true;
        const slot = addBorn(world);
        pushBorn(world, { slot, genomeId: world.genomeId[slot], cause: BORN_CAUSE.INITIAL, tick: 0 });
        observe(observer, world);
        checkpoint(observer, world);
        expect(observer.series.archiveAgents[0]).toBe(1);
        expect(observer.deathFields).toEqual(expect.arrayContaining(['birthTick', 'generation', 'archiveLineage']));
    });
});
