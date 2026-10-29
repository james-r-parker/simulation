// The per-tick slot pass: a child that matures credits its grandparent and its rare lineage, and the niche checkpoint
// runs on the 1000-tick mark from burn-in.

import { describe, expect, it } from 'vitest';
import { BORN_CAUSE } from '../../js/sim/events.js';
import { noteBirthLineage } from '../../js/evo/observer-lineage-counters.js';
import { trackSlots } from '../../js/evo/observer-scenes-slots.js';
import { addBlob } from '../sim/helpers/life-world.js';
import { nextTick, observed, pushBorn } from './helpers/observer-world.js';

const T0 = 10000;

describe('trackSlots', () => {
    it('credits the grandparent and the rare lineage of a child whose age reaches maturityTicks', () => {
        const r = observed({ maturityTicks: 20 });
        const g = addBlob(r.world);
        const p = addBlob(r.world);
        const c = addBlob(r.world, { lineageId: 77, ageTicks: 20 });
        nextTick(r.world, 5);
        const [gid, pid, cid] = [g, p, c].map((s) => r.world.genomeId[s]);
        pushBorn(r.world, { slot: g, genomeId: gid });
        pushBorn(r.world, { slot: p, genomeId: pid, parentA: gid, parentB: gid, cause: BORN_CAUSE.SPLIT });
        pushBorn(r.world, { slot: c, genomeId: cid, parentA: pid, parentB: pid, cause: BORN_CAUSE.SPLIT });
        noteBirthLineage(r.observer, r.world.events.data, r.world.events.count);
        r.observer.slotOf.set(gid, g);
        r.observer.genomeId[c] = cid;
        r.observer.parentGenomeA[c] = pid;
        r.observer.scenes.niche.rare.add(77);
        r.world.tick = 6;
        trackSlots(r.observer.scenes, r.observer, r.world);
        expect(r.observer.scenes.heritage.grand[g]).toBe(1);
        expect(Array.from(r.observer.scenes.niche.matured)).toEqual([77]);
        trackSlots(r.observer.scenes, r.observer, r.world);
        expect(r.observer.scenes.heritage.grand[g]).toBe(2);
    });

    it('skips a slot the observer tracks under another genome, and every agent when maturityTicks is 0', () => {
        const r = observed({ maturityTicks: 20 });
        addBlob(r.world, { ageTicks: 20 });
        r.world.tick = 6;
        trackSlots(r.observer.scenes, r.observer, r.world);
        expect(r.observer.scenes.heritage.grand[0]).toBe(0);
        const none = observed();
        addBlob(none.world, { ageTicks: 0 });
        none.observer.scenes.niche.rare.add(1);
        none.world.tick = 6;
        trackSlots(none.observer.scenes, none.observer, none.world);
        expect(none.observer.scenes.niche.matured.size).toBe(0);
    });

    it('takes the niche checkpoint on each 1000th tick from burn-in and no other', () => {
        const r = observed();
        addBlob(r.world, { lineageId: 5 });
        for (const [tick, rare] of [
            [T0 - 1000, 0],
            [T0 + 1, 0],
            [T0, 1],
        ]) {
            r.world.tick = tick;
            trackSlots(r.observer.scenes, r.observer, r.world);
            expect(r.observer.scenes.niche.rare.size, String(tick)).toBe(rare);
        }
    });
});
