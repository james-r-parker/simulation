import { describe, expect, it } from 'vitest';
import { canonicalOptions, mergeOptions, validatePolicyOptions } from '../../js/evo/policy-options.js';

describe('validatePolicyOptions', () => {
    it('accepts none, and every option the map-elites-v6 policy takes', () => {
        expect(validatePolicyOptions('map-elites-v6', undefined)).toEqual({});
        expect(validatePolicyOptions('baseline-v5', {})).toEqual({});
        const options = {
            fitnessOverrides: { BORN: 5 },
            archiveShare: 0.2,
            cloneShareEnd: 0.6,
            descriptor: 'v1',
        };
        expect(validatePolicyOptions('map-elites-v6', options)).toEqual(options);
    });

    it('lets baseline-v5 take no options and map-elites-v6 the immigrant mix', () => {
        expect(validatePolicyOptions('map-elites-v6', { archiveShare: 0.1 })).toEqual({ archiveShare: 0.1 });
        expect(() => validatePolicyOptions('baseline-v5', { archiveShare: 0.1 })).toThrow(/takes: none/);
    });

    it('names a fitness weight that is not in FITNESS_V6', () => {
        expect(() => validatePolicyOptions('map-elites-v6', { fitnessOverrides: { NOPE: 1 } })).toThrow(
            /fitnessOverrides\.NOPE is not a fitnessV6 weight; known: .*BORN/,
        );
        expect(() => validatePolicyOptions('map-elites-v6', { fitnessOverrides: { BORN: 'x' } })).toThrow(
            /fitnessOverrides\.BORN must be a finite number/,
        );
        expect(() => validatePolicyOptions('map-elites-v6', { fitnessOverrides: [] })).toThrow(
            /fitnessOverrides must be an object/,
        );
    });

    it('names a descriptor that is not registered', () => {
        expect(() => validatePolicyOptions('map-elites-v6', { descriptor: 'v6' })).toThrow(
            /descriptor "v6" is not registered; known: v1, v7/,
        );
    });

    it('checks the shares against each other and against the defaults', () => {
        expect(() => validatePolicyOptions('map-elites-v6', { archiveShare: 0.9 })).toThrow(
            /archiveShare 0.9 must be from 0 to cloneShareEnd \(0.8\)/,
        );
        expect(() => validatePolicyOptions('map-elites-v6', { cloneShareEnd: 1.5 })).toThrow(
            /cloneShareEnd 1.5 must be at most 1/,
        );
        expect(() => validatePolicyOptions('map-elites-v6', { cloneShareEnd: 0.4 })).toThrow(/archiveShare 0.5/);
        expect(() => validatePolicyOptions('map-elites-v6', { archiveShare: 'a' })).toThrow(
            /archiveShare must be a finite number/,
        );
    });

    it('names an option the policy does not take, and a non-object', () => {
        expect(() => validatePolicyOptions('map-elites-v6', { cellsDraw: 2 })).toThrow(/does not take "cellsDraw"/);
        expect(() => validatePolicyOptions('map-elites-v6', [])).toThrow(/must be an object/);
    });
});

describe('canonicalOptions and mergeOptions', () => {
    it('writes equal options as equal text whatever the key order', () => {
        expect(canonicalOptions({ b: { y: 1, x: 2 }, a: 1 })).toBe(canonicalOptions({ a: 1, b: { x: 2, y: 1 } }));
        expect(canonicalOptions({ a: 1 })).not.toBe(canonicalOptions({ a: 2 }));
        expect(canonicalOptions(undefined)).toBe('{}');
        expect(canonicalOptions({ list: [{ b: 1, a: 2 }, 'x'] })).toBe('{"list":[{"a":2,"b":1},"x"]}');
    });

    it('lays arm options over the base, merging fitness weights one by one', () => {
        expect(
            mergeOptions(
                { archiveShare: 0.1, fitnessOverrides: { BORN: 1, MATURED: 2 } },
                { cloneShareEnd: 0.9, fitnessOverrides: { BORN: 3 } },
            ),
        ).toEqual({ archiveShare: 0.1, cloneShareEnd: 0.9, fitnessOverrides: { BORN: 3, MATURED: 2 } });
        expect(mergeOptions(undefined, undefined)).toEqual({});
    });
});
