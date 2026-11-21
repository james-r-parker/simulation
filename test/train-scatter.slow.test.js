// The scatter nursery world of docs/designs/training-stages.md Phase 8 trains: a 2-generation smoke
// (`--episodes 4 --ticks 3000`) whose foragers live to the last tick.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { snapshotArchive } from '../js/evo/archive-snapshot.js';
import { OFFER_FROM_TICK, createTrainerArchive } from '../js/evo/trainer.js';
import { createConfig } from '../js/sim/config.js';
import { scaleTimeout } from '../scripts/lib/test-timeout.mjs';
import { runTrainTask } from '../scripts/train-worker.mjs';
import { parseArgs, runTraining } from '../scripts/train.mjs';

const root = mkdtempSync(join(tmpdir(), 'train-scatter-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const FILE = new URL('./fixtures/nursery-scatter.json', import.meta.url).pathname;
const OVERRIDES = JSON.parse(readFileSync(FILE, 'utf8'));

describe('the scatter nursery world', () => {
    it(
        'trains for 2 generations and writes an archive with elites',
        async () => {
            const out = join(root, 'run');
            const args = ['--generations', '2', '--config', FILE, '--episodes', '4', '--ticks', '3000'];
            await runTraining(
                parseArgs([...args, '--offer-from', '500', '--checkpoint-every', '0', '--workers', '2', '--out', out]),
            );
            const archive = JSON.parse(readFileSync(join(out, 'archive-1.json'), 'utf8'));
            expect(archive.cells.length).toBeGreaterThan(0);
        },
        scaleTimeout(180000),
    );

    it(
        'keeps foragers alive to the last tick of an episode',
        () => {
            const snapshot = snapshotArchive(createTrainerArchive(createConfig(OVERRIDES)));
            const result = runTrainTask({ seed: 1, overrides: OVERRIDES, snapshot, ticks: 3000, offerFromTick: 500 });
            expect(result.ticks).toBe(3000);
            expect(result.population).toBeGreaterThan(0);
        },
        scaleTimeout(120000),
    );

    it(
        'still has a population and offers a death once the offer window is open',
        () => {
            // At 20 items the founders starved before OFFER_FROM_TICK and E-TS-1m measured nothing; 90 fixed that. Pooled-v6's
            // longer genome row reshuffled every seed's streams and the 90-item fixture starved out again: population 0 at
            // tick 11000 on seeds 1 to 4 (seed 1 was the only passing seed even on main, at 26 alive). The test checks the
            // offer-window mechanism, not world survival, so the same lever moves again: this frozen fixture holds 200
            // items (the shipped screen file keeps its own 90). Population at tick 11000 on 200 items, offers in the
            // window: seed 1 has 48 and 4, seed 2 has 36 and 2, seed 3 has 32 and 3, seed 4 has 30 and 3. The lever is
            // chaotic (seed 1 at 220 items has 1 alive), so 200 was picked for living on all four seeds.
            const snapshot = snapshotArchive(createTrainerArchive(createConfig(OVERRIDES)));
            const ticks = OFFER_FROM_TICK + 1000;
            const result = runTrainTask({ seed: 1, overrides: OVERRIDES, snapshot, ticks });
            expect(result.population).toBeGreaterThan(0);
            expect(result.offers.length).toBeGreaterThan(0);
        },
        scaleTimeout(180000),
    );
});
