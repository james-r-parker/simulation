import { mkdtempSync, rmSync, utimesSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cachedGh, TTL_MS, ttlFor } from '../scripts/lib/gh-cache.mjs';

/** @type {string} */
let dir;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gh-cache-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** @returns {{ run: (a: string[]) => string, calls: () => number }} a counting fake gh */
function fake() {
    let n = 0;
    return {
        run: () => `answer ${++n}`,
        calls: () => n,
    };
}

describe('cachedGh', () => {
    it('serves a repeat call from the cache within 60 s and calls gh again after', () => {
        const gh = fake();
        const args = ['pr', 'checks', '5'];
        expect(cachedGh(args, { run: gh.run, dir, off: false })).toBe('answer 1');
        expect(cachedGh(args, { run: gh.run, dir, off: false })).toBe('answer 1');
        expect(cachedGh(args, { run: gh.run, dir, now: () => Date.now() + TTL_MS + 1000, off: false })).toBe(
            'answer 2',
        );
    });

    it('keeps a completed job log for good', () => {
        const gh = fake();
        const args = ['api', 'repos/o/r/actions/jobs/12/logs', '--allow-escape-sequences'];
        cachedGh(args, { run: gh.run, dir, off: false });
        const old = new Date(Date.now() - 86_400_000);
        for (const f of readdirSync(dir)) {
            utimesSync(join(dir, f), old, old);
        }
        expect(cachedGh(args, { run: gh.run, dir, off: false })).toBe('answer 1');
        expect(ttlFor(args)).toBe(Infinity);
    });

    it('keys by arguments, does not cache a failure and can be switched off', () => {
        const gh = fake();
        cachedGh(['a'], { run: gh.run, dir, off: false });
        expect(cachedGh(['b'], { run: gh.run, dir, off: false })).toBe('answer 2');
        expect(() =>
            cachedGh(['c'], {
                dir,
                off: false,
                run: () => {
                    throw new Error('boom');
                },
            }),
        ).toThrow('boom');
        expect(cachedGh(['c'], { run: gh.run, dir, off: false })).toBe('answer 3');
        expect(cachedGh(['a'], { run: gh.run, dir, off: true })).toBe('answer 4');
    });
});
