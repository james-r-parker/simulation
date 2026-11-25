import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { check, close, report } from '../scripts/miss-ledger.mjs';
import {
    failedTests,
    findMisses,
    parseMisses,
    renderIssueBody,
    renderMarkers,
    unresolvedMisses,
} from '../scripts/lib/miss-ledger.mjs';

/** @type {string[]} */
const made = [];

/**
 * @param {Record<string, string>} files path to content
 * @returns {string} a temporary repo root holding them
 */
function repo(files) {
    const root = mkdtempSync(join(tmpdir(), 'miss-ledger-'));
    made.push(root);
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
    }
    return root;
}

afterEach(() => {
    made.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

const JUNIT = `<testsuites><testsuite name="test/a.test.js">
<testcase classname="test/a.test.js" name="ok"></testcase>
<testcase classname="test/a.test.js" name="bad"><failure message="x"/></testcase>
<testcase classname="test/b&amp;c.test.js" name="err"><error message="boom"/></testcase>
<testcase classname="test/a.test.js" name="bad again"><failure message="y"/></testcase>
<testcase classname="test/c.test.js" name="skipped"><skipped/></testcase>
</testsuite></testsuites>`;

describe('the pure ledger', () => {
    it('names each failed or errored test file once', () => {
        expect(failedTests([JUNIT, '<testsuites></testsuites>'])).toEqual(['test/a.test.js', 'test/b&c.test.js']);
        expect(failedTests([])).toEqual([]);
    });

    it('reads a miss only against an affected run: none for a whole run or a lost list', () => {
        const reached = { mode: 'affected', tests: ['test/a.test.js'], changed: ['scripts/x.mjs'] };
        expect(findMisses(['test/a.test.js', 'test/z.test.js'], reached)).toEqual([
            { test: 'test/z.test.js', changed: ['scripts/x.mjs'] },
        ]);
        expect(findMisses(['test/z.test.js'], { mode: 'full', tests: [] })).toEqual([]);
        expect(findMisses(['test/z.test.js'], null)).toEqual([]);
        expect(findMisses(['test/z.test.js'], { mode: 'affected', tests: [] })).toEqual([
            { test: 'test/z.test.js', changed: [] },
        ]);
    });

    it('writes markers that parse back, and skips a broken one', () => {
        const misses = [
            { pr: 7, test: 'test/z.test.js', changed: ['a.js', 'b.js'] },
            { pr: null, test: 'test/y.test.js', changed: [] },
        ];
        const text = `prose\n${renderMarkers(misses)}\n<!-- affected-miss {not json} -->`;
        expect(parseMisses(text)).toEqual(misses);
        expect(parseMisses('nothing here')).toEqual([]);
    });

    it('names the commit, the jobs, the failed files and each miss in the issue', () => {
        const body = renderIssueBody({
            sha: 'abc1234',
            run: 'https://example.test/run/1',
            pr: 12,
            jobs: ['test shard-3'],
            failed: ['test/z.test.js'],
            misses: [{ test: 'test/z.test.js', changed: ['a.js'] }],
            note: '',
        });
        expect(body).toContain('red at abc1234 (pull request #12)');
        expect(body).toContain('Failed jobs: test shard-3');
        expect(body).toContain('`test/z.test.js` was not reached by 1 changed path(s)');
        expect(parseMisses(body)).toEqual([{ pr: 12, test: 'test/z.test.js', changed: ['a.js'] }]);
        const plain = renderIssueBody({
            sha: 'abc1234',
            run: 'r',
            pr: null,
            jobs: [],
            failed: [],
            misses: [],
            note: 'No pull request.',
        });
        expect(plain).toContain('Failed jobs: none named');
        expect(plain).toContain('No pull request.');
        expect(plain).not.toContain('affected-miss');
    });

    it('keeps failing a miss until the selection reaches its test from the recorded paths', () => {
        const files = {
            'scripts/x.mjs': 'export {};\n',
            'test/z.test.js': 'readFileSync(spec.file);\n// reads: none\n',
            'test/other.test.js': "import '../scripts/x.mjs';\n",
        };
        const miss = { pr: 3, test: 'test/z.test.js', changed: ['scripts/x.mjs'] };
        const lines = unresolvedMisses([miss], repo(files));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('test/z.test.js: a miss of pull request #3');
        const declared = { ...files, 'test/z.test.js': '// reads: scripts/x.mjs\nreadFileSync(spec.file);\n' };
        expect(unresolvedMisses([miss], repo(declared))).toEqual([]);
        // A test that is gone leaves nothing to reach, and a whole-suite diff is no miss.
        expect(unresolvedMisses([{ ...miss, test: 'test/gone.test.js' }], repo(files))).toEqual([]);
        expect(unresolvedMisses([{ ...miss, changed: ['package.json'] }], repo(files))).toEqual([]);
    });
});

/**
 * A `gh` stand-in: canned answers, a record of every call, and files for `run download`.
 * @param {{pulls?: object[], runs?: object[], open?: object[], jobs?: object[], affected?: object | null}} canned the answers
 * @returns {{run: (args: string[]) => string, calls: string[][]}} the runner and its calls
 */
function fakeGh({ pulls = [], runs = [], open = [], jobs = [], affected = null }) {
    /** @type {string[][]} */
    const calls = [];
    /** @param {string[]} args the arguments @returns {string} what gh would print */
    const run = (args) => {
        calls.push(args);
        const [a, b] = args;
        const dir = args[args.indexOf('--dir') + 1] ?? '';
        if (a === 'run' && b === 'view') {
            return JSON.stringify({ jobs });
        }
        if (a === 'run' && b === 'download') {
            if (args.includes('test-results-*')) {
                mkdirSync(join(dir, 'test-results-shard-3'), { recursive: true });
                writeFileSync(join(dir, 'test-results-shard-3', 'junit-shard-3.xml'), JUNIT);
            } else if (affected === null) {
                throw new Error('no artifact');
            } else {
                mkdirSync(dir, { recursive: true });
                writeFileSync(join(dir, 'affected.json'), JSON.stringify(affected));
            }
            return '';
        }
        if (a === 'api') {
            return JSON.stringify(pulls);
        }
        if (a === 'run' && b === 'list') {
            return JSON.stringify(runs);
        }
        return a === 'issue' && b === 'list' ? JSON.stringify(open) : '';
    };
    return { run, calls };
}

const ENV = { GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: 'abcdef1234567', GITHUB_RUN_ID: '99' };
const PULL = { number: 12, head: { ref: 'feat/x', sha: 'headsha' } };
const GREEN = { databaseId: 5, headSha: 'headsha', conclusion: 'success' };

describe('report', () => {
    it('opens one issue naming the failures and the misses of an affected pull request', () => {
        const gh = fakeGh({
            pulls: [PULL],
            runs: [{ databaseId: 4, headSha: 'old', conclusion: 'success' }, GREEN],
            jobs: [
                { name: 'test shard-3', conclusion: 'failure' },
                { name: 'static', conclusion: 'success' },
            ],
            affected: { mode: 'affected', tests: ['test/a.test.js'], changed: ['scripts/x.mjs'] },
        });
        /** @type {string[]} */
        const log = [];
        expect(report({ run: gh.run, env: ENV, log: (line) => log.push(line) })).toBe(0);
        const create = gh.calls.find((args) => args[0] === 'issue' && args[1] === 'create');
        expect(create?.[create.indexOf('--label') + 1]).toBe('red-main,affected-miss');
        expect(create?.[create.indexOf('--title') + 1]).toBe('main is red at abcdef1');
        expect(
            gh.calls.some((args) => args.join(' ') === 'run download 5 --name affected --dir ' + args[args.length - 1]),
        ).toBe(true);
        expect(log).toEqual(['opened main is red at abcdef1']);
    });

    it('adds a comment to the issue that is open instead of a second one', () => {
        const gh = fakeGh({
            pulls: [PULL],
            runs: [GREEN],
            open: [{ number: 40 }],
            affected: { mode: 'full', tests: [] },
        });
        /** @type {string[]} */
        const log = [];
        report({ run: gh.run, env: ENV, log: (line) => log.push(line) });
        expect(log).toEqual(['commented on #40']);
        expect(gh.calls.some((args) => args[0] === 'issue' && args[1] === 'create')).toBe(false);
    });

    it('labels the open issue affected-miss when its comment carries a miss (agent-workflow T51)', () => {
        const gh = fakeGh({
            pulls: [PULL],
            runs: [GREEN],
            open: [{ number: 40 }],
            jobs: [{ name: 'test shard-3', conclusion: 'failure' }],
            affected: { mode: 'affected', tests: ['test/a.test.js'], changed: ['scripts/x.mjs'] },
        });
        report({ run: gh.run, env: ENV, log: () => {} });
        expect(gh.calls.some((args) => args.join(' ') === 'issue edit 40 --add-label affected-miss')).toBe(true);
        expect(gh.calls.some((args) => args[0] === 'label' && args[2] === 'affected-miss')).toBe(true);
    });

    it('leaves the open issue unlabelled when its comment carries no miss', () => {
        const gh = fakeGh({
            pulls: [PULL],
            runs: [GREEN],
            open: [{ number: 40 }],
            affected: { mode: 'full', tests: [] },
        });
        report({ run: gh.run, env: ENV, log: () => {} });
        expect(gh.calls.some((args) => args[0] === 'issue' && args[1] === 'edit')).toBe(false);
    });

    it('records no miss for a whole-suite pull request, and says so when the list or the pull request is missing', () => {
        const whole = fakeGh({ pulls: [PULL], runs: [GREEN], affected: { mode: 'full', tests: [] } });
        report({ run: whole.run, env: ENV, log: () => {} });
        const label = (/** @type {{calls: string[][]}} */ gh) =>
            gh.calls.find((a) => a[1] === 'create' && a[0] === 'issue');
        expect(label(whole)?.includes('red-main')).toBe(true);
        expect(label(whole)?.join(' ')).not.toContain('affected-miss');
        const lost = fakeGh({ pulls: [PULL], runs: [], affected: null });
        report({ run: lost.run, env: ENV, log: () => {} });
        expect(lost.calls.some((a) => a[0] === 'issue' && a[1] === 'create')).toBe(true);
        const direct = fakeGh({ pulls: [] });
        report({ run: direct.run, env: ENV, log: () => {} });
        expect(direct.calls.some((a) => a[0] === 'label')).toBe(true);
    });
});

describe('check', () => {
    const marker = renderMarkers([{ pr: 3, test: 'test/z.test.js', changed: ['scripts/x.mjs'] }]);
    const files = {
        'scripts/x.mjs': 'export {};\n',
        'test/z.test.js': 'export {};\n',
        'test/other.test.js': "import '../scripts/x.mjs';\n",
    };

    it('fails while an open miss is not reached, and passes once it is declared', () => {
        const open = [{ body: `text\n${marker}` }];
        /** @type {string[]} */
        const log = [];
        expect(check({ run: fakeGh({ open }).run, root: repo(files), log: (line) => log.push(line) })).toBe(1);
        expect(log.join('\n')).toContain('test/z.test.js: a miss of pull request #3');
        const fixed = { ...files, 'test/z.test.js': '// reads: scripts/x.mjs\nexport {};\n' };
        expect(check({ run: fakeGh({ open }).run, root: repo(fixed), log: () => {} })).toBe(0);
    });

    it('passes with no open miss, and skips quietly when the issues cannot be listed', () => {
        expect(check({ run: fakeGh({ open: [] }).run, root: repo(files), log: () => {} })).toBe(0);
        /** @type {string[]} */
        const log = [];
        const broken = () => {
            throw new Error('no token');
        };
        expect(check({ run: broken, root: repo(files), log: (line) => log.push(line) })).toBe(0);
        expect(log[0]).toContain('could not be listed');
    });
});

describe('close', () => {
    const labels = (/** @type {string[]} */ ...names) => names.map((name) => ({ name }));

    it('comments with the green commit and closes each open red-main issue', () => {
        const gh = fakeGh({
            open: [
                { number: 582, labels: labels('red-main') },
                { number: 590, labels: labels('red-main') },
            ],
        });
        /** @type {string[]} */
        const log = [];
        expect(close({ run: gh.run, env: ENV, log: (line) => log.push(line) })).toBe(0);
        const list = gh.calls.find((a) => a[0] === 'issue' && a[1] === 'list');
        expect(list?.slice(list.indexOf('--label'), list.indexOf('--label') + 4)).toEqual([
            '--label',
            'red-main',
            '--state',
            'open',
        ]);
        const comment = gh.calls.find((a) => a[0] === 'issue' && a[1] === 'comment' && a[2] === '582');
        expect(comment?.[comment.indexOf('--body') + 1]).toContain('main is green at abcdef1');
        expect(gh.calls.filter((a) => a[0] === 'issue' && a[1] === 'close').map((a) => a[2])).toEqual(['582', '590']);
        expect(log).toEqual(['closed #582', 'closed #590']);
    });

    it('keeps open an issue that records an affected-test miss, and does nothing with none open', () => {
        const held = fakeGh({ open: [{ number: 7, labels: labels('red-main', 'affected-miss') }] });
        /** @type {string[]} */
        const log = [];
        close({ run: held.run, env: ENV, log: (line) => log.push(line) });
        expect(held.calls.some((a) => a[1] === 'close' || a[1] === 'comment')).toBe(false);
        expect(log).toEqual(['kept #7 open: it records an affected-test miss']);
        const none = fakeGh({});
        expect(close({ run: none.run, env: ENV, log: () => {} })).toBe(0);
        expect(none.calls.every((a) => a[1] === 'list')).toBe(true);
    });

    it('logs and still returns 0 when gh fails: a green main stays green', () => {
        /** @type {string[]} */
        const log = [];
        const run = () => {
            throw new Error('gh issue list exited 1');
        };
        expect(close({ run, env: ENV, log: (line) => log.push(line) })).toBe(0);
        expect(log[0]).toContain('could not close the open issues');
    });
});
