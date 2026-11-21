import { describe, expect, it } from 'vitest';
import { GENE_OUTPUTS, OUTPUT_INDEX, POOLED_VALUES } from '../../js/sim/brain-layout.js';
import { inputLabels, outputLabels, unitLabel } from '../../js/evo/brain-labels.js';

describe('inputLabels', () => {
    it('labels all pooled rays, food hues and body inputs in brain row order', () => {
        const labels = inputLabels();

        expect(labels).toHaveLength(92);
        expect(labels.slice(0, 6)).toEqual([
            'food.hit0.strength',
            'food.hit0.cos',
            'food.hit0.sin',
            'food.hit1.strength',
            'food.hit1.cos',
            'food.hit1.sin',
        ]);
        expect(labels.slice(POOLED_VALUES - 2, POOLED_VALUES + 3)).toEqual([
            'food.hue0',
            'food.hue1',
            'energy',
            'vel.forward',
            'vel.side',
        ]);
        expect(labels.slice(-5)).toEqual([
            'memory_a',
            'memory_b',
            'refuge.bearing_sin',
            'refuge.bearing_cos',
            'refuge.near',
        ]);
    });
});

describe('outputLabels', () => {
    it('labels gene outputs in their mapped order and omits the ungeneed split output', () => {
        expect(GENE_OUTPUTS).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 9, 10]);
        expect(outputLabels()).toEqual([
            'thrust',
            'turn',
            'sprint',
            'mate',
            'bite',
            'alarm',
            'smoke',
            'hunt',
            'memory_a',
            'memory_b',
        ]);
        expect(OUTPUT_INDEX.SPLIT).toBe(8);
    });
});

describe('unitLabel', () => {
    it('labels a hidden unit by its index', () => {
        expect(unitLabel(7)).toBe('h7');
    });
});
