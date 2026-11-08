import { describe, expect, it } from 'vitest';
import { currentBranch, isBreaking, releaseCheck, seasonAdded } from '../scripts/lib/release-check.mjs';

describe('isBreaking', () => {
    it('is true for a bang after the type or scope, and for a BREAKING CHANGE footer', () => {
        expect(isBreaking('feat!: new rules')).toBe(true);
        expect(isBreaking('feat(sim)!: new rules\n\nbody')).toBe(true);
        expect(isBreaking('feat(sim): new rules\n\nwhy\n\nBREAKING CHANGE: the ruleset changes')).toBe(true);
    });

    it('is false for an ordinary commit, a bang inside the text, or a footer-like word in a subject', () => {
        expect(isBreaking('feat(sim): new rules')).toBe(false);
        expect(isBreaking('fix: handle a!: case')).toBe(false);
        expect(isBreaking('docs: mention BREAKING CHANGE: in the guide')).toBe(false);
    });
});

describe('releaseCheck', () => {
    const same = { baseHash: 'a', headHash: 'a', messages: ['feat: x'], base: 'main', addsSeason: false };
    const changed = { ...same, headHash: 'b' };

    it('passes a change that leaves rulesHash alone, whatever its commits', () => {
        expect(releaseCheck(same)).toEqual({ ok: true });
        expect(releaseCheck({ ...same, base: 'season/next' })).toEqual({ ok: true });
    });

    it('fails a rules change without a breaking commit', () => {
        expect(releaseCheck({ ...changed, base: 'season/next' })).toEqual({
            ok: false,
            reason: 'rules-change-not-breaking',
        });
    });

    it('passes a breaking rules change on season/next', () => {
        const input = { ...changed, base: 'season/next', messages: ['chore: x', 'feat(sim)!: new rules'] };
        expect(releaseCheck(input)).toEqual({ ok: true });
    });

    it('fails a breaking rules change on main unless it adds a season', () => {
        const input = { ...changed, messages: ['feat(sim)!: new rules'] };
        expect(releaseCheck(input)).toEqual({ ok: false, reason: 'rules-change-on-main' });
        expect(releaseCheck({ ...input, addsSeason: true })).toEqual({ ok: true });
    });

    it('reports the missing breaking commit before the wrong base', () => {
        expect(releaseCheck(changed)).toEqual({ ok: false, reason: 'rules-change-not-breaking' });
    });
});

describe('seasonAdded', () => {
    it('is true only when HEAD lists more seasons than the merge base', () => {
        expect(seasonAdded('[]', '[{"season":6}]')).toBe(true);
        expect(seasonAdded('[{"season":6}]', '[{"season":6}]')).toBe(false);
    });
});

describe('currentBranch', () => {
    const run = () => 'local-branch\n';

    it('prefers the pull request base, then the pushed ref, then the checked-out branch', () => {
        expect(currentBranch({ env: { GITHUB_BASE_REF: 'season/next', GITHUB_REF_NAME: '12/merge' }, run })).toBe(
            'season/next',
        );
        expect(currentBranch({ env: { GITHUB_BASE_REF: '', GITHUB_REF_NAME: 'main' }, run })).toBe('main');
        expect(currentBranch({ env: {}, run })).toBe('local-branch');
    });
});
