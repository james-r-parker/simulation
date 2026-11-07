import { describe, expect, it } from 'vitest';
import { restoreArchive, snapshotArchive } from '../../js/evo/archive-snapshot.js';
import { createArchive, offer, placeOf } from '../../js/evo/archive.js';
import { descriptorV7 } from '../../js/evo/descriptors.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const config = createConfig({ rayCount: 2, brainHidden: 4 });
const layout = brainLayout(config);

describe('archive snapshot', () => {
    it('round-trips an archive and is independent of it', () => {
        const archive = createArchive(layout, { descriptor: descriptorV7, nCap: 5 });
        const row = new Float32Array(layout.weightCount).fill(0.5);
        offer(archive, { spec: 1, cell: 7, row, sigma: 0.2, id: 9, fitness: 3 });
        archive.cursors[2] = 4;
        const snapshot = snapshotArchive(archive);
        const back = restoreArchive(snapshot, config, { descriptor: descriptorV7, nCap: 5 });
        expect(snapshotArchive(back)).toEqual(snapshot);
        expect([back.nCap, back.descriptor.name]).toEqual([5, 'v7']);
        archive.ids[placeOf(1, 7, 0)] = 77;
        expect(back.ids[placeOf(1, 7, 0)]).toBe(9);
        back.rows[0] = 1;
        expect(snapshot.rows[0]).toBe(0);
    });

    it('names the array whose length does not fit the layout', () => {
        const snapshot = snapshotArchive(createArchive(layout));
        expect(() => restoreArchive({ ...snapshot, rows: new Float32Array(3) }, config)).toThrow(/rows has length 3/);
    });
});
