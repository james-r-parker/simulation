import { describe, expect, it } from 'vitest';
import { exportEligibility } from '../../js/evo/export-eligibility.js';

const TARGET = 'target';
const stage = (/** @type {string} */ name, /** @type {string} */ rulesHash) => ({ name, rulesHash, generations: 3 });

describe('exportEligibility', () => {
    it('admits an archive whose last generation and last stage ran under the target rules', () => {
        const json = { rulesHash: TARGET, stages: [stage('hunt', 'h'), stage('world', TARGET)] };
        expect(exportEligibility(json, TARGET)).toEqual({ eligible: true, reason: null });
    });

    it('refuses an archive with no stage record, and one that never reached the target world', () => {
        expect(exportEligibility({ rulesHash: TARGET }, TARGET).reason).toMatch(/no training stages/);
        expect(exportEligibility({ rulesHash: TARGET, stages: [] }, TARGET).eligible).toBe(false);
        const easy = { rulesHash: 'h', stages: [stage('nursery', 'n'), stage('hunt', 'h')] };
        expect(exportEligibility(easy, TARGET)).toMatchObject({
            eligible: false,
            reason: expect.stringMatching(/last generation ran in a world that is not the target world/),
        });
    });

    it('refuses an archive whose last generation was a review in an easier stage, though the target stage ran before', () => {
        const json = { rulesHash: 'h', stages: [stage('hunt', 'h'), stage('world', TARGET)] };
        expect(exportEligibility(json, TARGET).eligible).toBe(false);
    });

    it('refuses an archive whose record does not end in the target world', () => {
        const json = { rulesHash: TARGET, stages: [stage('world', TARGET), stage('later', 'x')] };
        expect(exportEligibility(json, TARGET).reason).toMatch(/last stage is not the target/);
    });
});
