// The shipped tuning spec parses and proposes arms against the shipped ladder. Shipped data: the exact arms are
// asserted on frozen copies in test/evo/train-tune.test.js, so a PR that edits only evals/train-tune.json passes here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { proposeArms } from '../../js/evo/train-tune.js';

describe('evals/train-tune.json', () => {
    it('proposes at least one arm with a signature against evals/train-ladder.json', () => {
        const spec = JSON.parse(readFileSync('evals/train-tune.json', 'utf8'));
        const ladder = JSON.parse(readFileSync(spec.curriculum, 'utf8'));
        const arms = proposeArms(spec, ladder, []);
        expect(arms.length).toBeGreaterThan(0);
        expect(arms.length).toBeLessThanOrEqual(spec.maxArms);
        for (const arm of arms) {
            expect(arm.signature).toMatch(/\S/);
        }
    });
});
