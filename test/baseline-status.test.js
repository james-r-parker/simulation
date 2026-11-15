import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareRules, runBaselineStatus } from '../scripts/baseline-status.mjs';
import { createConfig, rulesHash } from '../js/sim/config.js';

const DEFAULTS = createConfig({ seed: 1 });

/**
 * @param {Record<string, any>} config the config the report ran
 * @param {(path: string) => void} body runs with the report's path
 */
function withReport(config, body) {
    const dir = mkdtempSync(join(tmpdir(), 'baseline-status-'));
    try {
        const path = join(dir, 'defaults-floor-on-X.json');
        const metrics = { 'eval.alarm_rate': { values: [1], reasons: [null], mean: 1, sd: null } };
        writeFileSync(
            path,
            JSON.stringify({
                version: 1,
                policy: 'p',
                fitnessName: 'f',
                config,
                configHash: 'h',
                ticks: 1,
                seeds: [1],
                sha: 's',
                metrics,
            }),
        );
        body(path);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

describe('compareRules', () => {
    it('matches a config with the same rules, whatever its population size', () => {
        const result = compareRules({ ...DEFAULTS, seed: 99 }, DEFAULTS);
        expect(result.match).toBe(true);
        expect(result.reportHash).toBe(rulesHash(DEFAULTS));
    });

    it('differs when a rule changed', () => {
        const changed = { ...DEFAULTS, herdCount: DEFAULTS.herdCount + 1 };
        const result = compareRules(changed, DEFAULTS);
        expect(result.match).toBe(false);
        expect(result.reportHash).not.toBe(result.defaultHash);
    });
});

describe('runBaselineStatus', () => {
    it('exits 0 and says current on a matching rulesHash', () => {
        withReport(DEFAULTS, (path) => {
            /** @type {string[]} */
            const out = [];
            expect(runBaselineStatus(['--report', path], (line) => out.push(line), DEFAULTS)).toBe(0);
            expect(out.at(-1)).toBe('baseline current');
        });
    });

    it('exits 1 and names both hashes on a differing rulesHash', () => {
        const changed = { ...DEFAULTS, herdCount: DEFAULTS.herdCount + 1 };
        withReport(changed, (path) => {
            /** @type {string[]} */
            const out = [];
            expect(runBaselineStatus(['--report', path], (line) => out.push(line), DEFAULTS)).toBe(1);
            const text = out.join('\n');
            expect(text).toContain(rulesHash(changed));
            expect(text).toContain(rulesHash(DEFAULTS));
            expect(text).toContain('STALE');
        });
    });
});
