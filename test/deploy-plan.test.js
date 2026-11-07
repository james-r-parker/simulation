import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deployPlan, readBindings } from '../scripts/lib/deploy-plan.mjs';
import { PREVIEW_MARKER, previewComment } from '../scripts/lib/pr-comment.mjs';

const bindings = {
    production: {
        r2: [{ binding: 'RELEASES', bucket: 'matrix-releases' }],
        d1: [{ binding: 'DB', name: 'blob-library', id: 'aaaa' }],
    },
    preview: {
        r2: [{ binding: 'RELEASES', bucket: 'matrix-releases-preview' }],
        d1: [{ binding: 'DB', name: 'blob-library-preview', id: 'bbbb' }],
    },
};
const run = (/** @type {Record<string, any>} */ over = {}) => ({
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_sha: 'abc1234def',
    head_repository: { full_name: 'o/r' },
    pull_requests: [],
    ...over,
});
const plan = (/** @type {Record<string, any>} */ over = {}, extra = {}) =>
    deployPlan({ event: run(over), repo: 'o/r', bindings, seasonNext: false, ...extra });

describe('deployPlan', () => {
    it('deploys main to /next/ and to main-latest while season/next exists', () => {
        expect(plan()).toMatchObject({ action: 'next', branch: 'next', sha: 'abc1234def' });
        expect(plan({}, { seasonNext: true })).toMatchObject({ action: 'next', branch: 'main-latest' });
    });

    it('deploys season/next to /next/', () => {
        expect(plan({ head_branch: 'season/next' }, { seasonNext: true })).toMatchObject({
            action: 'next',
            branch: 'next',
        });
    });

    it('deploys a same-repo pull request to a preview branch', () => {
        expect(plan({ event: 'pull_request', head_branch: 'feat/x', pull_requests: [{ number: 12 }] })).toMatchObject({
            action: 'preview',
            branch: 'pr-12',
            pr: 12,
        });
    });

    it.each([
        [{ conclusion: 'failure' }, 'check-failure'],
        [{ conclusion: 'cancelled' }, 'check-cancelled'],
        [{ head_repository: { full_name: 'evil/r' }, event: 'pull_request', pull_requests: [{ number: 1 }] }, 'fork'],
        [{ event: 'pull_request', pull_requests: [] }, 'no-pr'],
        [{ head_branch: 'feat/y' }, 'branch'],
    ])('skips %j with reason %s', (over, reason) => {
        expect(plan(over)).toMatchObject({ action: 'skip', reason });
    });

    it('never plans a production deploy', () => {
        for (const over of [
            {},
            { head_branch: 'season/next' },
            { event: 'pull_request', pull_requests: [{ number: 3 }] },
        ]) {
            expect(plan(over).branch).not.toBe('production');
            expect(plan(over).branch).not.toBe('main');
        }
    });

    it('refuses preview bindings that are not separate -preview resources', () => {
        const same = { ...bindings, preview: { ...bindings.preview, r2: bindings.production.r2 } };
        const badName = {
            ...bindings,
            preview: { ...bindings.preview, d1: [{ binding: 'DB', name: 'blob-library', id: 'bbbb' }] },
        };
        const sameId = {
            ...bindings,
            preview: { ...bindings.preview, d1: [{ binding: 'DB', name: 'x-preview', id: 'aaaa' }] },
        };
        const missing = { ...bindings, preview: { r2: [], d1: [] } };
        for (const b of [same, badName, sameId, missing]) {
            expect(deployPlan({ event: run(), repo: 'o/r', bindings: b, seasonNext: false })).toMatchObject({
                reason: 'preview-bindings',
            });
        }
    });

    it('refuses placeholder database ids', () => {
        const zero = '00000000-0000-0000-0000-000000000000';
        const placeholder = {
            production: { ...bindings.production, d1: [{ binding: 'DB', name: 'blob-library', id: zero }] },
            preview: { ...bindings.preview, d1: [{ binding: 'DB', name: 'blob-library-preview', id: zero }] },
        };
        expect(deployPlan({ event: run(), repo: 'o/r', bindings: placeholder, seasonNext: false }).reason).toBe(
            'placeholder-ids',
        );
        const half = { ...placeholder, production: bindings.production };
        expect(deployPlan({ event: run(), repo: 'o/r', bindings: half, seasonNext: false }).reason).toBe(
            'placeholder-ids',
        );
    });
});

describe('readBindings', () => {
    it('reads the repository wrangler.toml, production and preview', () => {
        const parsed = readBindings(readFileSync('wrangler.toml', 'utf8'));
        expect(parsed.production.r2.map((r) => r.binding).sort()).toEqual(['GENES', 'RELEASES']);
        expect(parsed.preview.r2.map((r) => r.bucket).sort()).toEqual([
            'blob-genomes-preview',
            'matrix-releases-preview',
        ]);
        expect(parsed.production.d1[0]).toMatchObject({ binding: 'DB', name: 'blob-library' });
        expect(parsed.preview.d1[0].name).toBe('blob-library-preview');
    });

    it('ignores comments and unrelated tables, and throws on other shapes', () => {
        const parsed = readBindings(
            'name = "x" # c\n[vars]\nA = "b"\n[[r2_buckets]]\nbinding = "R"\nbucket_name = "b"\n',
        );
        expect(parsed.production.r2).toEqual([{ binding: 'R', bucket: 'b' }]);
        expect(() => readBindings('a = [1, 2]')).toThrow('line 1');
        expect(() => readBindings('a = { b = 1 }')).toThrow('unsupported');
    });
});

describe('previewComment', () => {
    it('starts with the marker and names the short sha', () => {
        const body = previewComment('https://pr-1.matrix.pages.dev', 'abcdef0123');
        expect(body.startsWith(PREVIEW_MARKER)).toBe(true);
        expect(body).toContain('https://pr-1.matrix.pages.dev');
        expect(body).toContain('abcdef0');
    });
});
