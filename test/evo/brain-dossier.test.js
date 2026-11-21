import { describe, expect, it } from 'vitest';
import { brainLayout, POOLED_VALUES } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { inputLabels, outputLabels, unitLabel } from '../../js/evo/brain-labels.js';
import { skipTable, traitRow, unitTable } from '../../js/evo/brain-dossier.js';

function fixture() {
    const config = createConfig({ brainHidden: 2 });
    const layout = brainLayout(config);
    const weights = new Float32Array(layout.weightCount);
    const labels = {
        inputs: inputLabels(),
        outputs: outputLabels(),
        units: Array.from({ length: layout.hidden }, (_, unit) => unitLabel(unit)),
    };
    return { layout, weights, labels };
}

describe('unitTable', () => {
    it('orders strongest input and recurrent weights and reports every outgoing gene', () => {
        const { layout, weights, labels } = fixture();
        weights[layout.bHidden] = 0.25;
        weights[layout.leakStart] = 0.75;
        weights[layout.wIn + 9 * layout.hidden] = 0.8;
        weights[layout.wIn + 60 * layout.hidden] = -0.9;
        weights[layout.wIn + 3 * layout.hidden] = 0.4;
        weights[layout.wRec + layout.hidden] = -0.6;
        weights[layout.wRec + layout.hidden + 1] = 0.2;
        weights[layout.wOut] = 0.33;

        const rows = unitTable(weights, layout, labels, { top: 2 });

        expect(rows[0]).toMatchObject({ unit: 'h0', leak: 0.75, bias: 0.25 });
        expect(rows[0].incoming.input).toEqual([
            { label: labels.inputs[60], row: 60, value: Math.fround(-0.9) },
            { label: labels.inputs[9], row: 9, value: Math.fround(0.8) },
        ]);
        expect(rows[0].incoming.recurrent).toEqual([
            { label: 'h1', row: 1, value: Math.fround(-0.6) },
            { label: 'h0', row: 0, value: 0 },
        ]);
        expect(rows[0].outgoing).toHaveLength(10);
        expect(rows[0].outgoing[0]).toMatchObject({ label: 'thrust', output: 0, value: Math.fround(0.33) });
        expect(weights[layout.wIn + 60 * layout.hidden]).toBe(Math.fround(-0.9));
    });
});

describe('skipTable', () => {
    it('reports only pooled skip weights in descending magnitude order', () => {
        const { layout, weights, labels } = fixture();
        const bite = labels.outputs.indexOf('bite');
        weights[layout.bOut + bite] = -0.15;
        weights[layout.wSkip + 4 * layout.geneOutputs + bite] = -0.8;
        weights[layout.wSkip + 2 * layout.geneOutputs + bite] = 0.6;
        weights[layout.wSkip + layout.geneOutputs + bite] = 0.1;

        const rows = skipTable(weights, layout, labels, { top: 2 });

        expect(rows[bite]).toMatchObject({ label: 'bite', output: 4, bias: Math.fround(-0.15) });
        expect(rows[bite].weights).toEqual([
            { label: labels.inputs[4], row: 4, value: Math.fround(-0.8) },
            { label: labels.inputs[2], row: 2, value: Math.fround(0.6) },
        ]);
        expect(rows[bite].weights.every((/** @type {{row: number}} */ weight) => weight.row < POOLED_VALUES)).toBe(
            true,
        );
    });
});

describe('traitRow', () => {
    it('returns all trait genes by name', () => {
        const { layout, weights } = fixture();
        weights.set([0.1, 0.2, 0.3, 0.4], layout.traitStart);

        expect(traitRow(weights, layout)).toEqual({
            size: Math.fround(0.1),
            vision: Math.fround(0.2),
            child_share: Math.fround(0.3),
            learn: Math.fround(0.4),
        });
    });
});
