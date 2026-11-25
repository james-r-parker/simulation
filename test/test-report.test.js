import { describe, expect, it } from 'vitest';
import { formatReport, readFailure, selectTests } from '../scripts/lib/test-report.mjs';

const ROOT = '/repo';
/** @type {(assertionResults: any[], extra?: any) => any} */
const result = (assertionResults, extra = {}) => ({
    numPassedTests: 5,
    numFailedTests: assertionResults.filter((a) => a.status === 'failed').length,
    numPendingTests: 1,
    testResults: [{ name: `${ROOT}/test/x.test.js`, status: 'failed', assertionResults }],
    ...extra,
});
const opts = { root: ROOT, defaultTimeoutMs: 5000, wallMs: 1500 };

describe('selectTests', () => {
    it('fast sets TEST_SCOPE and passes files through', () => {
        expect(selectTests({ scope: 'fast', files: ['a'], affected: null })).toMatchObject({
            env: { TEST_SCOPE: 'fast' },
            filters: ['a'],
        });
    });

    it('slow selects the slow files, or the slow sibling of a named file', () => {
        expect(selectTests({ scope: 'slow', files: [], affected: null }).filters).toEqual(['.slow.test.js']);
        expect(selectTests({ scope: 'slow', files: ['test/a.test.js'], affected: null }).filters).toEqual([
            'test/a.slow.test.js',
        ]);
    });

    it('affected narrows the list by the files, and is empty when nothing is reached', () => {
        const affected = ['test/a.test.js', 'test/b.test.js'];
        expect(selectTests({ scope: 'affected', files: [], affected }).filters).toEqual(affected);
        expect(selectTests({ scope: 'affected', files: ['b.test'], affected }).filters).toEqual(['test/b.test.js']);
        expect(selectTests({ scope: 'affected', files: [], affected: [] }).empty).toBe(true);
    });

    it('affected runs everything when the change reaches the whole suite; all always does', () => {
        expect(selectTests({ scope: 'affected', files: [], affected: null })).toMatchObject({
            filters: [],
            empty: false,
        });
        expect(selectTests({ scope: 'all', files: [], affected: ['x'] }).filters).toEqual([]);
    });

    it('rejects an unknown scope', () => {
        expect(() => selectTests({ scope: 'some', files: [], affected: null })).toThrow(/--scope/);
    });
});

describe('readFailure', () => {
    it('reads the assertion, expected/received and the first repo frame', () => {
        const message =
            'AssertionError: expected 1 to be 2\n- Expected\n+ Received\n    at /repo/test/x.test.js:9:3\n    at node_modules/y.js:1:1';
        expect(readFailure(message, ROOT)).toEqual({
            headline: 'AssertionError: expected 1 to be 2',
            detail: ['- Expected', '+ Received'],
            where: 'test/x.test.js:9',
            timeout: null,
        });
    });
});

describe('readFailure frames', () => {
    it('skips a library frame whose path only ends in test/', () => {
        const message =
            'Error: x\n at /repo/node_modules/vitest/dist/chunks/run.js:2700:1\n at /repo/test/x.test.js:4:2';
        expect(readFailure(message, ROOT).where).toBe('test/x.test.js:4');
    });
});

describe('formatReport', () => {
    it('summarises, labels timeouts and lists tests over half the limit', () => {
        const lines = formatReport(
            result([
                {
                    status: 'failed',
                    fullName: 'a > b',
                    failureMessages: ['Error: Test timed out in 5000ms.\n at /repo/test/x.test.js:3:1'],
                },
                {
                    status: 'failed',
                    fullName: 'c',
                    failureMessages: ['AssertionError: nope\n at /repo/test/x.test.js:8:1'],
                },
                { status: 'passed', fullName: 'slowish', duration: 3200 },
            ]),
            opts,
        );
        expect(lines[0]).toBe('5 passed, 2 failed, 1 skipped in 1.5 s (1 files)');
        expect(lines).toContain('TIMEOUT test/x.test.js > a > b');
        expect(lines).toContain('  timed out in 5000 ms');
        expect(lines).toContain('FAIL test/x.test.js > c');
        expect(lines).toContain('  at test/x.test.js:8');
        expect(lines.at(-1)).toBe('  3.2 s  test/x.test.js > slowish');
    });

    it("lists the reporter's near-limit tests, explicit limits included, instead of the default-limit list", () => {
        const limits = [{ file: 'test/y.test.js', name: 'long', ms: 119500, limitMs: 120000 }];
        const lines = formatReport(result([{ status: 'passed', fullName: 'slowish', duration: 3200 }]), {
            ...opts,
            limits,
        });
        expect(lines.join('\n')).toContain('119.5 s of 120 s  test/y.test.js > long');
        expect(lines.join('\n')).not.toContain('slowish');
    });

    it('reports a file that failed to load', () => {
        const json = result([], { numFailedTests: 0 });
        json.testResults[0].message = 'Error: cannot import foo';
        expect(formatReport(json, opts)).toContain('FAIL test/x.test.js (the file did not run)');
    });

    it('caps the report unless full', () => {
        const many = Array.from({ length: 30 }, (_, i) => ({
            status: 'failed',
            fullName: `t${i}`,
            failureMessages: ['Error: x'],
        }));
        expect(formatReport(result(many), opts)).toHaveLength(41);
        expect(formatReport(result(many), { ...opts, full: true })).toHaveLength(1 + 30 * 3);
    });
});
