import { describe, expect, it } from 'vitest';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { applyEdits, silenceHook } from '../../js/evo/brain-edit.js';
import { playTrial } from '../../js/evo/memory-probe-run.js';

function layoutFixture() {
    const layout = brainLayout(createConfig({ brainHidden: 2 }));
    return { layout, weights: new Float32Array(layout.weightCount).fill(1) };
}

describe('applyEdits', () => {
    it('sets one value in each supported block without changing the input row', () => {
        const { layout, weights } = layoutFixture();
        const edited = applyEdits(weights, layout, [
            { op: 'set', block: 'wIn', row: 4, col: 1, value: 0.25 },
            { op: 'set', block: 'wRec', row: 0, col: 1, value: 0.3 },
            { op: 'set', block: 'wOut', row: 1, col: 2, value: 0.35 },
            { op: 'set', block: 'wSkip', row: 3, col: 4, value: 0.4 },
            { op: 'set', block: 'bHidden', col: 1, value: 0.45 },
            { op: 'set', block: 'bOut', col: 4, value: 0.5 },
            { op: 'set', block: 'leak', col: 0, value: 0.55 },
            { op: 'set', block: 'trait', col: 2, value: 0.6 },
        ]);

        expect(edited).not.toBe(weights);
        expect(edited[layout.wIn + 4 * layout.hidden + 1]).toBe(Math.fround(0.25));
        expect(edited[layout.wRec + 1]).toBe(Math.fround(0.3));
        expect(edited[layout.wOut + layout.geneOutputs + 2]).toBe(Math.fround(0.35));
        expect(edited[layout.wSkip + 3 * layout.geneOutputs + 4]).toBe(Math.fround(0.4));
        expect(edited[layout.bHidden + 1]).toBe(Math.fround(0.45));
        expect(edited[layout.bOut + 4]).toBe(Math.fround(0.5));
        expect(edited[layout.leakStart]).toBe(Math.fround(0.55));
        expect(edited[layout.traitStart + 2]).toBe(Math.fround(0.6));
        expect(weights.every((value) => value === 1)).toBe(true);
    });

    it('scales one gene or a complete two-dimensional row', () => {
        const { layout, weights } = layoutFixture();
        const edited = applyEdits(weights, layout, [
            { op: 'scale', block: 'wIn', row: 3, factor: 0.5 },
            { op: 'scale', block: 'trait', col: 1, factor: 2 },
        ]);

        expect(edited[layout.wIn + 3 * layout.hidden]).toBe(0.5);
        expect(edited[layout.wIn + 3 * layout.hidden + 1]).toBe(0.5);
        expect(edited[layout.wIn + 2 * layout.hidden]).toBe(1);
        expect(edited[layout.traitStart + 1]).toBe(2);
        expect(edited[layout.traitStart]).toBe(1);
    });

    it('silences all outgoing recurrent and output weights for a unit', () => {
        const { layout, weights } = layoutFixture();
        const edited = applyEdits(weights, layout, [{ op: 'silence', unit: 1 }]);

        expect(Array.from(edited.subarray(layout.wRec + layout.hidden, layout.wRec + 2 * layout.hidden))).toEqual([
            0, 0,
        ]);
        expect(
            Array.from(edited.subarray(layout.wOut + layout.geneOutputs, layout.wOut + 2 * layout.geneOutputs)),
        ).toEqual(new Array(layout.geneOutputs).fill(0));
        expect(edited[layout.wRec]).toBe(1);
        expect(edited[layout.wOut]).toBe(1);
    });

    it.each([
        [{ op: 'set', block: 'missing', col: 0, value: 1 }, /unknown block/],
        [{ op: 'set', block: 'wIn', col: 0, value: 1 }, /row must be/],
        [{ op: 'set', block: 'wIn', row: 0, col: 2, value: 1 }, /col must be/],
        [{ op: 'scale', block: 'wIn', factor: 2 }, /row must be/],
        [{ op: 'set', block: 'trait', row: 0, col: 0, value: 1 }, /has no row/],
        [{ op: 'silence', unit: 2 }, /unit must be/],
    ])('rejects invalid edit %j', (edit, message) => {
        const { layout, weights } = layoutFixture();
        expect(() => applyEdits(weights, layout, [edit])).toThrow(message);
    });
});

describe('silenceHook', () => {
    it('keeps selected fastOut rows at zero after a Hebbian brain step', () => {
        const config = createConfig({ brainHidden: 2, hebbianRate: 1 });
        const layout = brainLayout(config);
        const weights = new Float32Array(layout.weightCount).fill(0.5);
        const plan = {
            stage: {
                foods: [],
                rocks: [],
                agents: [{ role: 'subject', x: 1500, y: 2000, angle: 0, spec: 0, energy: 800 }],
            },
            timing: null,
            scent: false,
            maxTicks: 2,
            done: () => false,
            won: () => true,
        };
        const subject = { name: 'test', id: 1, spec: 0, weights, act: null };
        /** @type {number[][]} */
        const observed = [];
        const silence = silenceHook([1]);
        playTrial({
            plan,
            subject,
            controlSpec: { name: 'intact' },
            seed: 2,
            config: { brainHidden: 2, hebbianRate: 1 },
            onTick(world, slots) {
                silence(world, slots);
                const start = slots.subject[0] * layout.hidden * layout.geneOutputs + layout.geneOutputs;
                observed.push(Array.from(world.fastOut.subarray(start, start + layout.geneOutputs)));
            },
        });

        expect(observed).toHaveLength(2);
        expect(observed.every((row) => row.every((value) => value === 0))).toBe(true);
    });
});
