import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseArgs, runDrills } from '../scripts/drill.mjs';

const root = mkdtempSync(join(tmpdir(), 'drill-policy-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('drill --policy', () => {
    it('plays the policy for its champions first, then drills them with the reference', async () => {
        const args = parseArgs([
            ...['--policy', 'map-elites-v6', '--count', '1', '--trials', '1'],
            ...['--drills', 'food-ahead', '--workers', '1'],
        ]);
        const rows = await runDrills(args, { logDir: join(root, 'logs') });
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows.at(-1)?.label).toBe('reference memoryless');
    }, 300000);
});
