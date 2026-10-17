// Lineage standings for the stats message: counts rebuilt from the alive agents, the top lineages, and the
// `new-leader` and `extinct` ticker conditions.

/** Lineages listed in the stats. */
export const TOP_LINEAGES = 8;

/** A new leader must lead the runner-up by at least this many agents. */
export const LEAD_MARGIN = 2;

/** A lineage that led within this many ticks does not announce a new lead. */
export const LEAD_COOLDOWN_TICKS = 10000;

/** A lineage must reach this many agents before its extinction is announced. */
export const EXTINCT_PEAK = 10;

/**
 * @typedef {object} LineageBoard
 * @property {Map<number, number>} counts alive agents by lineage, rebuilt by `rebuildCounts`
 * @property {Set<number>} big lineages that have reached `EXTINCT_PEAK` and are not extinct
 * @property {Map<number, number>} ledAt the last tick each recent leader led
 * @property {number} leader the lineage that currently leads, 0 for none
 */

/** @returns {LineageBoard} an empty board */
export function createLineageBoard() {
    return { counts: new Map(), big: new Set(), ledAt: new Map(), leader: 0 };
}

/**
 * Counts the alive agents by lineage into `board.counts`.
 * @param {LineageBoard} board the board
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function rebuildCounts(board, world) {
    const { alive, lineageId } = world;
    board.counts.clear();
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            board.counts.set(lineageId[slot], (board.counts.get(lineageId[slot]) ?? 0) + 1);
        }
    }
}

/**
 * @param {LineageBoard} board the board, after `rebuildCounts`
 * @param {number} population alive agents, for the shares
 * @returns {{id: number, count: number, share: number}[]} the largest `TOP_LINEAGES` lineages, largest first, ties
 *   broken by the lower id
 */
export function topLineages(board, population) {
    const all = [...board.counts].map(([id, count]) => ({ id, count, share: count / population }));
    all.sort((a, b) => b.count - a.count || a.id - b.id);
    return all.slice(0, TOP_LINEAGES);
}

/**
 * @param {LineageBoard} board the board
 * @param {number} tick the current tick
 * @returns {void}
 */
function forgetOldLeaders(board, tick) {
    for (const [id, last] of board.ledAt) {
        if (tick - last > LEAD_COOLDOWN_TICKS && id !== board.leader) {
            board.ledAt.delete(id);
        }
    }
}

/**
 * Applies the leader rule: the lineage with a lead of `LEAD_MARGIN` is the leader, and is announced when it was not
 * already and has not led within `LEAD_COOLDOWN_TICKS`. Forgets old leaders.
 * @param {LineageBoard} board the board
 * @param {{id: number, count: number}[]} top the top lineages from `topLineages`
 * @param {number} tick the current tick
 * @returns {number} the lineage that has just taken the lead, 0 for none
 */
function updateLeader(board, top, tick) {
    let announced = 0;
    const first = top[0];
    if (first !== undefined && first.count - (top[1] ? top[1].count : 0) >= LEAD_MARGIN) {
        const last = board.ledAt.get(first.id);
        if (first.id !== board.leader && (last === undefined || tick - last > LEAD_COOLDOWN_TICKS)) {
            announced = first.id;
        }
        board.leader = first.id;
        board.ledAt.set(first.id, tick);
    }
    forgetOldLeaders(board, tick);
    return announced;
}

/**
 * Applies the extinction rule: a lineage that reached `EXTINCT_PEAK` agents and now has none has died out.
 * @param {LineageBoard} board the board, after `rebuildCounts`
 * @returns {number[]} the lineages that have just died out
 */
function updateExtinct(board) {
    /** @type {number[]} */
    const extinct = [];
    for (const id of board.big) {
        if (!board.counts.has(id)) {
            board.big.delete(id);
            extinct.push(id);
        }
    }
    for (const [id, count] of board.counts) {
        if (count >= EXTINCT_PEAK) {
            board.big.add(id);
        }
    }
    return extinct;
}

/**
 * Applies the leader and extinction rules to the new counts and returns what to announce.
 * @param {LineageBoard} board the board, after `rebuildCounts`
 * @param {{id: number, count: number}[]} top the top lineages from `topLineages`
 * @param {number} tick the current tick
 * @returns {{leader: number, extinct: number[]}} the lineage that has just taken the lead (0 for none) and the
 *   lineages that have just died out
 */
export function updateBoard(board, top, tick) {
    return { leader: updateLeader(board, top, tick), extinct: updateExtinct(board) };
}
