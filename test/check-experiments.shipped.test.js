import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { checkFiles } from '../scripts/check-experiments.mjs';

describe('the shipped ledger', () => {
    it('passes', () => {
        expect(checkFiles()).toEqual([]);
    });

    it('passes on the command line', () => {
        expect(spawnSync('node', ['scripts/check-experiments.mjs']).status).toBe(0);
    });
});
