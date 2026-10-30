import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

const outDir = mkdtempSync(join(tmpdir(), 'blob-dist-'));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('real vite build', () => {
    it('emits only hashed file names under assets/', async () => {
        await build({ logLevel: 'silent', build: { outDir, emptyOutDir: true } });
        const names = readdirSync(join(outDir, 'assets'));
        expect(names.some((n) => n.endsWith('.css'))).toBe(true);
        const unhashed = names.filter((n) => !/-[A-Za-z0-9_-]{8}\.[a-z0-9.]+$/.test(n));
        expect(unhashed).toEqual([]);
    }, 120000);
});
