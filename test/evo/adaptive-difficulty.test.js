import { describe, expect, it } from 'vitest';
import { nextDifficulty, pooledWinShare, validateAdapt, withPreySprint } from '../../js/evo/adaptive-difficulty.js';
import { planRun } from '../../js/evo/curriculum.js';

const ADAPT = { param: 'preySprint', drill: 'prey-ahead', from: 0.1, to: 1, step: 0.05 };

describe('nextDifficulty', () => {
    it('raises by a step above the target, lowers under half of it, holds between', () => {
        expect(nextDifficulty(ADAPT, 0.5, 0.6)).toBe(0.55);
        expect(nextDifficulty(ADAPT, 0.5, 0.2)).toBe(0.45);
        expect(nextDifficulty(ADAPT, 0.5, 0.25)).toBe(0.5);
        expect(nextDifficulty(ADAPT, 0.5, 0.5)).toBe(0.5);
        expect(nextDifficulty(ADAPT, 0.5, 0.4)).toBe(0.5);
    });

    it('holds when no champion was drilled', () => {
        expect(nextDifficulty(ADAPT, 0.5, null)).toBe(0.5);
    });

    it('clamps to from and to', () => {
        expect(nextDifficulty(ADAPT, 1, 0.9)).toBe(1);
        expect(nextDifficulty(ADAPT, 0.1, 0)).toBe(0.1);
        expect(nextDifficulty(ADAPT, 0.98, 0.9)).toBe(1);
    });

    it('takes a target and does not drift over many steps', () => {
        const strict = { ...ADAPT, target: 0.8 };
        expect(nextDifficulty(strict, 0.5, 0.7)).toBe(0.5);
        expect(nextDifficulty(strict, 0.5, 0.9)).toBe(0.55);
        let value = 0.1;
        for (let i = 0; i < 18; i++) {
            value = nextDifficulty(ADAPT, value, 1);
        }
        expect(value).toBe(1);
    });
});

describe('pooledWinShare', () => {
    const rows = [
        { cells: { a: { wins: 3, trials: 4 } } },
        { cells: { a: null } },
        { cells: { a: { wins: 1, trials: 4 } } },
        { cells: { a: { wins: 4, trials: 4 } } },
    ];

    it('pools the champions that ran the drill and ignores the reference row', () => {
        expect(pooledWinShare(rows, 3, 'a')).toBe(0.5);
    });

    it('reads null when none ran it', () => {
        expect(pooledWinShare(rows, 3, 'b')).toBeNull();
    });
});

describe('withPreySprint', () => {
    it('sets the four prey specialisations and keeps the stage overrides', () => {
        const out = withPreySprint({ worldWidth: 10, specialisations: { scout: { turnMultiplier: 0.5 } } }, 0.3);
        expect(out.worldWidth).toBe(10);
        expect(out.specialisations.scout).toEqual({ turnMultiplier: 0.5, sprintBoost: 0.3 });
        for (const name of ['forager', 'reproducer', 'defender']) {
            expect(out.specialisations[name]).toEqual({ sprintBoost: 0.3 });
        }
        expect(out.specialisations.predator).toBeUndefined();
    });

    it('works on a stage with no specialisations and does not change its input', () => {
        const base = {};
        expect(withPreySprint(base, 0.1).specialisations.forager.sprintBoost).toBe(0.1);
        expect(base).toEqual({});
    });
});

describe('the adapt key', () => {
    const gated = {
        name: 'a',
        config: null,
        gate: [{ read: 'drill.prey-ahead.edgeLow', min: 0.3 }],
        maxGenerations: 5,
    };
    const world = { name: 'w', config: null };
    const bad = (/** @type {any} */ adapt) => () => planRun([{ ...gated, adapt }, world], 20);

    it('survives planning on a gated stage', () => {
        expect(planRun([{ ...gated, adapt: ADAPT }, world], 20)[0].adapt).toEqual(ADAPT);
        expect(() => validateAdapt({ ...ADAPT, target: 0.4 }, 'x')).not.toThrow();
    });

    it('rejects a fixed stage that sets it', () => {
        expect(() => planRun([{ name: 'f', config: null, generations: 3, adapt: ADAPT }, world], 20)).toThrow(
            /"adapt" belongs to a gated/,
        );
    });

    it('rejects a malformed key', () => {
        expect(bad(3)).toThrow('"adapt" must be an object');
        expect(bad(null)).toThrow('"adapt" must be an object');
        expect(bad([])).toThrow('"adapt" must be an object');
        expect(bad({ ...ADAPT, param: 'preySpeed' })).toThrow('"adapt.param" must be one of preySprint');
        expect(bad({ ...ADAPT, drill: 'prey-weak' })).toThrow('"adapt.drill" must be one of prey-ahead');
        expect(bad({ ...ADAPT, from: -0.1 })).toThrow('"adapt.from" must be a number from 0 to 1');
        expect(bad({ ...ADAPT, to: 1.5 })).toThrow('"adapt.to" must be a number from 0 to 1');
        expect(bad({ ...ADAPT, from: '0.1' })).toThrow('"adapt.from" must be a number from 0 to 1');
        expect(bad({ ...ADAPT, from: 0.9, to: 0.5 })).toThrow('"adapt.from" must not be above "adapt.to"');
        expect(bad({ ...ADAPT, step: 0 })).toThrow('"adapt.step" must be a number above 0');
        expect(bad({ ...ADAPT, step: 2 })).toThrow('"adapt.step" must be a number above 0');
        expect(bad({ ...ADAPT, target: 1 })).toThrow('"adapt.target" must be a share above 0 and below 1');
        expect(bad({ ...ADAPT, target: 0 })).toThrow('"adapt.target"');
        expect(bad({ ...ADAPT, target: '0.5' })).toThrow('"adapt.target"');
    });
});
