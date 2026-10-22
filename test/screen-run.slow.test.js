import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reportPath, runScreen } from '../scripts/lib/screen-run.mjs';
import { parseArgs, screen } from '../scripts/screen.mjs';

const SMALL = { maxAgents: 40, initialAgents: 12, minAgents: 4, worldWidth: 1500, worldHeight: 1000 };
const grid = {
    seeds: 2,
    ticks: 1200,
    policy: 'baseline-v5',
    reference: 'ref',
    arms: { ref: SMALL, wide: { ...SMALL, maxAgents: 60 } },
};

/** @type {string} */
let dir;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'screen-'));
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

/**
 * @param {Record<string, any>} [arms] the arms, default the tiny grid's
 * @returns {import('../scripts/lib/screen-grid.mjs').ScreenPlan} the plan for a tiny grid
 */
function plan(arms = grid.arms) {
    return {
        seeds: grid.seeds,
        seedOffset: 0,
        ticks: grid.ticks,
        policy: grid.policy,
        reference: 'ref',
        arms: Object.entries(arms).map(([name, overrides]) => ({ name, overrides })),
    };
}

describe('runScreen', () => {
    it('runs every arm and seed in one pool, writes a report per arm, then resumes without running', async () => {
        const first = await runScreen({ plan: plan(), outDir: dir, workers: 3, sha: 'abc' });
        expect(first.ran.sort()).toEqual(['ref', 'wide']);
        expect(first.reports.wide.config.maxAgents).toBe(60);
        expect(first.reports.ref.traces).toHaveLength(2);
        const path = reportPath(dir, 'ref');
        const written = readFileSync(path, 'utf8');
        const second = await runScreen({ plan: plan(), outDir: dir, workers: 3, sha: 'abc' });
        expect(second).toMatchObject({ ran: [], skipped: ['ref', 'wide'] });
        expect(readFileSync(path, 'utf8')).toBe(written);
        expect(second.reports.ref.metrics).toEqual(first.reports.ref.metrics);
    });

    it('reruns an arm whose config changed, and every arm with force', async () => {
        await runScreen({ plan: plan(), outDir: dir, workers: 2, sha: 'abc' });
        const changed = plan({ ref: SMALL, wide: { ...SMALL, maxAgents: 70 } });
        const again = await runScreen({ plan: changed, outDir: dir, workers: 2, sha: 'abc' });
        expect(again).toMatchObject({ ran: ['wide'], skipped: ['ref'] });
        const forced = await runScreen({ plan: changed, outDir: dir, workers: 2, sha: 'abc', force: true });
        expect(forced.ran.sort()).toEqual(['ref', 'wide']);
    });
});

describe('screen', () => {
    it('writes verdicts.json and table.md with one row per arm', async () => {
        const gridFile = join(dir, 'tiny.grid.json');
        writeFileSync(gridFile, JSON.stringify(grid));
        const out = join(dir, 'out');
        const args = parseArgs(['--grid', gridFile, '--out', out, '--workers', '2', '--ticks', '1100']);
        const result = await screen(args, () => {});
        const verdicts = JSON.parse(readFileSync(join(out, 'verdicts.json'), 'utf8'));
        expect(verdicts.arms.map((/** @type {any} */ a) => a.arm)).toEqual(['ref', 'wide']);
        expect(verdicts.arms[1].deltas).not.toBeNull();
        expect(readFileSync(join(out, 'table.md'), 'utf8')).toBe(result.table);
        expect(result.table.split('\n').filter((l) => l.startsWith('| `'))).toHaveLength(2);
    });
});
