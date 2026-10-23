import { describe, expect, it } from 'vitest';
import {
    EXTINCT_PEAK,
    LEAD_COOLDOWN_TICKS,
    TOP_LINEAGES,
    createLineageBoard,
    rebuildCounts,
    topLineages,
    updateBoard,
} from '../../js/worker/lineage-board.js';

/**
 * Sets the board's counts directly, as `rebuildCounts` would.
 * @param {ReturnType<typeof createLineageBoard>} board the board
 * @param {Record<number, number>} counts lineage id to agents
 * @returns {{id: number, count: number, share: number}[]} the top lineages
 */
function setCounts(board, counts) {
    board.counts.clear();
    for (const [id, count] of Object.entries(counts)) {
        board.counts.set(Number(id), count);
    }
    return topLineages(board, 100);
}

describe('rebuildCounts and topLineages', () => {
    it('counts alive agents by lineage and ignores the dead', () => {
        const board = createLineageBoard();
        rebuildCounts(board, { alive: [1, 1, 0, 1], lineageId: [5, 5, 5, 6] });
        expect([...board.counts]).toEqual([
            [5, 2],
            [6, 1],
        ]);
    });

    it('lists the largest 12, largest first, ties by the lower id, with shares', () => {
        const board = createLineageBoard();
        const counts = Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i + 1, i === 3 ? 20 : 5]));
        const top = setCounts(board, counts);
        expect(TOP_LINEAGES).toBe(12);
        expect(top).toHaveLength(TOP_LINEAGES);
        expect(top[0]).toEqual({ id: 4, count: 20, share: 0.2 });
        expect(top.slice(1).map((t) => t.id)).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]);
    });
});

describe('updateBoard leader', () => {
    it('announces a lineage that leads by 2 and not one that leads by 1', () => {
        const board = createLineageBoard();
        expect(updateBoard(board, setCounts(board, { 1: 6, 2: 5 }), 100).leader).toBe(0);
        expect(updateBoard(board, setCounts(board, { 1: 7, 2: 5 }), 101).leader).toBe(1);
    });

    it('announces a lead once, not on every update', () => {
        const board = createLineageBoard();
        updateBoard(board, setCounts(board, { 1: 9, 2: 5 }), 100);
        expect(updateBoard(board, setCounts(board, { 1: 9, 2: 5 }), 200).leader).toBe(0);
    });

    it('does not announce a lineage that led within the last 10000 ticks, and does after', () => {
        const board = createLineageBoard();
        updateBoard(board, setCounts(board, { 1: 9, 2: 5 }), 100);
        updateBoard(board, setCounts(board, { 1: 5, 2: 9 }), 200);
        expect(updateBoard(board, setCounts(board, { 1: 9, 2: 5 }), 300).leader).toBe(0);
        updateBoard(board, setCounts(board, { 1: 5, 2: 9 }), 400);
        expect(updateBoard(board, setCounts(board, { 1: 9, 2: 5 }), 300 + LEAD_COOLDOWN_TICKS + 1).leader).toBe(1);
    });

    it('forgets a lineage that has not led for the cooldown, but keeps the current leader', () => {
        const board = createLineageBoard();
        updateBoard(board, setCounts(board, { 1: 9, 2: 5 }), 100);
        updateBoard(board, setCounts(board, { 1: 5, 2: 9 }), 200);
        expect([...board.ledAt.keys()].sort()).toEqual([1, 2]);
        updateBoard(board, setCounts(board, { 1: 5, 2: 9 }), 200 + LEAD_COOLDOWN_TICKS + 1);
        expect([...board.ledAt.keys()]).toEqual([2]);
    });
});

describe('updateBoard extinction', () => {
    it('announces a lineage that reached 10 agents and then has none', () => {
        const board = createLineageBoard();
        updateBoard(board, setCounts(board, { 1: EXTINCT_PEAK, 2: 3 }), 100);
        expect(updateBoard(board, setCounts(board, { 2: 3 }), 200).extinct).toEqual([1]);
        expect(updateBoard(board, setCounts(board, { 2: 3 }), 300).extinct).toEqual([]);
    });

    it('stays silent for a lineage that never reached 10', () => {
        const board = createLineageBoard();
        updateBoard(board, setCounts(board, { 1: EXTINCT_PEAK - 1, 2: 3 }), 100);
        expect(updateBoard(board, setCounts(board, { 2: 3 }), 200).extinct).toEqual([]);
    });
});
