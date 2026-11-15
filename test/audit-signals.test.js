import { describe, expect, it } from 'vitest';
import { parseArgs } from '../scripts/audit-signals.mjs';
import { formatInputs, formatOutputs, inputNames, mergeInputs } from '../scripts/lib/signal-report.mjs';

const row = (/** @type {number} */ index, /** @type {string} */ verdict, share = 0.5) => ({
    index,
    nonzeroShare: share,
    mean: 0.1,
    sd: 0.2,
    min: -1,
    max: 1,
    narrow: false,
    use: 1,
    verdict,
});

describe('parseArgs', () => {
    it('defaults to 16 seeds of 200000 ticks on the live policy', () => {
        expect(parseArgs([])).toMatchObject({ seeds: 16, ticks: 200000, seedOffset: 0, config: null, out: null });
    });

    it('reads every flag and refuses an unknown one', () => {
        const args = parseArgs(['--seeds', '2', '--ticks', '10', '--seed-offset', '4', '--workers', '3', '--out', 'x']);
        expect(args).toMatchObject({ seeds: 2, ticks: 10, seedOffset: 4, workers: 3, out: 'x' });
        expect(() => parseArgs(['--bogus'])).toThrow(/unknown argument/);
        expect(() => parseArgs(['--seeds', '0'])).toThrow(/>= 1/);
    });
});

describe('the report', () => {
    it('names all 92 inputs', () => {
        const names = inputNames();
        expect(names).toHaveLength(92);
        expect(names[0]).toBe('food hit1 strength');
        expect(names[56]).toBe('energy');
    });

    it('calls an input dead only when it is dead on every seed', () => {
        expect(mergeInputs([[row(0, 'dead', 0)], [row(0, 'alive')]])[0].verdict).toBe('alive');
        expect(mergeInputs([[row(0, 'dead', 0)], [row(0, 'dead', 0)]])[0].verdict).toBe('dead');
        expect(mergeInputs([[row(0, 'dead')], [row(0, 'unused')]])[0].verdict).toBe('unused');
    });

    it('prints a row per input and per output', () => {
        const text = formatInputs(mergeInputs([[row(0, 'alive'), row(1, 'dead', 0)]]));
        expect(text.split('\n')).toHaveLength(3);
        expect(text).toMatch(/food hit1 cos.*dead/);
        const out = formatOutputs([[{ name: 'BITE', nonzeroShare: 1, mean: 0, sd: 0, fireShare: 0.25 }]]);
        expect(out).toMatch(/BITE\s+1\.000\s+0\.000\s+0\.000\s+0\.250/);
    });
});
