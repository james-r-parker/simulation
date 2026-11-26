import { describe, expect, it } from 'vitest';
import { splitHeadlines } from '../scripts/lib/compare-headlines.mjs';

/** @param {string} metric @returns {{metric: string}} a row */
const row = (metric) => ({ metric });

describe('splitHeadlines', () => {
    const rows = [
        row('eval.food_energy_per_1k@20k'),
        row('eval.hunt_abort_rate'),
        row('eval.alarm_lift'),
        row('eval.hunter_catches_per_1k_settled'),
        row('eval.herd_animals'),
    ];

    it('puts a headline (a world or a scene one, at any checkpoint) in the head, in report order', () => {
        const { head, rest } = splitHeadlines(rows, []);
        expect(head.map((r) => r.metric)).toEqual([
            'eval.food_energy_per_1k@20k',
            'eval.hunt_abort_rate',
            'eval.hunter_catches_per_1k_settled',
            'eval.herd_animals',
        ]);
        expect(rest.map((r) => r.metric)).toEqual(['eval.alarm_lift']);
    });

    it("also puts the plan's Targets in the head", () => {
        const { head, rest } = splitHeadlines(rows, ['eval.alarm_lift']);
        expect(head.map((r) => r.metric)).toContain('eval.alarm_lift');
        expect(rest).toEqual([]);
    });

    it('keeps every row in one of the two lists', () => {
        const { head, rest } = splitHeadlines(rows, []);
        expect(head.length + rest.length).toBe(rows.length);
    });
});
