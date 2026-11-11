import { describe, expect, it } from 'vitest';
import { createSimLog } from '../js/sim/log.js';
import { logRunConfig, resolvePolicyFlag, runConfigRecord } from '../scripts/lib/run-config.mjs';

const FIELDS = { tool: 'eval', policy: 'map-elites-v6', configHash: 'abc', seeds: [1, 2], ticks: 100 };

describe('runConfigRecord', () => {
    it('names the tool, policy, config hash, seeds and ticks', () => {
        expect(runConfigRecord(FIELDS)).toEqual({ level: 'info', event: 'RunConfig', ...FIELDS });
    });

    it('keeps tool-specific fields beside the shared ones', () => {
        expect(runConfigRecord({ ...FIELDS, extra: { arm: 'wide' } })).toMatchObject({ arm: 'wide', seeds: [1, 2] });
    });
});

describe('logRunConfig', () => {
    it('writes the same record through a sim log', () => {
        /** @type {Record<string, any>[]} */
        const records = [];
        logRunConfig(
            createSimLog((record) => records.push(record)),
            FIELDS,
        );

        expect(records).toEqual([runConfigRecord(FIELDS)]);
    });
});

describe('resolvePolicyFlag', () => {
    it('names the live policy for live, passes a registered name and rejects the rest with the usage', () => {
        expect(resolvePolicyFlag('live', 'u')).toBe('map-elites-v6');
        expect(resolvePolicyFlag('baseline-v5', 'u')).toBe('baseline-v5');
        expect(() => resolvePolicyFlag('nope', 'usage: x')).toThrow(/Unknown policy "nope"; known: live, .*\nusage: x/);
        expect(() => resolvePolicyFlag(undefined, 'u')).toThrow('Unknown policy "undefined"');
    });
});
