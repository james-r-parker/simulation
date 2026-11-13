import { describe, expect, it } from 'vitest';
import { BRAIN_LAYOUT_NAME, RAY_CHANNELS } from '../../js/sim/brain-layout.js';
import { FLORA_DEFAULTS } from '../../js/sim/config-flora.js';
import { senseAll } from '../../js/sim/sensors.js';
import { buildHash } from '../../js/sim/spatial-hash.js';
import { arenaConfig } from '../../js/evo/memory-probe-run.js';
import { stageWorld } from '../../js/evo/pool-discrimination-stage.js';
import { caseNamed } from '../../js/evo/reflex-cases.js';
import { SEQUENCE_TICKS } from '../../js/evo/reflex-stage.js';
import { assertTableFresh, buildCaseTable, tableFor } from '../../js/evo/reflex-table.js';

/** Ray channels in a raw row. */
const CH = { food: 1, threat: 2, prey: 3, other: 4, kin: 5, wall: 6, obstacle: 7 };

/**
 * @param {import('../../js/evo/reflex-table.js').CaseTable} table a table
 * @param {number} sequence a sequence index
 * @param {number} tick a tick
 * @returns {Float32Array} that row
 */
function rowAt(table, sequence, tick) {
    const at = sequence * SEQUENCE_TICKS + tick;
    return table.rows.subarray(at * table.rawInputCount, (at + 1) * table.rawInputCount);
}

/**
 * @param {Float32Array} row a raw row
 * @param {number} channel a ray channel
 * @returns {number[]} the rays that carry it
 */
function raysWith(row, channel) {
    const rays = [];
    for (let k = 0; k < (row.length - 36) / RAY_CHANNELS; k++) {
        if (row[k * RAY_CHANNELS + channel] > 0) {
            rays.push(k);
        }
    }
    return rays;
}

describe('buildCaseTable', () => {
    it('copies the row senseAll writes for the same stage, not a typed one', () => {
        const table = buildCaseTable(caseNamed('approach-food'), { trials: 2 });
        const staging = table.sequences[0].staging;
        const { world } = stageWorld({ ...staging.ticks[0], seed: 1, config: arenaConfig({}) });
        buildHash(world.hash, world);
        senseAll(world, world.hash);
        const expected = world.inputs.slice(0, world.layout.rawInputCount);
        for (let t = 0; t < SEQUENCE_TICKS; t++) {
            expect([...rowAt(table, 0, t)]).toEqual([...expected]);
        }
        expect(expected.some((/** @type {number} */ v) => v > 0)).toBe(true);
    });

    it('draws sequences per trial from the case stream and replays bit for bit', () => {
        const a = buildCaseTable(caseNamed('avoid-obstacle'), { trials: 3, seed: 5 });
        const b = buildCaseTable(caseNamed('avoid-obstacle'), { trials: 3, seed: 5 });
        const c = buildCaseTable(caseNamed('avoid-obstacle'), { trials: 3, seed: 6 });
        expect(a.sequences).toHaveLength(18);
        expect(a.sequences.map((s) => s.trial)).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2]);
        expect(a.rows).toEqual(b.rows);
        expect(a.rows).not.toEqual(c.rows);
        expect(a.rows).toHaveLength(18 * SEQUENCE_TICKS * a.rawInputCount);
        expect(a.hues).toHaveLength(18 * SEQUENCE_TICKS * a.rayCount);
    });

    it('stamps the layout name, the rules hash and the width of a row', () => {
        const table = buildCaseTable(caseNamed('approach-prey'), { trials: 1 });
        expect(table.layoutName).toBe(BRAIN_LAYOUT_NAME);
        expect(table.rulesHash).toMatch(/^[0-9a-f]{16}$/);
        expect(table.rawInputCount).toBe(16 * RAY_CHANNELS + 38);
        expect(table.spec).toBe(1);
    });

    it('changes with the ray count', () => {
        const wide = buildCaseTable(caseNamed('approach-food'), { trials: 1 });
        const narrow = buildCaseTable(caseNamed('approach-food'), { trials: 1, config: { rayCount: 8 } });
        expect(narrow.rawInputCount).toBe(8 * RAY_CHANNELS + 38);
        expect(narrow.rawInputCount).not.toBe(wide.rawInputCount);
        expect(narrow.rulesHash).not.toBe(wide.rulesHash);
    });

    it('repeats a static staging and changes a moving one tick by tick', () => {
        const food = buildCaseTable(caseNamed('approach-food'), { trials: 1 });
        expect([...rowAt(food, 0, 0)]).toEqual([...rowAt(food, 0, 5)]);
        const chase = buildCaseTable(caseNamed('flee-threat'), { trials: 1 });
        expect([...rowAt(chase, 0, 0)]).not.toEqual([...rowAt(chase, 0, 5)]);
        const nearest = (/** @type {number} */ t) =>
            Math.max(...raysWith(rowAt(chase, 0, t), CH.threat).map((k) => rowAt(chase, 0, t)[k * RAY_CHANNELS]));
        expect(nearest(5)).toBeGreaterThan(nearest(0));
    });

    it('snapshots the food hues the pooled hue inputs are made from', () => {
        const table = buildCaseTable(caseNamed('pick-safe-food'), { trials: 1 });
        const hues = [...table.hues.subarray(0, table.rayCount)].filter((h) => h !== 0);
        expect(new Set(hues.map((h) => Math.fround(h)))).toEqual(
            new Set([Math.fround(FLORA_DEFAULTS.toxiccap.hue), Math.fround(FLORA_DEFAULTS.grass.hue)]),
        );
    });
});

describe('what the sim senses in the staged scenes', () => {
    it('shows a wall and a rock ahead, and a rock beside with food ahead', () => {
        const table = buildCaseTable(caseNamed('avoid-obstacle'), { trials: 1 });
        const [wall, ahead, beside] = [0, 1, 2].map((i) => rowAt(table, i, 0));
        expect(raysWith(wall, CH.wall).length).toBeGreaterThan(0);
        expect(raysWith(ahead, CH.obstacle).length).toBeGreaterThan(0);
        expect(raysWith(beside, CH.obstacle).length).toBeGreaterThan(0);
        expect(raysWith(beside, CH.food)).toContain(0);
    });

    it('shows the prey as prey, the too-big forager as other and the kin as kin', () => {
        const table = buildCaseTable(caseNamed('bite-discrimination'), { trials: 1 });
        const [prey, big, kin] = [0, 1, 2].map((i) => rowAt(table, i, 0));
        expect(raysWith(prey, CH.prey).length).toBeGreaterThan(0);
        expect(raysWith(big, CH.prey)).toEqual([]);
        expect(raysWith(big, CH.other).length).toBeGreaterThan(0);
        expect(raysWith(kin, CH.kin).length).toBeGreaterThan(0);
        expect(raysWith(kin, CH.prey)).toEqual([]);
    });

    it('shows the hunter as a threat to the forager', () => {
        const table = buildCaseTable(caseNamed('flee-threat'), { trials: 1 });
        expect(raysWith(rowAt(table, 0, 5), CH.threat).length).toBeGreaterThan(0);
    });
});

describe('assertTableFresh', () => {
    it('accepts the config the table was built under', () => {
        const table = buildCaseTable(caseNamed('approach-prey'), { trials: 1 });
        expect(() => assertTableFresh(table, {})).not.toThrow();
        expect(() => assertTableFresh(table, { maxAgents: 600, initialAgents: 10 })).not.toThrow();
    });

    it('throws ReflexTableStale for another rules hash or layout name', () => {
        const table = buildCaseTable(caseNamed('approach-prey'), { trials: 1 });
        expect(() => assertTableFresh(table, { rayCount: 8 })).toThrow(/ReflexTableStale: case approach-prey/);
        expect(() => assertTableFresh({ ...table, layoutName: 'pooled-v4' }, {})).toThrow(/ReflexTableStale/);
    });
});

describe('tableFor', () => {
    it('builds a table once per case, seed, trials and config', () => {
        const a = tableFor(caseNamed('approach-prey'), { trials: 2, seed: 9 });
        expect(tableFor(caseNamed('approach-prey'), { trials: 2, seed: 9 })).toBe(a);
        expect(tableFor(caseNamed('approach-prey'), { trials: 2, seed: 10 })).not.toBe(a);
        expect(tableFor(caseNamed('approach-prey'), { trials: 3, seed: 9 })).not.toBe(a);
    });
});
