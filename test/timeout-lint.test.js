// The test-timeout rule of `eslint.config.js`: a Vitest timeout goes through scaleTimeout (sim-notes.md, 2026-11-16).

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const cwd = new URL('../', import.meta.url).pathname;
const eslint = new ESLint({ cwd });

/**
 * @param {string} code the source to lint
 * @param {string} [filePath] the path it pretends to live at
 * @returns {Promise<number[]>} the lines of the no-restricted-syntax errors
 */
async function flagged(code, filePath = 'test/fixture.test.js') {
    const [result] = await eslint.lintText(code, { filePath });
    return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.line);
}

const HEAD = [
    "import { describe, it, test } from 'vitest';",
    "import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';",
];

describe('the test timeout rule', () => {
    it('flags a bare number as the timeout of it, test, describe, a modifier and a factory', async () => {
        const code = [
            ...HEAD,
            "it('a', () => {}, 120000);",
            "test('b', () => {}, 60_000);",
            "describe('c', () => {}, 30000);",
            "it.skip('d', () => {}, 5000);",
            "it.each([1, 2])('e %i', () => {}, 120_000);",
            "it.runIf(true)('f', async () => {}, 60000);",
            "describe('g', { timeout: 30000 }, () => {});",
            "it.concurrent('h', { timeout: 1000 }, function () {});",
            '',
        ].join('\n');
        expect(await flagged(code)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('passes scaleTimeout, no timeout, and numbers that are not a test timeout', async () => {
        const code = [
            ...HEAD,
            "it('a', () => {}, scaleTimeout(120000));",
            "describe('b', { timeout: scaleTimeout(30_000) }, () => {});",
            "it('c', () => { setTimeout(() => {}, 1000); });",
            '/** @param {number} x */',
            'function check(x) { return x; }',
            "it('d', () => { check(1000); });",
            '',
        ].join('\n');
        expect(await flagged(code)).toEqual([]);
    });

    it('passes a local helper named test that takes no function', async () => {
        const code = [
            'const hits = [];',
            '/** @param {number} n */',
            'const test = (n) => hits.push(n);',
            'test(5000);',
            '',
        ];
        expect(await flagged(code.join('\n'))).toEqual([]);
    });

    it('leaves the Playwright specs alone', async () => {
        const code = ["import { test } from '@playwright/test';", "test('a', async () => {}, 30000);", ''].join('\n');
        expect(await flagged(code, 'test/browser/fixture.spec.js')).toEqual([]);
    });
});
