// Browser spec for the scene reel (docs/designs/ambient-display.md, Phase 6): the script's own flow, on the smoke's
// session, over a 2000-tick world of seed 1 at x8. It writes `reel.json` and a file for each clip it lists, and the page's
// recorder ran. Behaviour only: which scenes show in 2000 ticks is not asserted. SMOKE_URL is set by
// scripts/browser-smoke.sh.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { runReel } from '../../scripts/reel.mjs';

test('the reel runs a 2000-tick world and writes reel.json and its clips', async ({ page }) => {
    const baseUrl = process.env.SMOKE_URL;
    if (!baseUrl) {
        throw new Error('SMOKE_URL is not set: run scripts/browser-smoke.sh');
    }
    const out = mkdtempSync(join(tmpdir(), 'reel-spec-'));
    try {
        const file = await runReel(page, {
            baseUrl,
            args: { seed: 1, ticks: 2000, out, config: null, policy: 'map-elites-v6', headed: false },
        });
        expect(file).toBe(join(out, 'reel.json'));
        const manifest = JSON.parse(readFileSync(file, 'utf8'));
        expect(manifest).toMatchObject({ seed: 1, ticks: 2000, recording: true });
        expect(manifest.endTick).toBeGreaterThanOrEqual(2000);
        for (const clip of manifest.clips) {
            expect(Object.keys(clip).sort()).toEqual(['file', 'scene', 'score', 'tick']);
            expect(existsSync(join(out, clip.file)), `${clip.file} was written`).toBe(true);
        }
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
});
