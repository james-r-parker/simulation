import { describe, expect, it } from 'vitest';
import { intValue, parseFlags } from '../scripts/lib/cli-args.mjs';

const USAGE = 'usage: tool';
/** @type {import('../scripts/lib/cli-args.mjs').FlagSpec} */
const spec = {
    valueFlags: {
        '--n': (/** @type {string | undefined} */ value, /** @type {string} */ flag) => [
            'n',
            intValue(flag, value, 1, USAGE),
        ],
        '--name': (/** @type {string | undefined} */ value) => ['name', String(value)],
    },
    booleanFlags: { '--on': 'on' },
    defaults: { n: 5, name: 'x', on: false },
    usage: USAGE,
};

describe('intValue', () => {
    it('returns an integer at or above the minimum', () => {
        expect(intValue('--n', '3', 1, USAGE)).toBe(3);
        expect(intValue('--n', '0', 0, USAGE)).toBe(0);
    });

    it.each([undefined, 'x', '1.5', '0'])('rejects %s with the flag, minimum, value and usage', (text) => {
        expect(() => intValue('--n', text, 1, USAGE)).toThrow(`--n must be an integer >= 1, got: ${text}\n${USAGE}`);
    });
});

describe('parseFlags', () => {
    it('returns the defaults for no arguments, without mutating them', () => {
        expect(parseFlags([], spec)).toEqual(spec.defaults);
        parseFlags(['--on'], spec);
        expect(spec.defaults.on).toBe(false);
    });

    it('applies value and boolean flags', () => {
        expect(parseFlags(['--n', '7', '--on', '--name', 'bob'], spec)).toEqual({ n: 7, name: 'bob', on: true });
    });

    it('works without boolean flags', () => {
        expect(parseFlags(['--n', '2'], { ...spec, booleanFlags: undefined })).toMatchObject({ n: 2 });
    });

    it('rejects an unknown argument with the usage', () => {
        expect(() => parseFlags(['--nope'], spec)).toThrow(`unknown argument: --nope\n${USAGE}`);
    });

    it('propagates a value parser error', () => {
        expect(() => parseFlags(['--n'], spec)).toThrow(/--n must be an integer/);
    });
});
