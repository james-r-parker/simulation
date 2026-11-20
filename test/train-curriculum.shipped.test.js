// The committed curriculum files parse and validate. Shipped data: a PR that edits only a curriculum may fail this
// file, and no other test reads them (the test-data check in scripts/check-conventions.sh).
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planRun, planStages } from '../js/evo/curriculum.js';
import { loadStages } from '../scripts/lib/train-state.mjs';
import { parseArgs } from '../scripts/train.mjs';

const FILES = readdirSync('evals').filter((f) => /^train-curriculum.*\.json$/.test(f));

describe('the committed evals/train-curriculum*.json files', () => {
    it('are at least five', () => {
        expect(FILES.length).toBeGreaterThanOrEqual(5);
    });

    it('load as fixed stages, unchanged', () => {
        for (const file of FILES) {
            const entries = JSON.parse(readFileSync(`evals/${file}`, 'utf8'));
            expect(planRun(entries, 100).map((s) => [s.name, s.from, s.to])).toEqual(
                planStages(entries, 100).map((s) => [s.name, s.from, s.to]),
            );
        }
    });

    it('load through the trainer', () => {
        for (const file of FILES) {
            const args = parseArgs(['--generations', '5', '--out', 'x', '--curriculum', `evals/${file}`]);
            expect(() => loadStages(args), file).not.toThrow();
        }
    });
});
