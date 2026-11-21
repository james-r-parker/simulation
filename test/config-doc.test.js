import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../js/sim/config-defaults.js';
import { main, renderConfigDoc } from '../scripts/config-doc.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
    vi.restoreAllMocks();
    while (dirs.length > 0) {
        rmSync(/** @type {string} */ (dirs.pop()), { recursive: true, force: true });
    }
});

/** @returns {string} a path in a fresh temporary directory */
function tempPath() {
    const dir = mkdtempSync(join(tmpdir(), 'config-doc-'));
    dirs.push(dir);
    return join(dir, 'config-keys.md');
}

describe('renderConfigDoc', () => {
    it('has one row per config key with its default and its rule', () => {
        const doc = renderConfigDoc();
        for (const key of Object.keys(DEFAULTS)) {
            expect(doc).toContain(`\`${key}\``);
        }
        expect(doc).toMatch(/\| `maxAgents` +\| \d+ +\| int >= 1 <= 4096 +\|/);
        expect(doc).toMatch(/\| `specialisations` +\| \{5 keys\} +\| specialisations +\|/);
        expect(doc).not.toContain('no rule');
    });
});

describe('main', () => {
    it('writes the doc, passes --check on it and fails on a stale copy', () => {
        const path = tempPath();
        vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        expect(main(['--check'], { path })).toBe(1);
        expect(main(['--write'], { path })).toBe(0);
        expect(readFileSync(path, 'utf8')).toBe(renderConfigDoc());
        expect(main(['--check'], { path })).toBe(0);
        writeFileSync(path, 'stale');
        expect(main(['--check'], { path })).toBe(1);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('node scripts/config-doc.mjs --write'));
    });

    it('prints the doc with no flag and rejects an unknown one', () => {
        const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        expect(main([])).toBe(0);
        expect(out).toHaveBeenCalledWith(renderConfigDoc());
        expect(main(['--nope'])).toBe(2);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('unknown argument: --nope'));
    });

    it('keeps the committed docs/config-keys.md equal to the config', () => {
        vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        expect(main(['--check'])).toBe(0);
    });
});
