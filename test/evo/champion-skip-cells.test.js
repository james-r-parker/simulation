import { describe, expect, it } from 'vitest';
import { skipCells } from '../../js/evo/champion-skip-cells.js';
import { applyHunterReflex } from '../../js/evo/instinct.js';
import { GENE_OUTPUTS, OUTPUT_INDEX, POOLED_CHANNELS, POOLED_STRIDE, brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const layout = brainLayout(createConfig());

/**
 * @param {number} preyBite the prey-strength-to-BITE weight to set
 * @param {{kin?: number, other?: number, thrust?: number}} [more] other cells to set
 * @returns {Float32Array} a row with the hunter reflex (weight 1) and the cell set
 */
function row(preyBite, { kin = 0, other = 0, thrust } = {}) {
    const r = new Float32Array(layout.weightCount);
    applyHunterReflex(r, layout, { weight: 1, prey: true, kinPull: 0 });
    const cell = (/** @type {string} */ channel, /** @type {number} */ out) =>
        layout.wSkip +
        POOLED_CHANNELS.indexOf(channel) * POOLED_STRIDE * layout.geneOutputs +
        GENE_OUTPUTS.indexOf(out);
    r[cell('prey', OUTPUT_INDEX.BITE)] = preyBite;
    r[cell('kin', OUTPUT_INDEX.BITE)] = kin;
    r[cell('other', OUTPUT_INDEX.BITE)] = other;
    if (thrust !== undefined) {
        r[cell('prey', OUTPUT_INDEX.THRUST)] = thrust;
    }
    return r;
}

describe('skipCells', () => {
    it('reads the innate prior: prey to bite 2, to thrust 1 and to turn 1, nothing from kin or other', () => {
        const { cells, count, preyBiteBelowOne } = skipCells([row(2)], layout);
        expect(count).toBe(1);
        expect(cells['prey>BITE']).toEqual({ median: 2, min: 2 });
        expect(cells['prey>THRUST']).toEqual({ median: 1, min: 1 });
        expect(cells['prey.sin>TURN']).toEqual({ median: 1, min: 1 });
        expect(cells['kin>BITE']).toEqual({ median: 0, min: 0 });
        expect(cells['other>BITE']).toEqual({ median: 0, min: 0 });
        expect(preyBiteBelowOne).toBe(0);
    });

    it('gives the median and minimum of each cell over rows, and the share below +1', () => {
        const rows = [row(-3, { kin: -1 }), row(0.5, { other: 4 }), row(2), row(5)];
        const { cells, preyBiteBelowOne } = skipCells(rows, layout);
        expect(cells['prey>BITE']).toEqual({ median: 1.25, min: -3 });
        expect(cells['kin>BITE']).toEqual({ median: 0, min: -1 });
        expect(cells['other>BITE']).toEqual({ median: 0, min: 0 });
        expect(preyBiteBelowOne).toBe(0.5);
    });

    it('takes the middle row for an odd count and has nulls for no rows', () => {
        expect(skipCells([row(-2), row(7), row(1.5)], layout).cells['prey>BITE'].median).toBe(1.5);
        const none = skipCells([], layout);
        expect(none).toMatchObject({ count: 0, preyBiteBelowOne: null });
        expect(none.cells['prey>BITE']).toEqual({ median: null, min: null });
    });
});
