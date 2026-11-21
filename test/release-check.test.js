import { describe, expect, it } from 'vitest';
import { isBreaking, movesUnreleasedSeason, releaseCheck, seasonAdded } from '../scripts/lib/release-check.mjs';

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

    it('passes a change that leaves rulesHash alone, whatever its commits and title', () => {
        expect(releaseCheck(same)).toEqual({ ok: true });
        expect(releaseCheck({ ...same, title: 'fix: x' })).toEqual({ ok: true });
    });

    it('fails a rules change on main without a breaking title, even when it adds a season', () => {
        const input = { ...changed, addsSeason: true, title: 'feat(sim): new rules' };
        expect(releaseCheck(input)).toEqual({ ok: false, reason: 'rules-change-not-breaking' });
        expect(releaseCheck({ ...input, messages: ['feat(sim)!: new rules'] })).toEqual({
            ok: false,
            reason: 'rules-change-not-breaking',
        });
    });

    it('fails a breaking rules change on main that adds no season', () => {
        const input = { ...changed, title: 'feat(sim)!: new rules' };
        expect(releaseCheck(input)).toEqual({ ok: false, reason: 'rules-change-without-season' });
    });

    it('passes a rules change on main with a breaking title and a new season, as PR 574 opened season 11', () => {
        const input = {
            ...changed,
            messages: ['feat(library)!: open season 11 for the sprint store and leak-gene rules'],
            title: 'feat!: merge season/next into main and open season 11',
            addsSeason: true,
        };
        expect(releaseCheck(input)).toEqual({ ok: true });
    });

    it('passes a breaking rules change on main that moves an unreleased season in place', () => {
        const input = { ...changed, title: 'feat(sim)!: new rules', movesUnreleased: true };
        expect(releaseCheck(input)).toEqual({ ok: true });
        expect(releaseCheck({ ...input, title: 'feat(sim): new rules' })).toEqual({
            ok: false,
            reason: 'rules-change-not-breaking',
        });
    });

    it('reads the commits when no title is given, as a local run does', () => {
        expect(releaseCheck({ ...changed, addsSeason: true })).toEqual({
            ok: false,
            reason: 'rules-change-not-breaking',
        });
        const input = { ...changed, addsSeason: true, messages: ['chore: x', 'feat(sim)!: new rules'] };
        expect(releaseCheck(input)).toEqual({ ok: true });
    });

    it('asks only for a breaking change on a base other than main, such as a stacked branch', () => {
        const input = { ...changed, base: 'feat/stacked', title: 'feat(sim)!: new rules' };
        expect(releaseCheck(input)).toEqual({ ok: true });
        expect(releaseCheck({ ...input, title: 'feat(sim): new rules' }).ok).toBe(false);
    });

    it('reports the missing breaking title before the missing season', () => {
        expect(releaseCheck({ ...changed, title: 'feat: x' })).toEqual({
            ok: false,
            reason: 'rules-change-not-breaking',
        });
    });
});

describe('seasonAdded', () => {
    it('is true only when HEAD lists more seasons than the merge base', () => {
        expect(seasonAdded('[]', '[{"season":6}]')).toBe(true);
        expect(seasonAdded('[{"season":6}]', '[{"season":6}]')).toBe(false);
    });
});

describe('movesUnreleasedSeason', () => {
    const season = (/** @type {string} */ rulesHash, n = 10) => ({ season: n, major: n, rulesHash });
    const file = (/** @type {object[]} */ ...entries) => JSON.stringify(entries);
    const before = file(season('x', 9), season('a'));

    it('is true when the newest season keeps its number, its hash moves and it has no release tag', () => {
        expect(movesUnreleasedSeason(before, file(season('x', 9), season('b')), ['v9.0.0'])).toBe(true);
    });

    it('is false once the season is released, when the hash stays, or when the seasons differ', () => {
        const after = file(season('x', 9), season('b'));
        expect(movesUnreleasedSeason(before, after, ['v9.0.0', 'v10.0.0'])).toBe(false);
        expect(movesUnreleasedSeason(before, before, [])).toBe(false);
        expect(movesUnreleasedSeason(before, file(season('x', 9), season('b', 11)), [])).toBe(false);
        expect(movesUnreleasedSeason(before, file(season('x', 9), season('a'), season('b', 11)), [])).toBe(false);
        expect(movesUnreleasedSeason('[]', '[]', [])).toBe(false);
    });

    it('does not take v1. for v10.', () => {
        const after = file(season('x', 9), season('b'));
        expect(movesUnreleasedSeason(before, after, ['v1.0.0', 'v100.0.0'])).toBe(true);
    });
});
