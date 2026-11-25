import { describe, expect, it } from 'vitest';
import LimitReporter, { nearLimit } from '../scripts/lib/limit-reporter.mjs';

const c = (name, ms, limitMs) => ({ file: 'test/x.test.js', name, ms, limitMs });

describe('nearLimit', () => {
    it('keeps a test over half its own limit, explicit limits included', () => {
        const got = nearLimit([c('quick', 100, 5000), c('explicit', 70000, 120000), c('edge', 2500, 5000)]);
        expect(got.map((t) => t.name)).toEqual(['explicit']);
    });

    it('orders by the share of the limit used, highest first', () => {
        const got = nearLimit([c('a', 3000, 5000), c('b', 119500, 120000), c('c', 40000, 60000)]);
        expect(got.map((t) => t.name)).toEqual(['b', 'c', 'a']);
    });

    it('ignores a test without a limit', () => {
        expect(nearLimit([c('none', 9000, 0)])).toEqual([]);
    });
});

/** @param {string} state @param {number} duration @param {number} timeout @returns {any} a fake Vitest test case */
function fake(state, duration, timeout) {
    return {
        fullName: 'a > b',
        module: { moduleId: '/repo/test/x.test.js' },
        options: { timeout },
        diagnostic: () => ({ duration }),
        result: () => ({ state }),
    };
}

describe('LimitReporter', () => {
    it('writes the passing tests over half their limit to TEST_LIMIT_OUT', async () => {
        const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
        const { tmpdir } = await import('node:os');
        const { join } = await import('node:path');
        const dir = mkdtempSync(join(tmpdir(), 'limit-reporter-'));
        const out = join(dir, 'limits.json');
        const before = process.env.TEST_LIMIT_OUT;
        process.env.TEST_LIMIT_OUT = out;
        try {
            const reporter = new LimitReporter();
            reporter.onInit({ config: { root: '/repo' } });
            const tests = [fake('passed', 4000, 5000), fake('failed', 4900, 5000), fake('passed', 10, 5000)];
            reporter.onTestRunEnd([{ children: { allTests: () => tests } }]);
            expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual([
                { file: 'test/x.test.js', name: 'a > b', ms: 4000, limitMs: 5000 },
            ]);
        } finally {
            if (before === undefined) {
                delete process.env.TEST_LIMIT_OUT;
            } else {
                process.env.TEST_LIMIT_OUT = before;
            }
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it('writes nothing when TEST_LIMIT_OUT is unset', () => {
        const before = process.env.TEST_LIMIT_OUT;
        delete process.env.TEST_LIMIT_OUT;
        try {
            const reporter = new LimitReporter();
            reporter.onInit({ config: { root: '/repo' } });
            expect(reporter.onTestRunEnd([])).toBeUndefined();
        } finally {
            if (before !== undefined) {
                process.env.TEST_LIMIT_OUT = before;
            }
        }
    });
});
