import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSeasons, currentSeason } from '../../js/library/seasons.js';
import { createConfig, rulesHash } from '../../js/sim/config.js';

const seasons = JSON.parse(readFileSync('library/seasons.json', 'utf8'));

describe('library/seasons.json', () => {
    it('follows the season rules', () => {
        expect(checkSeasons(seasons)).toEqual([]);
    });

    it('has a newest entry that matches the current rules, when it has entries', () => {
        // On `season/next` the rules may be ahead of the file; the branch exemption arrives with the release-check task.
        const current = currentSeason(seasons);
        if (current !== null && process.env.GITHUB_REF_NAME !== 'season/next') {
            expect(current.rulesHash).toBe(rulesHash(createConfig()));
        }
    });
});
