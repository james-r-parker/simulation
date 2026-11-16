import { describe, expect, it } from 'vitest';
import { seedArchive } from '../../../js/evo/archive.js';
import { snapshotArchive } from '../../../js/evo/archive-snapshot.js';
import { DESCRIPTORS } from '../../../js/evo/descriptors.js';
import { checkOpponents, createPoolDraw, restoreOpponents } from '../../../js/evo/policies/map-elites-pool.js';
import { createTrainerArchive } from '../../../js/evo/trainer.js';
import { createConfig } from '../../../js/sim/config.js';
import { createRng } from '../../../js/sim/rng.js';

const config = createConfig({});

/**
 * @param {number} fill the weight of the elite
 * @returns {import('../../../js/evo/archive-snapshot.js').ArchiveSnapshot} a snapshot with a forager elite (spec 0) only
 */
function snapshotOf(fill) {
    const archive = createTrainerArchive(config);
    const weights = new Float32Array(archive.layout.weightCount).fill(fill);
    seedArchive(archive, { spec: 0, cell: 2, id: 41, sigma: 0.1, weights });
    return snapshotArchive(archive);
}

describe('checkOpponents', () => {
    it('accepts none and a share from 0 to 1, and names the option when the share is outside', () => {
        expect(() => checkOpponents(undefined)).not.toThrow();
        expect(() => checkOpponents({ archives: [], share: 0 })).not.toThrow();
        expect(() => checkOpponents({ archives: [], share: 1 })).not.toThrow();
        expect(() => checkOpponents({ archives: [], share: 1.01 })).toThrow(/opponents share 1\.01/);
        expect(() => checkOpponents({ archives: [], share: Number.NaN })).toThrow(/opponents share/);
    });
});

describe('restoreOpponents', () => {
    it('is undefined without the option and restores each snapshot as an archive otherwise', () => {
        expect(restoreOpponents(undefined, config, DESCRIPTORS.v7)).toBeUndefined();
        const restored = restoreOpponents(
            { snapshots: [snapshotOf(0.5), snapshotOf(0.25)], share: 0.3 },
            config,
            DESCRIPTORS.v7,
        );
        expect(restored?.share).toBe(0.3);
        expect(restored?.archives).toHaveLength(2);
        expect(restored?.archives[1].descriptor.name).toBe(DESCRIPTORS.v7.name);
    });

    it('refuses a snapshot that does not fit the layout, naming the array', () => {
        const other = createConfig({ brainHidden: 8 });
        expect(() => restoreOpponents({ snapshots: [snapshotOf(0.5)], share: 1 }, other, DESCRIPTORS.v7)).toThrow(
            /length/,
        );
    });
});

describe('createPoolDraw', () => {
    const world = { spec: Int32Array.of(0, 3) };
    /** @param {number} share the share @returns {ReturnType<typeof createPoolDraw>} a draw over one snapshot */
    const drawOf = (share) =>
        createPoolDraw(restoreOpponents({ snapshots: [snapshotOf(0.5)], share }, config, DESCRIPTORS.v7));

    it('draws no random number and no elite with no pool, an empty one or a share of 0', () => {
        const rng = createRng(3);
        const before = Array.from(rng.s);
        for (const draw of [createPoolDraw(undefined), drawOf(0), createPoolDraw({ archives: [], share: 1 })]) {
            expect(draw.draw(world, 0, rng)).toBeNull();
        }
        expect(Array.from(rng.s)).toEqual(before);
    });

    it('clones an elite of the slot specialisation at a share of 1 and does not advance the stream it is given', () => {
        const draw = drawOf(1);
        const rng = createRng(3);
        const before = Array.from(rng.s);
        const ref = draw.draw(world, 0, rng);
        expect(ref?.id).toBe(41);
        expect(Array.from(ref?.row ?? []).every((w) => w === 0.5)).toBe(true);
        expect(Array.from(rng.s)).toEqual(before);
        expect(draw.draw(world, 1, rng)).toBeNull();
        expect(draw.founders.size).toBe(0);
    });

    it('draws the share of the time at a share between 0 and 1', () => {
        const draw = drawOf(0.4);
        const rng = createRng(8);
        let drawn = 0;
        for (let i = 0; i < 2000; i++) {
            drawn += draw.draw(world, 0, rng) === null ? 0 : 1;
        }
        expect(drawn / 2000).toBeGreaterThan(0.36);
        expect(drawn / 2000).toBeLessThan(0.44);
    });
});
