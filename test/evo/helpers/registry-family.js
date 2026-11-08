// Shared checks for one registry family file: every entry names its family, an existing module, a valid direction and
// existing test files that name the metric.

import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('../../../', import.meta.url);

/**
 * @param {string} family the family name the entries must carry
 * @param {Record<string, import('../../../js/evo/metric-registry/entry.js').MetricEntry>} table the family file's export
 * @returns {void}
 */
export function describeFamily(family, table) {
    describe(`${family} registry entries`, () => {
        it.each(Object.entries(table))('%s is complete and names real files', (name, e) => {
            expect(name.startsWith('eval.')).toBe(true);
            expect(e.family).toBe(family);
            expect(existsSync(new URL(e.module, ROOT)), e.module).toBe(true);
            expect(e.meaning.length).toBeGreaterThan(0);
            expect(e.counts.length).toBeGreaterThan(0);
            expect(e.unit.length).toBeGreaterThan(0);
            expect(e.direction === 'watch' ? ['higher', 'lower'] : [undefined]).toContain(e.intended);
            const bare = name.replace(/^eval\./, '');
            for (const path of [e.tests.arithmetic, e.tests.source].filter((p) => p !== '')) {
                expect(readFileSync(new URL(path, ROOT), 'utf8'), path).toContain(bare);
            }
        });
    });
}
