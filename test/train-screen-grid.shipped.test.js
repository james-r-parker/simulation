// The committed plateau screen grid plans against the committed ladder. Shipped data: see the test-data check in
// scripts/check-conventions.sh.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { planScreen } from '../scripts/lib/train-screen-grid.mjs';

describe('evals/train-screens/plateau.grid.json', () => {
    it('is the current ladder with and without plateauStop on matched offsets 0 to 120, to hunt-mid', () => {
        const readFile = (/** @type {string} */ file) =>
            JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
        const plan = planScreen(readFile('evals/train-screens/plateau.grid.json'), readFile);
        expect(plan.offsets).toEqual(Array.from({ length: 16 }, (_, i) => i * 8));
        expect(plan).toMatchObject({ until: 'hunt-mid', generations: 380, workersPerRun: 8, reference: 'nostop' });
        expect(plan.feasible).toBeNull();
        expect(plan.arms.map((a) => a.train)).toEqual([{ checkpointEvery: 5 }, { checkpointEvery: 5 }]);
        const stops = (/** @type {string} */ name) =>
            plan.arms.find((a) => a.name === name)?.ladder.map((e) => [e.name, e.plateauStop]);
        const ladder = readFile('evals/train-ladder.json');
        expect(stops('stop')).toEqual(ladder.map((/** @type {any} */ e) => [e.name, e.plateauStop]));
        expect(stops('nostop')?.slice(0, 4)).toEqual([
            ['nursery', 0],
            ['hunt-contact', 0],
            ['hunt-weak', 0],
            ['hunt-mid', 0],
        ]);
    });
});
