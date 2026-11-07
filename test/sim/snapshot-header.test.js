// The snapshot header's drought word (renderer-event-effects Phase 3): the renderer's drought haze reads it.
import { describe, expect, it } from 'vitest';
import { createSnapshotViews, snapshotLayout, writeSnapshot } from '../../js/sim/snapshot.js';
import { smallWorld } from './helpers/small-world.js';

describe('the drought header word', () => {
    it('holds the basin under drought plus 1, 0 when none', () => {
        const world = smallWorld();
        const views = createSnapshotViews(new ArrayBuffer(snapshotLayout(world.config).bytes));
        writeSnapshot(world, views);
        expect(views.u32[9]).toBe(0);
        world.era[0] = 1;
        writeSnapshot(world, views);
        expect(views.u32[9]).toBe(2);
    });
});
