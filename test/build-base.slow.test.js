// A versioned build (`vite build --base /v/<version>/`) serves every asset from under its base, so the /v/ Function can
// strip the prefix and proxy the release's own deployment (docs/designs/deployment-and-community.md, "Versioned build and paths").
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';

const out = mkdtempSync(join(tmpdir(), 'build-base-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('vite build --base', () => {
    it(
        'puts every local href and src of index.html under the base',
        () => {
            const done = spawnSync('npx', ['vite', 'build', '--base', '/v/7.2.1/', '--outDir', out, '--emptyOutDir'], {
                encoding: 'utf8',
                env: { ...process.env, APP_VERSION: '7.2.1' },
            });
            expect(done.status, done.stderr).toBe(0);
            const html = readFileSync(join(out, 'index.html'), 'utf8');
            const refs = [...html.matchAll(/\b(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
            const local = refs.filter((ref) => !/^(https?:)?\/\//.test(ref) && !ref.startsWith('#'));
            expect(local.length).toBeGreaterThan(0);
            for (const ref of local) {
                expect(ref.startsWith('/v/7.2.1/'), ref).toBe(true);
            }
            expect(readdirSync(join(out, 'assets')).length).toBeGreaterThan(0);
        },
        scaleTimeout(120_000),
    );
});
