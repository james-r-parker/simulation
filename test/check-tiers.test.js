import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Runs scripts/check.sh with the given arguments.
 * @param {...string} args check.sh arguments
 * @returns {{status: number | null, lines: string[]}} exit status and non-empty stdout lines
 */
function check(...args) {
    const result = spawnSync('scripts/check.sh', args, { encoding: 'utf8' });
    return { status: result.status, lines: result.stdout.split('\n').filter(Boolean) };
}

describe('check.sh --list', () => {
    it('lists the tier 1 gates', () => {
        expect(check('--list', '--tier', '1').lines).toEqual(['conventions', 'format', 'lint', 'test-related']);
    });

    it('lists every tier 1 gate in tier 2', () => {
        const tier2 = check('--list', '--tier', '2').lines;
        for (const gate of check('--list', '--tier', '1').lines) {
            expect(tier2).toContain(gate);
        }
        expect(tier2).toContain('browser-smoke');
    });

    it('lists every tier 2 gate in tier 3, plus mutation and bench-compare', () => {
        const tier3 = check('--list', '--tier=3').lines;
        for (const gate of check('--list', '--tier', '2').lines) {
            expect(tier3).toContain(gate);
        }
        expect(tier3.slice(-2)).toEqual(['mutation', 'bench-compare']);
    });

    it('defaults to tier 2', () => {
        expect(check('--list').lines).toEqual(check('--list', '--tier', '2').lines);
    });

    it('leaves docs-tests out of every tier but lists it when named', () => {
        expect(check('--list', '--tier', '3').lines).not.toContain('docs-tests');
        expect(check('--list', '--docs').lines).toEqual(['conventions', 'designs-index', 'format', 'docs-tests']);
        expect(check('--list', '--only=docs-tests,lint').lines).toEqual(['lint', 'docs-tests']);
    });
});

describe('check.sh --tier', () => {
    it('rejects --tier with --only', () => {
        expect(check('--tier', '1', '--only=lint').status).toBe(2);
    });

    it('rejects --tier with --docs', () => {
        expect(check('--tier', '1', '--docs').status).toBe(2);
    });

    it('rejects an unknown tier', () => {
        expect(check('--tier', '9').status).toBe(2);
    });
});
