// Root lint scope: separate checkouts nested under `.claude/worktrees/` do not belong to this checkout's lint run.

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('root ESLint scope', () => {
    it('ignores nested worktrees and keeps root sim files in scope', async () => {
        const eslint = new ESLint();
        expect(await eslint.isPathIgnored('.claude/worktrees/branch/js/sim/step.js')).toBe(true);
        expect(await eslint.isPathIgnored('js/sim/step.js')).toBe(false);
        const config = await eslint.calculateConfigForFile('js/sim/step.js');
        expect(config?.rules.complexity).toEqual([2, 10]);
    });
});
