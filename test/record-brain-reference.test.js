import { describe, expect, it } from 'vitest';
import { fixtureText, parseArgs } from '../scripts/record-brain-reference.mjs';

describe('parseArgs', () => {
    it('takes the note', () => {
        expect(parseArgs(['--note', 'pooled-v6'])).toEqual({ note: 'pooled-v6' });
    });

    it('refuses a missing or empty note and any other argument, with the usage', () => {
        for (const argv of [[], ['--note'], ['--note', ' '], ['--bogus', 'x'], ['--note', 'x', 'y']]) {
            expect(() => parseArgs(argv)).toThrow(/usage: record-brain-reference/);
        }
    });
});

describe('fixtureText', () => {
    it('writes the note first, then the per-call and stepped digests, as JSON with a trailing newline', () => {
        const text = fixtureText('why', { stepped: { s: ['b'] }, unit: { u: ['a'] } });
        expect(Object.keys(JSON.parse(text))).toEqual(['note', 'unit', 'stepped']);
        expect(JSON.parse(text)).toEqual({ note: 'why', unit: { u: ['a'] }, stepped: { s: ['b'] } });
        expect(text.endsWith('}\n')).toBe(true);
    });
});
