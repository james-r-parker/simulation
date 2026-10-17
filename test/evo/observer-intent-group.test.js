import { describe, expect, it } from 'vitest';
import { sampleGroups } from '../../js/evo/observer-intent-group.js';
import { FORAGER, PREDATOR, intentArena } from './helpers/intent-world.js';
import { addBorn } from './helpers/observer-world.js';

describe('sampleGroups', () => {
    it('pools the kin counts around threatened and unthreatened agents without canHunt', () => {
        const { world, intent } = intentArena({ callRadius: 100 });
        const a = addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 150, y: 100 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 190 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 201 });
        addBorn(world, { spec: FORAGER, lineageId: 6, x: 120, y: 100 });
        addBorn(world, { spec: PREDATOR, lineageId: 5, x: 110, y: 100 });
        intent.threatProx[a] = 0.5;
        sampleGroups(intent, world);
        expect([intent.run.groupThreatSum, intent.run.groupThreatN]).toEqual([2, 1]);
        expect([intent.run.groupCalmSum, intent.run.groupCalmN]).toEqual([4, 4]);
    });

    it('leaves the threatened sums at 0 when no agent is threatened, and skips dead slots', () => {
        const { world, intent } = intentArena({ callRadius: 100 });
        addBorn(world, { spec: FORAGER, lineageId: 5, x: 100, y: 100 });
        const b = addBorn(world, { spec: FORAGER, lineageId: 5, x: 110, y: 100 });
        world.alive[b] = 0;
        intent.threatProx[b] = 0.9;
        sampleGroups(intent, world);
        expect([intent.run.groupThreatN, intent.run.groupCalmN, intent.run.groupCalmSum]).toEqual([0, 1, 0]);
    });
});
