import { describe, expect, it } from 'vitest';
import { createObserver } from '../../js/evo/observer.js';
import { createRng } from '../../js/sim/rng.js';
import { createRecords, familyRows, noteRecords } from '../../js/worker/world-board.js';
import { createGenerations } from '../../js/worker/generation.js';
import { smallWorld } from '../sim/helpers/small-world.js';

/**
 * @param {{slot: number, lineage: number, genome: number, spec: number, age: number, kills?: number, children?: number,
 *   depth?: number}[]} agents the alive agents
 * @returns {{world: ReturnType<typeof smallWorld>, observer: Record<string, any>, generations: ReturnType<typeof createGenerations>}}
 *   a world holding them, with its observer and generation depths
 */
function worldOf(agents) {
    const world = smallWorld();
    const observer = createObserver(world.config, createRng(1));
    const generations = createGenerations(world.config);
    world.alive.fill(0);
    for (const a of agents) {
        world.alive[a.slot] = 1;
        world.lineageId[a.slot] = a.lineage;
        world.genomeId[a.slot] = a.genome;
        world.spec[a.slot] = a.spec;
        world.ageTicks[a.slot] = a.age;
        observer.kills[a.slot] = a.kills ?? 0;
        observer.children[a.slot] = a.children ?? 0;
        generations.depth[a.slot] = a.depth ?? 0;
    }
    return { world, observer, generations };
}

const AGENTS = [
    { slot: 0, lineage: 5, genome: 100, spec: 0, age: 300, kills: 0, children: 2, depth: 1 },
    { slot: 1, lineage: 5, genome: 101, spec: 1, age: 900, kills: 4, children: 0, depth: 6 },
    { slot: 2, lineage: 5, genome: 102, spec: 1, age: 50, kills: 1, children: 1, depth: 3 },
    { slot: 3, lineage: 8, genome: 200, spec: 3, age: 700, kills: 0, children: 5, depth: 2 },
    { slot: 4, lineage: 9, genome: 300, spec: 2, age: 10, kills: 0, children: 0, depth: 0 },
];

describe('familyRows', () => {
    it('gives each listed family its mix, kills, deepest generation and oldest member, in the order asked', () => {
        const source = worldOf(AGENTS);
        const rows = familyRows(
            [
                { id: 8, count: 1, share: 0.2 },
                { id: 5, count: 3, share: 0.6 },
            ],
            source,
        );
        expect(rows).toEqual([
            {
                id: 8,
                count: 1,
                share: 0.2,
                oldestGenomeId: 200,
                oldestAgeTicks: 700,
                bySpec: [0, 0, 0, 1, 0],
                kills: 0,
                deepest: 2,
            },
            {
                id: 5,
                count: 3,
                share: 0.6,
                oldestGenomeId: 101,
                oldestAgeTicks: 900,
                bySpec: [1, 2, 0, 0, 0],
                kills: 5,
                deepest: 6,
            },
        ]);
    });

    it('leaves out the dead and the families not asked for, and has an empty row for a family with no one alive', () => {
        const source = worldOf(AGENTS);
        source.world.alive[1] = 0;
        const [row, gone] = familyRows(
            [
                { id: 5, count: 2, share: 0.5 },
                { id: 77, count: 0, share: 0 },
            ],
            source,
        );
        expect([row.oldestGenomeId, row.kills, row.bySpec]).toEqual([100, 1, [1, 1, 0, 0, 0]]);
        expect(gone).toMatchObject({ oldestGenomeId: 0, oldestAgeTicks: -1, deepest: 0, kills: 0 });
    });
});

describe('noteRecords', () => {
    it('takes the greatest life, kills and children among the alive, with their holders', () => {
        const records = createRecords();
        const out = noteRecords(records, worldOf(AGENTS));
        expect(out).toEqual({
            longestLife: { value: 900, genomeId: 101, alive: true },
            mostKills: { value: 4, genomeId: 101, alive: true },
            mostChildren: { value: 5, genomeId: 200, alive: true },
        });
    });

    it('keeps a record after its holder dies, and says the holder is gone', () => {
        const records = createRecords();
        const source = worldOf(AGENTS);
        noteRecords(records, source);
        source.world.alive[1] = 0;
        source.world.alive[3] = 0;
        const out = noteRecords(records, source);
        expect(out.longestLife).toEqual({ value: 900, genomeId: 101, alive: false });
        expect(out.mostChildren).toEqual({ value: 5, genomeId: 200, alive: false });
    });

    it('hands the record to a newcomer that beats it, and is empty with no one alive or no record yet', () => {
        const records = createRecords();
        const source = worldOf(AGENTS);
        noteRecords(records, source);
        source.world.ageTicks[4] = 5000;
        expect(noteRecords(records, source).longestLife).toEqual({ value: 5000, genomeId: 300, alive: true });
        const empty = noteRecords(createRecords(), worldOf([]));
        expect(empty.longestLife).toEqual({ value: 0, genomeId: 0, alive: false });
    });

    it('returns a copy, so a posted message does not change when the records do', () => {
        const records = createRecords();
        const first = noteRecords(records, worldOf(AGENTS));
        records.longestLife.value = 1;
        expect(first.longestLife.value).toBe(900);
    });
});
