import { describe, expect, it } from 'vitest';
import { classifyChecks, callBudget, MAX_CALL_S, MIN_POLL_S, parseInterval } from '../scripts/lib/ci-checks.mjs';
import { cleanLines, DEFAULT_CAP, parsePerfFails, parseTestFailures, summariseJob } from '../scripts/lib/ci-log.mjs';

const E = '\u001b';
const stamp = (i, text) => `\uFEFF2026-11-22T10:06:57.${String(i).padStart(7, '0')}Z ${text}`;
const fixture = (rows) => rows.map((r, i) => stamp(i, r)).join('\n');

const TIMEOUT_LOG = fixture([
    `${E}[32m   ✓${E}[39m ok 12ms`,
    `${E}[31m⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯${E}[39m`,
    ` ${E}[41m${E}[1m FAIL ${E}[22m${E}[49m test/evo/a.test.js > playIdle > a sitter lives`,
    `${E}[31mError: Test timed out in 5000ms.${E}[39m`,
    'If this is a long-running test, pass a timeout value as the last argument.',
    ` ${E}[90m ❯ test/evo/a.test.js:12:5${E}[39m`,
    '##[error]Process completed with exit code 1.',
]);

const ASSERT_LOG = fixture([
    ' FAIL  test/sim/b.test.js > rng > repeats',
    `${E}[1m${E}[31mAssertionError: expected 3 to be 4${E}[39m${E}[22m`,
    '- Expected',
    '+ Received',
    '',
    ' ❯ test/sim/b.test.js:7:20',
    ' FAIL  test/sim/b.test.js > rng > repeats',
    '| `ref` | FAIL | 0/2 |',
    'perf: step 4.2 ms FAIL (limit 3.3)',
]);

describe('cleanLines', () => {
    it('strips ANSI escapes, the BOM and the timestamps', () => {
        expect(cleanLines(TIMEOUT_LOG)[0]).toBe('   ✓ ok 12ms');
    });
});

describe('summariseJob', () => {
    it('labels a timeout, names the test and its file:line', () => {
        expect(summariseJob('test shard-3', TIMEOUT_LOG)).toEqual([
            '== test shard-3',
            'TIMEOUT test/evo/a.test.js > playIdle > a sitter lives',
            '  timed out in 5000 ms (not an assertion: a slow runner, or a slow test)',
            '  at test/evo/a.test.js:12:5',
        ]);
    });

    it('prints the first assertion and the expected/received lines, once per test', () => {
        const lines = summariseJob('test', ASSERT_LOG);
        expect(lines.filter((l) => l.startsWith('FAIL'))).toHaveLength(1);
        expect(lines).toContain('  AssertionError: expected 3 to be 4');
        expect(lines).toContain('  - Expected');
        expect(lines).toContain('PERF perf: step 4.2 ms FAIL (limit 3.3)');
    });

    it('ignores table rows with FAIL in them', () => {
        expect(parsePerfFails(cleanLines(ASSERT_LOG))).toEqual(['perf: step 4.2 ms FAIL (limit 3.3)']);
    });

    it('falls back to error annotations, then to a note', () => {
        expect(summariseJob('check', fixture(['##[error]Lint failed in x.js']))).toEqual([
            '== check',
            'ERROR Lint failed in x.js',
        ]);
        expect(summariseJob('check', 'nothing here')[1]).toMatch(/no failing test/);
    });

    it('caps at 40 lines unless full', () => {
        const many = fixture(
            Array.from(
                { length: 30 },
                (_, i) => ` FAIL  test/t${i}.test.js > n\nError: boom\n ❯ test/t${i}.test.js:1:1`,
            ),
        );
        expect(summariseJob('j', many)).toHaveLength(DEFAULT_CAP + 1);
        expect(summariseJob('j', many).at(-1)).toMatch(/--full/);
        expect(summariseJob('j', many, { full: true }).length).toBeGreaterThan(DEFAULT_CAP + 1);
    });

    it('parses each failed test once', () => {
        expect(parseTestFailures(cleanLines(ASSERT_LOG))).toHaveLength(1);
    });
});

describe('ci checks', () => {
    it('treats an empty list as pending, never green', () => {
        expect(classifyChecks([])).toBe('pending');
    });

    it('is green only when every check passed or was skipped', () => {
        expect(classifyChecks([{ bucket: 'pass' }, { bucket: 'skipping' }])).toBe('green');
        expect(classifyChecks([{ bucket: 'pass' }, { bucket: 'pending' }])).toBe('pending');
        expect(classifyChecks([{ bucket: 'pending' }, { bucket: 'fail' }])).toBe('red');
    });

    it('refuses a poll interval under 120 s', () => {
        expect(parseInterval(undefined)).toBe(MIN_POLL_S);
        expect(parseInterval('300')).toBe(300);
        expect(() => parseInterval('30')).toThrow(/at least 120/);
        expect(() => parseInterval('x')).toThrow();
    });

    it('holds one call under the foreground limit', () => {
        expect(callBudget(undefined)).toEqual({ budget: MAX_CALL_S, capped: false });
        expect(callBudget(3600)).toEqual({ budget: MAX_CALL_S, capped: true });
        expect(callBudget(60)).toEqual({ budget: 60, capped: false });
    });
});
