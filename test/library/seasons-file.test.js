import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSeasons, currentSeason } from '../../js/library/seasons.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';

const seasons = JSON.parse(readFileSync('library/seasons.json', 'utf8'));

describe('library/seasons.json', () => {
    it('follows the season rules', () => {
        expect(checkSeasons(seasons)).toEqual([]);
    });

    it('has a newest entry that matches the current rules, on every branch', () => {
        // A rules change carries its season entry in the same pull request (scripts/lib/release-check.mjs).
        const current = currentSeason(seasons);
        expect(current).not.toBeNull();
        expect(current?.rulesHash).toBe(rulesHash(createConfig()));
    });
});
