import { describe, expect, it } from 'vitest';
import {
    HASHED_AGENT_ARRAYS,
    HEARD_STRIDE,
    KERNEL_ORDER,
    OPTIONAL_AGENT_ARRAYS,
    agentArrayInfo,
    agentSpecs,
    hashedNames,
    ownedFields,
    ownerOf,
} from '../../js/sim/agent-arrays.js';

const LAYOUT = { rawInputCount: 11, inputCount: 7, outputCount: 5, hidden: 3, geneOutputs: 4, weightCount: 60 };

describe('agentSpecs', () => {
    it('sizes the arrays that follow the brain layout from it and the heard row from HEARD_STRIDE', () => {
        const strideOf = (/** @type {string} */ name) => agentSpecs(LAYOUT).find(([, n]) => n === name)?.[2];
        expect(strideOf('inputs')).toBe(11);
        expect(strideOf('pooled')).toBe(7);
        expect(strideOf('outputs')).toBe(5);
        expect(strideOf('leakRate')).toBe(3);
        expect(strideOf('fastOut')).toBe(12);
        expect(strideOf('weights')).toBe(60);
        expect(strideOf('heard')).toBe(HEARD_STRIDE);
        expect(strideOf('alive')).toBe(1);
    });

    it('names each array once', () => {
        const names = agentSpecs(LAYOUT).map(([, name]) => name);
        expect(new Set(names).size).toBe(names.length);
    });
});

describe('the lists built from the entries', () => {
    it('hash the numbered arrays by place and name the optional ones apart', () => {
        expect(HASHED_AGENT_ARRAYS.slice(0, 3)).toEqual(['alive', 'spec', 'x']);
        expect(HASHED_AGENT_ARRAYS.at(-1)).toBe('heard');
        expect(HASHED_AGENT_ARRAYS.some((name) => OPTIONAL_AGENT_ARRAYS.includes(name))).toBe(false);
    });

    it('look an array up, and say which kernel owns it and which fields of a table are the kernel to own', () => {
        expect(agentArrayInfo('alarmSeen')?.hashed).toBe(false);
        expect(agentArrayInfo('nothing')).toBeUndefined();
        expect(KERNEL_ORDER).toEqual(['brain', 'sense', 'hash', 'physics']);
        expect(ownerOf('size')).toBe('sense');
        expect(ownerOf('energy')).toBeUndefined();
        expect(ownedFields('physics', ['alive', 'x', 'vx', 'vy', 'rayCos', 'spec'])).toEqual(['vx', 'vy', 'spec']);
    });
});

describe('hashedNames', () => {
    it('lists the named places in order and leaves out an array with none', () => {
        expect(
            hashedNames([
                { name: 'b', hashed: 2 },
                { name: 'a', hashed: 1 },
                { name: 'c', hashed: 'optional' },
            ]),
        ).toEqual(['a', 'b']);
    });

    it('throws naming the array when a place is missing or repeated', () => {
        expect(() =>
            hashedNames([
                { name: 'a', hashed: 1 },
                { name: 'c', hashed: 3 },
            ]),
        ).toThrow('c is at 3');
        expect(() =>
            hashedNames([
                { name: 'a', hashed: 1 },
                { name: 'b', hashed: 1 },
            ]),
        ).toThrow('b is at 1');
    });
});
