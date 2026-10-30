import { describe, expect, it } from 'vitest';
import { FAMILY_FLOOR, formatViability, viabilityTable } from '../scripts/lib/viability-table.mjs';

/**
 * @param {Record<string, (number | null)[]>} values per-seed values by metric name
 * @returns {Record<string, any>} a two-seed report with traces
 */
function report(values) {
    return {
        seeds: [1, 2],
        config: { specialisations: { forager: { index: 0 }, predator: { index: 1 } } },
        metrics: Object.fromEntries(Object.entries(values).map(([name, v]) => [name, { values: v }])),
        traces: [{ spec: [40, 5] }, { spec: [60, 0] }],
    };
}

describe('viabilityTable', () => {
    it('prints a row per seed with the metrics, the population by specialisation and the final population', () => {
        const { header, rows } = viabilityTable(
            report({ 'eval.predators_at_end': [5, 0], 'eval.deliberate_food_share': [0.5123, null] }),
        );
        expect(header[0]).toBe('seed');
        expect(header.slice(-3)).toEqual(['forager', 'predator', 'final population']);
        expect(rows[0][header.indexOf('predators')]).toBe('5');
        expect(rows[0][header.indexOf('deliberate share')]).toBe('0.512');
        expect(rows[1][header.indexOf('deliberate share')]).toBe('-');
        expect(rows[0].slice(-3)).toEqual(['40', '5', '45']);
        expect(rows[1].slice(-3)).toEqual(['60', '0', '60']);
    });

    it('counts the gate: predators and a prey type alive, and families at or over the floor', () => {
        const { gate } = viabilityTable(
            report({
                'eval.predators_at_end': [5, 0],
                'eval.prey_types_at_end': [2, 1],
                'eval.basin_lineage_effective': [FAMILY_FLOOR, FAMILY_FLOOR - 0.1],
            }),
        );
        expect(gate).toEqual({ seeds: 2, alive: 1, families: 1 });
    });

    it('prints a dash for a report without traces or a metric', () => {
        const bare = { ...report({}), traces: undefined };
        const { rows } = viabilityTable(bare);
        expect(rows[0].slice(1).every((c) => c === '-')).toBe(true);
    });
});

describe('formatViability', () => {
    it('is a Markdown table with the gate counts under it', () => {
        const text = formatViability(viabilityTable(report({ 'eval.predators_at_end': [1, 1] })), 'E81');
        expect(text).toMatch(/^### E81\n\n\| seed \|/);
        expect(text).toContain('| --- |');
        expect(text).toContain('Predators and a prey type alive at the last tick: 0 of 2 seeds.');
    });
});
