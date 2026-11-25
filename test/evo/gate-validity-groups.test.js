import { describe, expect, it } from 'vitest';
import { GROUPS, LADDER, ladderOfDrills } from './helpers/gate-validity-ladder.js';

const drillsGated = () => [
    ...new Set(
        LADDER.flatMap((/** @type {any} */ e) =>
            (e.gate ?? []).flatMap((/** @type {any} */ c) =>
                c.read.startsWith('drill.') ? [c.read.split('.')[1]] : [],
            ),
        ),
    ),
];

describe('the gate-validity drill groups', () => {
    it('cover every drill the ladder gates, each in one group', () => {
        const grouped = Object.values(GROUPS).flat();
        expect(new Set(grouped).size).toBe(grouped.length);
        expect([...grouped].sort()).toEqual(drillsGated().sort());
    });

    it('together hold every drill condition of the ladder', () => {
        const total = Object.values(GROUPS).reduce(
            (n, drills) => n + ladderOfDrills(drills).reduce((m, e) => m + e.gate.length, 0),
            0,
        );
        const all = LADDER.reduce(
            (/** @type {number} */ n, /** @type {any} */ e) =>
                n + (e.gate ?? []).filter((/** @type {any} */ c) => c.read.startsWith('drill.')).length,
            0,
        );
        expect(total).toBe(all);
        expect(total).toBeGreaterThan(8);
    });
});
