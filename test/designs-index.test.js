import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONCERNS } from '../scripts/design-docs/lint-tables.mjs';
import { buildIndex, DesignDocError, main, parseDoc } from '../scripts/designs-index.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * A valid Proposed doc, with parts replaceable per test.
 * @param {{status?: string, priority?: string, targets?: string, tasks?: string, delivery?: string, body?: string}} [parts]
 */
function proposed(parts = {}) {
    return [
        '# Sample feature',
        '',
        `**Status:** ${parts.status ?? 'Proposed - phase 1 first.'}`,
        '**Validated:** f68041f (2026-10-11)',
        parts.priority ?? '**Priority:** 1 - first',
        '',
        parts.body ?? 'The feature does a thing.',
        '',
        '### Phase 1 - Build it',
        '',
        parts.targets ?? '**Targets:** bench.step_ms@500, eval.food_energy_per_1k',
        '',
        '## Delivery requirements',
        '',
        '| Concern | Requirement |',
        '| ------- | ----------- |',
        parts.delivery ?? '| Architecture | `js/sim/world.js` |',
        ...CONCERNS.slice(1).map((concern) => `| ${concern} | N/A - sample |`),
        '',
        '## Task breakdown',
        '',
        '### Phase 1 - Build it',
        '',
        '| #  | Task | Nature | Depends on |',
        '| -- | ---- | ------ | ---------- |',
        parts.tasks ?? '| T1 | Build | [judgement] | - |\n| T2 | Conformance review of Phase 1 | [judgement] | T1 |',
        '',
    ].join('\n');
}

/** @param {string} body */
const parse = (body) => parseDoc('sample.md', body);

describe('parseDoc', () => {
    it('reads status, stamp, priority and dependencies', () => {
        const doc = parse(
            proposed({ priority: '**Priority:** 2 - after the core.\n**Depends on:** [core.md](core.md)' }),
        );
        expect(doc).toMatchObject({
            title: 'Sample feature',
            keyword: 'Proposed',
            detail: 'phase 1 first',
            validated: { sha: 'f68041f', date: '2026-10-11' },
            priority: { rank: 2, reason: 'after the core' },
            dependsOn: ['[core.md](core.md)'],
        });
    });

    it('reads "In progress" as one keyword', () => {
        expect(parse(proposed({ status: 'In progress - phase 1 built.' })).keyword).toBe('In progress');
    });

    it('rejects an unknown status keyword', () => {
        expect(() => parse(proposed({ status: 'Planned - soon' }))).toThrow(/unrecognised status/);
    });

    it('requires a priority on an unbuilt doc', () => {
        expect(() => parse(proposed({ priority: '' }))).toThrow(/Priority/);
    });

    it('rejects a priority on a Reference doc', () => {
        expect(() => parse('# Notes\n\n**Status:** Reference.\n**Priority:** 1 - no\n')).toThrow(/only Proposed/);
    });

    it('needs exactly one Targets line per unbuilt phase', () => {
        expect(() => parse(proposed({ targets: '' }))).toThrow(/Phase 1 has 0 \*\*Targets:\*\* lines/);
        expect(() => parse(proposed({ targets: '**Targets:** a.b\n**Targets:** c.d' }))).toThrow(/has 2/);
    });

    it('accepts Targets of none with a reason, and rejects a malformed line', () => {
        expect(() => parse(proposed({ targets: '**Targets:** none - tooling only' }))).not.toThrow();
        expect(() => parse(proposed({ targets: '**Targets:** Faster Things!' }))).toThrow(/is not/);
    });

    it('rejects a line-number reference outside code fences', () => {
        expect(() => parse(proposed({ body: 'See `js/agent.js:632`.' }))).toThrow(/pins a line number/);
        expect(() => parse(proposed({ body: 'See .github/workflows/check.yml:12.' }))).toThrow(/pins a line number/);
        expect(() => parse(proposed({ body: 'See js/game.js#L40.' }))).toThrow(/pins a line number/);
        expect(() => parse(proposed({ body: '```\njs/agent.js:632\n```' }))).not.toThrow();
    });

    it('rejects a phase heading that does not use a hyphen', () => {
        const body = proposed().replace('### Phase 1 - Build it\n\n**Targets', '### Phase 1: Build it\n\n**Targets');
        expect(() => parse(body)).toThrow(/is not "### Phase <n> - <name>"/);
    });

    it('requires every Delivery requirements concern', () => {
        const body = proposed().replace('| Determinism | N/A - sample |\n', '');
        expect(() => parse(body)).toThrow(/missing Determinism/);
    });

    it('rejects a bare N/A and a TBD outside a stub', () => {
        expect(() => parse(proposed({ delivery: '| Architecture | N/A |' }))).toThrow(/bare N\/A/);
        expect(() => parse(proposed({ delivery: '| Architecture | N/A - docs only |' }))).not.toThrow();
        expect(() => parse(proposed({ delivery: '| Architecture | TBD - later |' }))).toThrow(/outside a stub/);
    });

    it('lets a stub carry "TBD - <reason>" and skip the task table', () => {
        const stub = proposed({
            status: 'Proposed - stub; outline only.',
            delivery: '| Architecture | TBD - after the spike |',
            tasks: '',
        });
        expect(() => parse(stub)).not.toThrow();
        expect(() => parse(stub.replace('TBD - after the spike', 'TBD'))).toThrow(/bare TBD/);
    });

    it('validates the task table: ids, nature, dependencies and cycles', () => {
        const row = (/** @type {string} */ tasks) => () => parse(proposed({ tasks }));
        expect(row('| X1 | Build | [judgement] | - |')).toThrow(/must match T<number>/);
        expect(row('| T1 | Build | [hard] | - |')).toThrow(/nature must be/);
        expect(row('| T1 | Build | [judgement] | T9 |')).toThrow(/unknown or own id "T9"/);
        expect(row('| T1 | A | [judgement] | - |\n| T1 | B | [judgement] | - |')).toThrow(/duplicate task id T1/);
        expect(row('| T1 | A | [judgement] | T2 |\n| T2 | B | [judgement] | T1 |')).toThrow(/cycle/);
        expect(row('| T1 | Build | [judgement] |')).toThrow(/expected 4/);
    });

    it('checks the header of every task table', () => {
        const tasks =
            '| T1 | A | [judgement] | - |\n\n| # | Task | Kind | Depends on |\n| - | - | - | - |\n| T2 | B | [judgement] | T1 |';
        expect(() => parse(proposed({ tasks }))).toThrow(/header must be/);
    });
});

describe('buildIndex', () => {
    /** @type {string} */
    let dir;
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    /** @param {Record<string, string>} files */
    function designs(files) {
        dir = mkdtempSync(path.join(tmpdir(), 'designs-'));
        for (const [name, body] of Object.entries(files)) {
            writeFileSync(path.join(dir, name), body);
        }
        return dir;
    }

    it('orders the build queue by priority and groups docs by status', () => {
        const index = buildIndex(
            designs({
                'b.md': proposed({ priority: '**Priority:** 2 - second' }).replace('Sample feature', 'Bravo'),
                'a.md': proposed({ priority: '**Priority:** 1 - first' }).replace('Sample feature', 'Alpha'),
                'notes.md': '# Notes\n\n**Status:** Reference - learnings.\n',
                'STYLE.md': '# Style\n',
            }),
        );
        expect(index).toContain('## Build queue (2)\n');
        expect(index.indexOf('1. [Alpha](a.md) - first')).toBeLessThan(index.indexOf('2. [Bravo](b.md) - second'));
        expect(index).toContain('## Reference (1)');
        expect(index).toContain('- [Notes](notes.md) - learnings');
        expect(index).not.toContain('Style');
    });

    it('rejects a relative link that does not resolve, outside code fences', () => {
        const broken = designs({ 'a.md': proposed({ body: 'See [later](later.md).' }) });
        expect(() => buildIndex(broken)).toThrow(/a.md:7: link to "later.md" does not resolve/);
        rmSync(dir, { recursive: true, force: true });
        const fenced = designs({
            'a.md': proposed({ body: '```\n[later](later.md)\n```\n[web](https://example.com) [self](a.md#top)' }),
        });
        expect(() => buildIndex(fenced)).not.toThrow();
    });

    it('rejects duplicate priority ranks', () => {
        const dup = designs({ 'a.md': proposed(), 'b.md': proposed().replace('Sample feature', 'Other') });
        expect(() => buildIndex(dup)).toThrow(DesignDocError);
        expect(() => buildIndex(dup)).toThrow(/1 is used by a.md, b.md/);
    });
});

describe('repo design docs', () => {
    it('pass the lint, and the committed index is current', () => {
        const designsDir = path.join(root, 'docs', 'designs');
        expect(buildIndex(designsDir)).toBe(readFileSync(path.join(designsDir, 'README.md'), 'utf8'));
    });
});

describe('main', () => {
    /**
     * @param {string[]} args the command line
     * @returns {{code: number, out: string, err: string}} the exit code and what went to each stream
     */
    function run(args) {
        const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        try {
            const code = main(args);
            return {
                code,
                out: out.mock.calls.map((c) => String(c[0])).join(''),
                err: err.mock.calls.map((c) => String(c[0])).join(''),
            };
        } finally {
            out.mockRestore();
            err.mockRestore();
        }
    }

    it('rejects an unknown argument, naming it', () => {
        const { code, err } = run(['--write', '--bogus']);
        expect(code).toBe(2);
        expect(err).toBe('unknown argument: --bogus (expected --write or --check)\n');
    });

    it('prints the index of the repo docs with no argument', () => {
        const { code, out } = run([]);
        expect(code).toBe(0);
        expect(out).toBe(buildIndex(path.join(root, 'docs', 'designs')));
    });

    it('--check passes when the committed index is the one the docs build', () => {
        const { code, out } = run(['--check']);
        expect(code).toBe(0);
        expect(out).toBe('Design doc index is up to date.\n');
    });
});
