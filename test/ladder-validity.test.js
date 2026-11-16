import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REFERENCE_KINDS } from '../js/evo/gate-validity.js';
import { formatValidity, main } from '../scripts/ladder-validity.mjs';

describe('formatValidity', () => {
    it('prints a header and one line per condition with its weakest passing reference', () => {
        const passedBy = Object.fromEntries(REFERENCE_KINDS.map((k) => [k, k === 'oracle']));
        const lines = formatValidity([
            { stage: 'hunt', read: 'drill.kin-spared.edgeLow', passedBy, randomFails: true, level: 'oracle' },
        ]);
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('random-fails');
        expect(lines[1]).toContain('drill.kin-spared.edgeLow');
        expect(lines[1].trim().endsWith('oracle')).toBe(true);
    });
});

describe('main', () => {
    /** @param {unknown} gate the one condition's gate @returns {{code: number, out: string}} what `main` returned and printed */
    function run(gate) {
        const dir = mkdtempSync(join(tmpdir(), 'ladder-validity-'));
        const file = join(dir, 'ladder.json');
        writeFileSync(
            file,
            JSON.stringify([{ name: 'probe', config: null, minGenerations: 1, maxGenerations: 2, gate }]),
        );
        const log = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            const code = main(['--ladder', file, '--trials', '8', '--seed', '2']);
            return { code, out: log.mock.calls.flat().join('\n') };
        } finally {
            log.mockRestore();
            rmSync(dir, { recursive: true, force: true });
        }
    }

    it('prints the table and exits 0 when every condition is valid', () => {
        const { code, out } = run([{ read: 'drill.food-ahead.edgeLow', min: 0.3 }]);
        expect(code).toBe(0);
        expect(out).toContain('drill.food-ahead.edgeLow');
    });

    it('exits 1 on a condition no reference passes', () => {
        expect(run([{ read: 'drill.food-ahead.edgeLow', min: 1.5 }]).code).toBe(1);
    });
});
