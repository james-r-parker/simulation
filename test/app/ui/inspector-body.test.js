// The inspector's body rows (docs/designs/body-genes.md, T9a): the trait text and the body sense bar group.

import { describe, expect, it } from 'vitest';
import { effectRows, geneRows, SENSE_GROUP, senseGroup, traitText } from '../../../js/app/ui/inspector-body.js';

describe('traitText', () => {
    it('writes a ratio as x, an offset with its sign and a raw gene as the gene', () => {
        expect(traitText(1.125, 'ratio')).toBe('x1.13');
        expect(traitText(3.24, 'offset')).toBe('+3.2');
        expect(traitText(-3.24, 'offset')).toBe('-3.2');
        expect(traitText(0.4, 'raw')).toBe('gene 0.40');
    });
});

describe('geneRows', () => {
    it('labels a row for each trait, in order', () => {
        const traits = [
            { name: 'size', kind: 'ratio' },
            { name: 'heatBand', kind: 'offset' },
        ];
        expect(geneRows([0.9, -2], traits)).toEqual([
            { label: 'trait size', text: 'x0.90' },
            { label: 'trait heatBand', text: '-2.0' },
        ]);
    });
});

describe('senseGroup', () => {
    it('names the group and clamps each bar to -1..1', () => {
        const group = senseGroup([0.25, 3, -4], ['a', 'b', 'c']);
        expect(group.name).toBe(SENSE_GROUP);
        expect(group.bars).toEqual([
            { label: 'a', value: 0.25 },
            { label: 'b', value: 1 },
            { label: 'c', value: -1 },
        ]);
    });
});

describe('effectRows', () => {
    const effects = [
        { name: 'fat', visible: true },
        { name: 'outOfBand', visible: false },
        { name: 'spent', visible: true },
        { name: 'rallied', visible: true },
    ];

    it('makes a row for each visible effect: a dash when off, on for a whole level, a count above 1, the share between', () => {
        expect(effectRows([0.5, 1, 0, 3], effects)).toEqual([
            { label: 'effect fat', text: '0.50' },
            { label: 'effect spent', text: '-' },
            { label: 'effect rallied', text: 'x3' },
        ]);
        expect(effectRows([1, 0, 0, 0], effects)[0].text).toBe('on');
    });
});
