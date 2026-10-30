import { describe, expect, it } from 'vitest';
import { decaySilentInputs } from '../../js/evo/weight-decay.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';

const layout = brainLayout(createConfig({ brainHidden: 5 }));

/** @returns {Float32Array} a row where every gene is its own index plus 1 */
function counted() {
    return Float32Array.from({ length: layout.weightCount }, (_, i) => i + 1);
}

describe('decaySilentInputs', () => {
    it('shrinks only the wIn rows of the silent inputs, by 1 - decay', () => {
        const row = counted();
        const before = counted();
        const silent = new Uint8Array(layout.inputCount);
        silent[3] = 1;
        silent[80] = 1;
        decaySilentInputs(row, { layout, silent, decay: 0.1 });
        for (let g = 0; g < layout.weightCount; g++) {
            const input = g < layout.wRec ? Math.floor(g / 5) : -1;
            const hit = input === 3 || input === 80;
            expect(row[g]).toBe(hit ? Math.fround(before[g] * 0.9) : before[g]);
        }
    });

    it('leaves wRec, biases, wOut, trait genes and leak genes alone, and live inputs', () => {
        const row = counted();
        const silent = new Uint8Array(layout.inputCount).fill(1);
        decaySilentInputs(row, { layout, silent, decay: 0.5 });
        expect(row.subarray(layout.wRec)).toEqual(counted().subarray(layout.wRec));
        expect(row[0]).toBe(0.5);
        const live = counted();
        decaySilentInputs(live, { layout, silent: new Uint8Array(layout.inputCount), decay: 0.5 });
        expect(live).toEqual(counted());
    });

    it('is the identity at decay 0', () => {
        const row = counted();
        decaySilentInputs(row, { layout, silent: new Uint8Array(layout.inputCount).fill(1), decay: 0 });
        expect(row).toEqual(counted());
    });
});
