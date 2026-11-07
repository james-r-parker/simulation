import { describe, expect, it } from 'vitest';
import { SKIP_CELLS, skipCells } from '../js/evo/champion-skip-cells.js';
import { applyHunterReflex } from '../js/evo/instinct.js';
import { brainLayout } from '../js/sim/brain-layout.js';
import { createConfig } from '../js/sim/config.js';
import { formatSkipCells, genomeSkipCells } from '../scripts/lib/skip-cells-report.mjs';

const config = createConfig();
const layout = brainLayout(config);
const reflexRow = () => {
    const row = new Float32Array(layout.weightCount);
    applyHunterReflex(row, layout, { weight: 1, prey: true, kinPull: 0 });
    return row;
};

describe('formatSkipCells', () => {
    it('prints a header with every cell, then a line per labelled set', () => {
        const lines = formatSkipCells([
            { label: 'champions', skip: skipCells([reflexRow(), new Float32Array(layout.weightCount)], layout) },
        ]);
        expect(lines).toHaveLength(2);
        for (const cell of SKIP_CELLS) {
            expect(lines[0]).toContain(cell.name);
        }
        expect(lines[1]).toContain('champions');
        expect(lines[1]).toContain('+1.00 / +0.00');
        expect(lines[1].endsWith('0.50')).toBe(true);
    });

    it('prints dashes for a set with no rows', () => {
        const [, line] = formatSkipCells([{ label: 'none', skip: skipCells([], layout) }]);
        expect(line).toContain('- / -');
        expect(line.endsWith('-')).toBe(true);
    });
});

describe('genomeSkipCells', () => {
    it('reads only the genomes that can hunt, and is null when there are none', () => {
        const genome = (/** @type {number} */ spec) => ({ weights: reflexRow(), spec });
        expect(genomeSkipCells([genome(0)], config)).toBeNull();
        expect(
            genomeSkipCells(
                [genome(0), genome(1), { weights: null, spec: 1 }, { weights: reflexRow(), spec: null }],
                config,
            )?.json.champions.count,
        ).toBe(1);
    });
});
