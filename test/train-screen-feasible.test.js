import { describe, expect, it } from 'vitest';
import { unlearnableStages, withoutUnlearnable } from '../scripts/lib/train-screen-feasible.mjs';

const stage = (/** @type {string} */ name, /** @type {boolean | null} */ learnable) => ({
    stage: name,
    drills: [],
    unchecked: [],
    learnable,
});
const plan = (/** @type {boolean} */ skipUnlearnable) =>
    /** @type {any} */ ({
        reference: 'base',
        skipUnlearnable,
        arms: [{ name: 'base' }, { name: 'a' }, { name: 'b' }],
    });
const checked = {
    base: [stage('x', false)],
    a: [stage('x', true), stage('y', null)],
    b: [stage('x', true), stage('y', false)],
};

describe('unlearnableStages', () => {
    it('names the stages that are checked and not learnable, not the ones not checked', () => {
        expect(unlearnableStages(checked.b)).toEqual(['y']);
        expect(unlearnableStages(checked.a)).toEqual([]);
    });
});

describe('withoutUnlearnable', () => {
    it('leaves every arm in unless the grid says to skip', () => {
        const out = withoutUnlearnable(plan(false), checked);
        expect(out.skipped).toEqual([]);
        expect(out.plan.arms).toHaveLength(3);
    });

    it('drops an unlearnable arm but never the reference', () => {
        const out = withoutUnlearnable(plan(true), checked);
        expect(out.skipped).toEqual(['b']);
        expect(out.plan.arms.map((a) => a.name)).toEqual(['base', 'a']);
    });
});
