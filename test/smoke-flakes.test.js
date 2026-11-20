import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectFlakes, issueBody, main, readRuns, writeFlakes } from '../scripts/lib/smoke-flakes.mjs';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

/**
 * A temporary directory under node_modules/.cache, where `@playwright/test` resolves for a config written into it.
 * @param {string} prefix directory name prefix
 * @returns {string} the new directory
 */
function tempDir(prefix) {
    mkdirSync(resolve('node_modules/.cache'), { recursive: true });
    return mkdtempSync(join(resolve('node_modules/.cache'), prefix));
}

/**
 * @param {string} status the test status Playwright reports
 * @param {string} title spec title
 * @returns {object} a JSON report with one spec in one nested suite
 */
const report = (status, title = 'draws frames') => ({
    suites: [
        {
            file: 'smoke.spec.js',
            suites: [
                {
                    specs: [
                        {
                            title,
                            file: 'smoke.spec.js',
                            tests: [
                                {
                                    status,
                                    results: [
                                        {
                                            status: 'failed',
                                            error: { message: `\u001b[31mexpected 30 frames\u001b[39m\nreceived 12` },
                                        },
                                        { status: 'passed', attachments: [{ name: 'trace', path: '/out/trace.zip' }] },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        },
    ],
});

describe('collectFlakes', () => {
    it('lists a flaky test with its first error, colours removed, and the trace of the rerun', () => {
        expect(collectFlakes(report('flaky'))).toEqual([
            {
                spec: 'smoke.spec.js',
                title: 'draws frames',
                error: 'expected 30 frames\nreceived 12',
                trace: '/out/trace.zip',
            },
        ]);
    });

    it('skips tests that passed, failed twice or were skipped', () => {
        for (const status of ['expected', 'unexpected', 'skipped']) {
            expect(collectFlakes(report(status))).toEqual([]);
        }
    });

    it('reads a flaky test with no attachments or error as a flake without a trace', () => {
        const bare = { suites: [{ specs: [{ title: 't', file: 'f', tests: [{ status: 'flaky', results: [] }] }] }] };
        expect(collectFlakes(bare)).toEqual([{ spec: 'f', title: 't', error: 'no error recorded', trace: null }]);
    });

    it('cuts a long error', () => {
        const long = report('flaky');
        /** @type {any} */ (long).suites[0].suites[0].specs[0].tests[0].results[0].error.message = 'x'.repeat(900);
        expect(collectFlakes(long)[0].error).toHaveLength(400);
    });
});

describe('files and digest', () => {
    let dir = '';
    beforeEach(() => {
        dir = tempDir('smoke-flakes-');
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('writes the flakes file for a flaky report and removes a stale one when nothing flaked', () => {
        const input = join(dir, 'report.json');
        const out = join(dir, 'smoke-flakes.json');
        writeFileSync(input, JSON.stringify(report('flaky')));
        expect(writeFlakes(input, out)).toBe(1);
        expect(JSON.parse(readFileSync(out, 'utf8'))[0].title).toBe('draws frames');
        writeFileSync(input, JSON.stringify(report('expected')));
        expect(writeFlakes(input, out)).toBe(0);
        expect(existsSync(out)).toBe(false);
    });

    it('treats a missing report as no flakes', () => {
        expect(writeFlakes(join(dir, 'none.json'), join(dir, 'out.json'))).toBe(0);
    });

    it('reads the files of several run folders and ignores folders without one', () => {
        mkdirSync(join(dir, '111'));
        mkdirSync(join(dir, '222'));
        mkdirSync(join(dir, '333'));
        writeFileSync(join(dir, '111/smoke-flakes.json'), JSON.stringify(collectFlakes(report('flaky'))));
        writeFileSync(join(dir, '222/smoke-flakes.json'), JSON.stringify(collectFlakes(report('flaky'))));
        expect(readRuns(join(dir, '111', '..'))).toHaveLength(2);
        expect(readRuns(join(dir, 'nowhere'))).toEqual([]);
    });

    it('lists each flaked spec once with its run count, the most frequent first', () => {
        const a = collectFlakes(report('flaky', 'a'));
        const b = collectFlakes(report('flaky', 'b'));
        const body = issueBody([a, b, b], 'https://example.test/runs');
        expect(body).toContain('https://example.test/runs');
        expect(body.indexOf('smoke.spec.js > b')).toBeLessThan(body.indexOf('smoke.spec.js > a'));
        expect(body).toContain('`smoke.spec.js > b`: 2 run(s). Last error: expected 30 frames');
        expect(issueBody([])).toContain('None flaked.');
    });

    it('runs the CLI modes and refuses a bad call', () => {
        const input = join(dir, 'report.json');
        writeFileSync(input, JSON.stringify(report('flaky')));
        expect(main(['report', input, join(dir, 'f.json')])).toBe(0);
        expect(main(['digest', dir, '--runs-url', 'u'])).toBe(0);
        expect(main(['nope'])).toBe(2);
    });
});

describe('the smoke config reruns a failed test once', { timeout: scaleTimeout(60_000) }, () => {
    let dir = '';
    beforeEach(() => {
        dir = tempDir('smoke-rerun-');
        writeFileSync(
            join(dir, 'playwright.config.js'),
            `import base from ${JSON.stringify(resolve('playwright.config.js'))};
export default { ...base, testDir: ${JSON.stringify(dir)}, outputDir: ${JSON.stringify(join(dir, 'out'))}, reporter: [['json', { outputFile: ${JSON.stringify(join(dir, 'report.json'))} }]] };
`,
        );
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    /**
     * Runs Playwright over the specs written to the temporary directory; no spec opens a browser.
     * @param {Record<string, string>} specs file name to spec source
     * @returns {number | null} Playwright's exit status
     */
    function playwright(specs) {
        for (const [name, source] of Object.entries(specs)) {
            writeFileSync(join(dir, name), `import { test } from '@playwright/test';\n${source}\n`);
        }
        const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PLAYWRIGHT')));
        const run = spawnSync(
            resolve('node_modules/.bin/playwright'),
            ['test', '-c', join(dir, 'playwright.config.js')],
            {
                encoding: 'utf8',
                env,
            },
        );
        return run.status;
    }

    const FLAKY = "test('flaky one', ({}, info) => { if (info.retry === 0) throw new Error('first attempt'); });";
    const BROKEN = "test('broken one', () => { throw new Error('always'); });";

    it('passes a spec that passes on the rerun and records it as a flake', () => {
        expect(playwright({ 'a.spec.js': FLAKY })).toBe(0);
        expect(writeFlakes(join(dir, 'report.json'), join(dir, 'flakes.json'))).toBe(1);
        const [flake] = JSON.parse(readFileSync(join(dir, 'flakes.json'), 'utf8'));
        expect(flake).toMatchObject({ spec: 'a.spec.js', title: 'flaky one' });
        expect(flake.error).toContain('first attempt');
    });

    it('fails a spec that fails twice and records only the flaky one', () => {
        expect(playwright({ 'a.spec.js': FLAKY, 'b.spec.js': BROKEN })).toBe(1);
        const flakes = collectFlakes(JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')));
        expect(flakes.map((f) => f.title)).toEqual(['flaky one']);
    });
});
