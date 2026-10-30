import { describe, expect, it } from 'vitest';
import { isMutationRate, resolveMutationRate } from '../../js/sim/mutation-rate.js';
import { randomWeights } from '../../js/evo/mutation.js';
import { brainLayout } from '../../js/sim/brain-layout.js';
import { createConfig } from '../../js/sim/config.js';
import { createRng } from '../../js/sim/rng.js';
import { leakRateOf } from '../../js/sim/traits.js';

describe('isMutationRate', () => {
    it.each([1, 0.1, 0.0001, 'invsqrt', 'genes:22', 'genes:0.5'])('accepts %s', (value) => {
        expect(isMutationRate(value)).toBe(true);
    });

    it.each([0, -1, 1.5, NaN, Infinity, 'genes:0', 'genes:', 'genes:-3', 'invsqrt ', 'sqrt', '0.5', null, true])(
        'rejects %s',
        (value) => {
            expect(isMutationRate(value)).toBe(false);
        },
    );
});

describe('resolveMutationRate', () => {
    it('passes a number through', () => {
        expect(resolveMutationRate(0.25, 4047)).toBe(0.25);
        expect(resolveMutationRate(1, 4047)).toBe(1);
    });

    it('resolves invsqrt per row length', () => {
        expect(resolveMutationRate('invsqrt', 400)).toBe(0.05);
        expect(resolveMutationRate('invsqrt', 4047)).toBeCloseTo(1 / Math.sqrt(4047), 15);
    });

    it('resolves genes:<k> to k genes per birth on any layout', () => {
        expect(resolveMutationRate('genes:22', 4400)).toBeCloseTo(22 / 4400, 15);
        expect(resolveMutationRate('genes:22', 1000) * 1000).toBeCloseTo(22, 12);
    });

    it('caps genes:<k> at 1 when k exceeds the row', () => {
        expect(resolveMutationRate('genes:50', 10)).toBe(1);
    });

    it('throws on a rule that is not valid', () => {
        expect(() => resolveMutationRate('nope', 10)).toThrow(/mutationRate/);
    });
});

describe('the mutationRate config key', () => {
    it('defaults to invsqrt, the big-bang rule (about 67 of the 4494 genes per birth)', () => {
        const config = createConfig();
        expect(config.mutationRate).toBe('invsqrt');
        expect(resolveMutationRate(config.mutationRate, brainLayout(config).weightCount) * 4494).toBeCloseTo(67.04, 1);
    });

    it('accepts the three forms and rejects the rest naming the key', () => {
        for (const value of [0.5, 'invsqrt', 'genes:22']) {
            expect(createConfig({ mutationRate: value }).mutationRate).toBe(value);
        }
        for (const value of [0, 2, 'genes:0', 'x']) {
            expect(() => createConfig({ mutationRate: value })).toThrow(/mutationRate/);
        }
    });
});

describe('weightDecay and leakGeneStart config keys', () => {
    it('default leakGeneStart to 0, the big-bang value: a random genome has a leak rate of about 0.5 from the start', () => {
        const c = createConfig();
        expect(c.leakGeneStart).toBe(0);
        const row = new Float32Array(brainLayout(c).weightCount);
        randomWeights(row, brainLayout(c), createRng(1), c.leakGeneStart);
        const layout = brainLayout(c);
        for (let j = 0; j < layout.hidden; j++) {
            expect(row[layout.leakStart + j]).toBe(0);
            expect(leakRateOf(row[layout.leakStart + j], c.leakMin)).toBeCloseTo(0.5 + c.leakMin / 2, 6);
        }
    });

    it('default weightDecay to 0, today', () => {
        expect(createConfig().weightDecay).toBe(0);
    });

    it('have bounds 0 to 0.1 and minus 4 to 4', () => {
        expect(createConfig({ weightDecay: 0.1 }).weightDecay).toBe(0.1);
        expect(createConfig({ leakGeneStart: -4 }).leakGeneStart).toBe(-4);
        expect(() => createConfig({ weightDecay: 0.11 })).toThrow(/weightDecay/);
        expect(() => createConfig({ weightDecay: -0.01 })).toThrow(/weightDecay/);
        expect(() => createConfig({ leakGeneStart: 4.5 })).toThrow(/leakGeneStart/);
    });
});
