// Shared by the gate-validity slow tests: the frozen ladder and the drill groups it is read in. One `gateValidity` run of the
// whole ladder took 119.5 s of its 120 s limit (2026-11-22), so each group is its own test file; the fast test
// `gate-validity-groups.test.js` checks the groups cover every drill the ladder gates.

import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { gateValidity } from '../../../js/evo/gate-validity.js';
import { partitionSeed } from '../../../js/evo/partitions.js';

export const LADDER = JSON.parse(readFileSync(new URL('../../fixtures/train-ladder.json', import.meta.url), 'utf8'));

/** The drills each slow test file reads, about 15 s of work apiece. */
export const GROUPS = Object.freeze({
    a: ['food-ahead', 'food-behind', 'prey-adrift'],
    b: ['prey-weak', 'prey-mid'],
    c: ['prey-ahead', 'prey-crossing'],
    d: ['kin-spared', 'hunter-closing', 'hunter-flank'],
});

/**
 * @param {readonly string[]} drills drill names
 * @returns {any[]} the ladder with only the conditions that read those drills, stages left with none dropped
 */
export function ladderOfDrills(drills) {
    return LADDER.map((/** @type {any} */ e) => ({
        ...e,
        gate: (e.gate ?? []).filter(
            (/** @type {any} */ c) => drills.includes(c.read.split('.')[1]) && c.read.startsWith('drill.'),
        ),
    })).filter((/** @type {any} */ e) => e.gate.length > 0);
}

/**
 * Runs `gateValidity` at a gate checkpoint's 64 trials on the gate seed over a group's drills, and asserts every condition has a
 * reference that passes it and random brains that fail it.
 * @param {readonly string[]} drills the group's drill names
 * @returns {import('../../../js/evo/gate-validity.js').Validity[]} the rows
 */
export function checkedRows(drills) {
    const ladder = ladderOfDrills(drills);
    const rows = gateValidity(ladder, { seed: partitionSeed('validation', 0), trials: 64 });
    expect(rows.length).toBe(ladder.reduce((n, e) => n + e.gate.length, 0));
    for (const row of rows) {
        expect(row.level, `${row.stage} ${row.read}`).not.toBe('none');
        expect(row.randomFails, `${row.stage} ${row.read}`).toBe(true);
    }
    return rows;
}
