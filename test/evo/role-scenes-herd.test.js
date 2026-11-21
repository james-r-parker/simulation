import { describe, expect, it } from 'vitest';
import { createConfig } from '../../js/sim/config.js';
import { measureStampede, playStampede } from '../../js/evo/role-scenes-herd.js';

const world = createConfig({});

describe('playStampede with a body that stands', () => {
    it('is trampled when the front arrives: at tick 59 for a forager, 74 for a scout, 49 for a defender facing away', () => {
        expect(playStampede(world, { spec: 'forager', facing: 'herd', run: false }).ticks.arrival).toBe(59);
        expect(playStampede(world, { spec: 'scout', facing: 'herd', run: false }).ticks.arrival).toBe(74);
        expect(playStampede(world, { spec: 'defender', facing: 'away', run: false }).ticks.arrival).toBe(49);
    });

    it('loses about 300 energy to the first trample and is trampled again as the herd carries it', () => {
        const r = playStampede(world, { spec: 'forager', facing: 'herd', run: false });
        expect(r.outcome.firstLoss).toBeGreaterThan(290);
        expect(r.outcome.firstLoss).toBeLessThan(320);
        expect(r.outcome.tramples).toBeGreaterThan(1);
        expect(r.ticks.seen).toBe(0);
        expect(r.ticks.clear).toBeNull();
    });
});

describe('playStampede with a body that runs for the flank', () => {
    it('clears the half-width before the front arrives and is not trampled, sprinting or at cruise', () => {
        const sprint = playStampede(world, { spec: 'forager', facing: 'herd', run: true, sprint: true });
        const cruise = playStampede(world, { spec: 'forager', facing: 'herd', run: true, sprint: false });
        expect(sprint.outcome.tramples).toBe(0);
        expect(cruise.outcome.tramples).toBe(0);
        expect(sprint.ticks.clear).toBeLessThan(/** @type {number} */ (cruise.ticks.clear));
        expect(sprint.ticks.arrival).toBeNull();
    });

    it('a slow reaction costs it the escape: 40 ticks late, it is trampled', () => {
        const late = playStampede(world, { spec: 'forager', facing: 'herd', run: true, reaction: 40 });
        expect(late.outcome.tramples).toBeGreaterThan(0);
    });

    it('replays bit for bit', () => {
        const a = playStampede(world, { spec: 'reproducer', facing: 'away', run: true });
        expect(playStampede(world, { spec: 'reproducer', facing: 'away', run: true })).toEqual(a);
    });
});

describe('measureStampede', () => {
    it('reads the herd on its own after the fix of the held centroid: 2227 px in 360 ticks, a peak speed of 6.5', () => {
        const m = measureStampede(world);
        expect(m.centroid).toBeGreaterThan(2200);
        expect(m.centroid).toBeLessThan(2250);
        expect(m.centroid80).toBeGreaterThan(380);
        expect(m.peakSpeed).toBeCloseTo(6.5, 3);
        expect(m.halfWidth.start).toBeCloseTo(224.09, 1);
        expect(m.halfWidth.end).toBeLessThan(260);
    });
});
