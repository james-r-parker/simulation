import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENTS } from '../js/sim/events.js';
import { main, renderEventsDoc } from '../scripts/events-doc.mjs';

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
    const dir = mkdtempSync(join(tmpdir(), 'events-doc-'));
    dirs.push(dir);
    return join(dir, 'log-events.md');
}

describe('renderEventsDoc', () => {
    it('has one row per event with its code, log event, level and numbered fields', () => {
        const doc = renderEventsDoc();
        for (const def of EVENTS) {
            expect(doc).toContain(`\`${def.name}\``);
        }
        expect(doc).toMatch(/\| 2 +\| `AGENT_DIED` +\| `AgentDied` +\| debug \| 2 slot, 3 genomeId, 4 cause, 5 by/);
        expect(doc).toMatch(/\| 32 +\| `PROVISIONED` +\| none \(unused\)/);
    });

    it('lists the cause tables', () => {
        const doc = renderEventsDoc();
        expect(doc).toContain('## Death causes');
        expect(doc).toMatch(/\| 3 +\| `OLD_AGE` +\| old-age +\| #[0-9a-f]{6} +\|/);
    });
});

describe('main', () => {
    it('writes the doc, then passes --check on it and fails on a stale copy', () => {
        const path = tempPath();
        vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        expect(main(['--check'], { path })).toBe(1);
        expect(main(['--write'], { path })).toBe(0);
        expect(readFileSync(path, 'utf8')).toBe(renderEventsDoc());
        expect(main(['--check'], { path })).toBe(0);
        writeFileSync(path, 'stale');
        expect(main(['--check'], { path })).toBe(1);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('node scripts/events-doc.mjs --write'));
    });

    it('rejects an unknown argument', () => {
        const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
        expect(main(['--nope'])).toBe(2);
        expect(err).toHaveBeenCalledWith(expect.stringContaining('unknown argument: --nope'));
    });

    it('keeps the committed docs/log-events.md equal to the registry', () => {
        vi.spyOn(process.stdout, 'write').mockReturnValue(true);
        expect(main(['--check'])).toBe(0);
    });
});
