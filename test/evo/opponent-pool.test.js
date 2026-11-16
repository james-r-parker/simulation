import { describe, expect, it } from 'vitest';
import {
    POOL_EVERY,
    POOL_MAX,
    addSnapshot,
    createPool,
    describePool,
    noteCheckpoint,
    stagePassSnapshot,
} from '../../js/evo/opponent-pool.js';

/**
 * @param {number} generation the generation
 * @param {'stage-pass' | 'periodic'} kind the kind
 * @param {string} [stage] the stage
 * @returns {import('../../js/evo/opponent-pool.js').PoolEntry} an entry with no archive
 */
function entry(generation, kind, stage = 's') {
    return { snapshot: /** @type {any} */ ({ generation }), generation, stage, kind };
}

describe('addSnapshot', () => {
    it('holds at most POOL_MAX snapshots, dropping the oldest periodic one first', () => {
        let pool = addSnapshot(createPool(), entry(0, 'stage-pass', 'nursery'));
        for (let g = 1; g <= POOL_MAX + 2; g++) {
            pool = addSnapshot(pool, entry(g, 'periodic'));
        }
        expect(pool.entries).toHaveLength(POOL_MAX);
        expect(pool.entries[0]).toMatchObject({ generation: 0, kind: 'stage-pass' });
        expect(pool.entries.slice(1).map((e) => e.generation)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    });

    it('drops the oldest stage-pass snapshot only when every snapshot is a stage pass', () => {
        let pool = createPool();
        for (let g = 0; g <= POOL_MAX; g++) {
            pool = addSnapshot(pool, entry(g, 'stage-pass', `stage${g}`));
        }
        expect(pool.entries.map((e) => e.generation)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    it('does not change the pool it was given', () => {
        const before = createPool();
        addSnapshot(before, entry(1, 'periodic'));
        expect(before.entries).toHaveLength(0);
    });
});

describe('noteCheckpoint', () => {
    it('takes a periodic snapshot every POOL_EVERY checkpoints and a stage-pass snapshot at a pass', () => {
        let pool = createPool();
        const takes = [];
        for (let i = 0; i < 2 * POOL_EVERY; i++) {
            const noted = noteCheckpoint(pool, { stagePassed: null });
            pool = noted.pool;
            takes.push(noted.take);
        }
        expect(takes).toEqual([null, 'periodic', null, 'periodic']);
        expect(noteCheckpoint(pool, { stagePassed: 'hunt' }).take).toBe('stage-pass');
        expect(noteCheckpoint(pool, { stagePassed: 'hunt' }).pool.checkpoints).toBe(5);
    });
});

describe('stagePassSnapshot and describePool', () => {
    const pool = addSnapshot(
        addSnapshot(addSnapshot(createPool(), entry(3, 'stage-pass', 'hunt')), entry(5, 'periodic', 'evade')),
        entry(8, 'stage-pass', 'evade'),
    );

    it('finds the snapshot taken when a stage passed, or none', () => {
        expect(stagePassSnapshot(pool, 'hunt')?.generation).toBe(3);
        expect(stagePassSnapshot(pool, 'evade')?.generation).toBe(8);
        expect(stagePassSnapshot(pool, 'pack')).toBeNull();
    });

    it('describes each snapshot without its archive', () => {
        expect(describePool(pool)).toEqual([
            { generation: 3, stage: 'hunt', kind: 'stage-pass' },
            { generation: 5, stage: 'evade', kind: 'periodic' },
            { generation: 8, stage: 'evade', kind: 'stage-pass' },
        ]);
    });
});
