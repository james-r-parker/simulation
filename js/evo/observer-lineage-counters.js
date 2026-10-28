// The observer's lineage counters (fitness-and-selection.md, Fitness v6): per slot `matings`, `maturedChildren` and
// `descendantsAlive`, all reset when a slot is reborn into and all still readable in `finishDeath`, because the
// observer keeps its own slot arrays after the sim frees the slot.
//
// - `matings`: a `mate` AgentBorn credits the mother and father once each, by genome id.
// - `maturedChildren`: a tracked child whose `world.ageTicks` equals `maturityTicks` (the sim's `creditMatured` test)
//   credits its parents once, found by genome id, so a dead parent or a reused slot is never credited. A split child
//   names one parent twice and credits it once.
// - `descendantsAlive`: the alive agents with the dying agent's genome among their ancestors, up to `DEPTH` generations
//   back, counted just before the tick's deaths and births are released. It is kept incrementally: each genome is a node
//   with a count of alive descendants; a birth adds 1 to every distinct ancestor within `DEPTH` and a death takes it off,
//   so a death reads one number. A node lives while its agent is alive or its count is above 0, then its index is reused.
//
// Nothing here touches the world, and nothing allocates per tick but a Map entry per birth.

import { BORN_CAUSE, EVENT_STRIDE, EVENT_TYPE } from '../sim/events.js';

/** How many generations back a birth counts as a descendant: the parents are generation 1. `FAMILY_CAP` is 10. */
export const DEPTH = 8;

const NONE = -1;
/** The most distinct ancestors within `DEPTH`: 2 + 4 + ... + 2^DEPTH. */
const QUEUE_SIZE = 1 << (DEPTH + 1);

/**
 * @param {number} capacity the starting node capacity (the world's agent slots, doubled when full)
 * @returns {Record<string, any>} an empty family tree
 */
export function createFamilyTree(capacity) {
    return {
        capacity,
        genome: new Uint32Array(capacity),
        parentA: new Int32Array(capacity).fill(NONE),
        parentB: new Int32Array(capacity).fill(NONE),
        count: new Uint32Array(capacity),
        alive: new Uint8Array(capacity),
        mark: new Uint32Array(capacity),
        epoch: 0,
        nodeOf: new Map(),
        free: [],
        used: 0,
        queue: new Int32Array(QUEUE_SIZE),
        visited: 0,
    };
}

/**
 * Doubles every node column.
 * @param {Record<string, any>} tree the family tree
 * @returns {void}
 */
function grow(tree) {
    const capacity = tree.capacity * 2;
    for (const name of ['genome', 'parentA', 'parentB', 'count', 'alive', 'mark']) {
        const grown = new tree[name].constructor(capacity);
        grown.set(tree[name]);
        tree[name] = grown;
    }
    tree.capacity = capacity;
}

/**
 * Collects into `tree.queue` the distinct nodes within `DEPTH` generations above the parents `a` and `b` (the parents
 * themselves are generation 1), breadth first; `tree.visited` is how many.
 * @param {Record<string, any>} tree the family tree
 * @param {number} a a parent's node, or `NONE`
 * @param {number} b a parent's node, or `NONE`
 * @returns {void}
 */
function collectAncestors(tree, a, b) {
    const { queue, mark, parentA, parentB } = tree;
    const epoch = ++tree.epoch;
    let tail = 0;
    if (a !== NONE) {
        mark[a] = epoch;
        queue[tail++] = a;
    }
    if (b !== NONE && b !== a) {
        mark[b] = epoch;
        queue[tail++] = b;
    }
    let head = 0;
    for (let level = 1; level < DEPTH; level++) {
        const end = tail;
        for (; head < end; head++) {
            const up1 = parentA[queue[head]];
            const up2 = parentB[queue[head]];
            if (up1 !== NONE && mark[up1] !== epoch) {
                mark[up1] = epoch;
                queue[tail++] = up1;
            }
            if (up2 !== NONE && mark[up2] !== epoch) {
                mark[up2] = epoch;
                queue[tail++] = up2;
            }
        }
    }
    tree.visited = tail;
}

/**
 * Adds a node for a newborn genome and counts it a descendant of its ancestors.
 * @param {Record<string, any>} tree the family tree
 * @param {number} genomeId the newborn's genome id
 * @param {number} idA its first parent's genome id (0 for none)
 * @param {number} idB its second parent's genome id (0 for none)
 * @returns {void}
 */
function addNode(tree, genomeId, idA, idB) {
    const a = tree.nodeOf.get(idA) ?? NONE;
    const b = tree.nodeOf.get(idB) ?? NONE;
    if (tree.free.length === 0 && tree.used === tree.capacity) {
        grow(tree);
    }
    const node = tree.free.length > 0 ? tree.free.pop() : tree.used++;
    tree.genome[node] = genomeId;
    tree.parentA[node] = a;
    tree.parentB[node] = b;
    tree.count[node] = 0;
    tree.alive[node] = 1;
    tree.nodeOf.set(genomeId, node);
    collectAncestors(tree, a, b);
    for (let i = 0; i < tree.visited; i++) {
        tree.count[tree.queue[i]] += 1;
    }
}

/**
 * Frees a node nobody is alive in or below.
 * @param {Record<string, any>} tree the family tree
 * @param {number} node the node
 * @returns {void}
 */
function release(tree, node) {
    if (tree.alive[node] === 0 && tree.count[node] === 0) {
        tree.nodeOf.delete(tree.genome[node]);
        tree.free.push(node);
    }
}

/**
 * Takes a dead genome off its ancestors' counts and frees every node left with no one alive in or below it.
 * @param {Record<string, any>} tree the family tree
 * @param {number} genomeId the dead genome
 * @returns {void}
 */
function removeNode(tree, genomeId) {
    const node = tree.nodeOf.get(genomeId);
    if (node === undefined) {
        return;
    }
    tree.alive[node] = 0;
    collectAncestors(tree, tree.parentA[node], tree.parentB[node]);
    for (let i = 0; i < tree.visited; i++) {
        tree.count[tree.queue[i]] -= 1;
    }
    for (let i = 0; i < tree.visited; i++) {
        release(tree, tree.queue[i]);
    }
    release(tree, node);
}

/**
 * @param {Record<string, any>} tree the family tree
 * @param {number} genomeId a genome id
 * @returns {number} the alive descendants of the genome within `DEPTH` generations; 0 for an unknown genome
 */
export function descendantsOf(tree, genomeId) {
    const node = tree.nodeOf.get(genomeId);
    return node === undefined ? 0 : tree.count[node];
}

/**
 * Credits matings and starts the family node of every birth in a tick's events. Run before the tick's deaths, so a
 * parent that dies on the tick of the birth is still credited and still has the child as a descendant.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} count the number of records
 * @returns {void}
 */
export function noteBirthLineage(observer, d, count) {
    const { slotOf, matings } = observer;
    for (let i = 0; i < count; i++) {
        const o = i * EVENT_STRIDE;
        if (d[o] !== EVENT_TYPE.AGENT_BORN) {
            continue;
        }
        if (d[o + 8] === BORN_CAUSE.MATE) {
            const a = slotOf.get(d[o + 6]);
            const b = slotOf.get(d[o + 7]);
            if (a !== undefined) {
                matings[a] += 1;
            }
            if (b !== undefined && b !== a) {
                matings[b] += 1;
            }
        }
        const child = d[o + 8] === BORN_CAUSE.MATE || d[o + 8] === BORN_CAUSE.SPLIT;
        addNode(observer.family, d[o + 3], child ? d[o + 6] : 0, child ? d[o + 7] : 0);
    }
}

/**
 * Remembers a tracked newborn's parents, so `noteMatured` can credit them by genome id later.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} o the record offset of the `AgentBorn`
 * @returns {void}
 */
export function recordParents(observer, d, o) {
    if (d[o + 8] === BORN_CAUSE.MATE || d[o + 8] === BORN_CAUSE.SPLIT) {
        observer.parentGenomeA[d[o + 2]] = d[o + 6];
        observer.parentGenomeB[d[o + 2]] = d[o + 7];
    }
}

/**
 * Reads a dying agent's `descendantsAlive` into its slot. Call for every death of the tick before any
 * `releaseDeaths`, so each sees the same family, whatever the order of the records.
 * @param {Record<string, any>} observer the observer
 * @param {number} slot the dying agent's slot
 * @param {number} genomeId its genome id
 * @returns {void}
 */
export function readDescendants(observer, slot, genomeId) {
    observer.descendantsAlive[slot] = descendantsOf(observer.family, genomeId);
}

/**
 * Takes the tick's dead genomes out of the family tree.
 * @param {Record<string, any>} observer the observer
 * @param {Float64Array} d the event data
 * @param {number} count the number of records
 * @returns {void}
 */
export function releaseDeaths(observer, d, count) {
    for (let i = 0; i < count; i++) {
        if (d[i * EVENT_STRIDE] === EVENT_TYPE.AGENT_DIED) {
            removeNode(observer.family, d[i * EVENT_STRIDE + 3]);
        }
    }
}

/**
 * Credits the living parents of every tracked child whose age just reached `maturityTicks` (the test of the sim's
 * `creditMatured`). Run after the tick's events, so a child that died this tick is no longer alive and is not credited.
 * @param {Record<string, any>} observer the observer
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function noteMatured(observer, world) {
    const { maturityTicks } = world.config;
    if (!(maturityTicks > 0)) {
        return;
    }
    const { alive, ageTicks, genomeId } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] !== 1 || ageTicks[slot] !== maturityTicks || observer.genomeId[slot] !== genomeId[slot]) {
            continue;
        }
        const a = observer.slotOf.get(observer.parentGenomeA[slot]);
        const b = observer.slotOf.get(observer.parentGenomeB[slot]);
        if (a !== undefined) {
            observer.maturedChildren[a] += 1;
        }
        if (b !== undefined && b !== a) {
            observer.maturedChildren[b] += 1;
        }
    }
}
