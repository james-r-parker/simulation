// What the insights drawer's Families and Records tabs read, posted in the stats message: a row for each of the largest
// lineages (its size, its oldest living member, the mix of its specialisations, its kills and its deepest generation),
// and this world's records (the longest life, the most kills, the most children) with whether the holder is alive.
// Reads the world, the observer and the generation depths; never steps and never touches the sim.

const SPEC_COUNT = 5;

/**
 * @typedef {object} FamilyRow
 * @property {number} id the lineage id
 * @property {number} count alive members
 * @property {number} share its share of the alive agents
 * @property {number} oldestGenomeId the oldest living member, a family's follow target
 * @property {number} oldestAgeTicks that member's age in ticks
 * @property {number[]} bySpec alive members by specialisation index
 * @property {number} kills the kills of the alive members' lives so far, summed
 * @property {number} deepest the deepest generation among the alive members
 */

/**
 * @typedef {object} Record1
 * @property {number} value the record
 * @property {number} genomeId the holder, 0 before any
 * @property {boolean} alive whether the holder is alive now
 */

/**
 * @typedef {object} Records
 * @property {Record1} longestLife the greatest age in ticks any agent reached
 * @property {Record1} mostKills the most kills in one life
 * @property {Record1} mostChildren the most children of one agent
 */

/** @returns {Records} records with no holder */
export function createRecords() {
    return {
        longestLife: { value: 0, genomeId: 0, alive: false },
        mostKills: { value: 0, genomeId: 0, alive: false },
        mostChildren: { value: 0, genomeId: 0, alive: false },
    };
}

/**
 * @param {Record1} record the record
 * @param {number} value a candidate's value
 * @param {number} genomeId the candidate
 * @returns {void} takes the record when the candidate beats it
 */
function offer(record, value, genomeId) {
    if (value > record.value) {
        record.value = value;
        record.genomeId = genomeId;
    }
}

/**
 * Offers every alive agent to the records and sets whether each holder is alive.
 * @param {Records} records the records, updated
 * @param {{world: Record<string, any>, observer: Record<string, any>}} source the world and the observer
 * @returns {Records} a copy of the records, safe to post
 */
export function noteRecords(records, { world, observer }) {
    const { alive, ageTicks, genomeId } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1) {
            offer(records.longestLife, ageTicks[slot], genomeId[slot]);
            offer(records.mostKills, observer.kills[slot], genomeId[slot]);
            offer(records.mostChildren, observer.children[slot], genomeId[slot]);
        }
    }
    const held = [records.longestLife, records.mostKills, records.mostChildren];
    for (const record of held) {
        record.alive = false;
    }
    for (let slot = 0; slot < alive.length; slot++) {
        for (const record of held) {
            record.alive ||= alive[slot] === 1 && genomeId[slot] === record.genomeId && record.genomeId !== 0;
        }
    }
    return {
        longestLife: { ...records.longestLife },
        mostKills: { ...records.mostKills },
        mostChildren: { ...records.mostChildren },
    };
}

/**
 * @param {{id: number, count: number, share: number}} top one of `topLineages`' entries
 * @returns {FamilyRow} an empty row for it
 */
function emptyRow({ id, count, share }) {
    return {
        id,
        count,
        share,
        oldestGenomeId: 0,
        oldestAgeTicks: -1,
        bySpec: new Array(SPEC_COUNT).fill(0),
        kills: 0,
        deepest: 0,
    };
}

/**
 * @param {readonly {id: number, count: number, share: number}[]} top the largest lineages, largest first
 * @param {{world: Record<string, any>, observer: Record<string, any>, generations: {depth: ArrayLike<number>}}} source
 *   the world, the observer and the generation depths
 * @returns {FamilyRow[]} one row for each, in the same order, from one pass over the alive agents
 */
export function familyRows(top, { world, observer, generations }) {
    const rows = top.map(emptyRow);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const { alive, lineageId, genomeId, ageTicks, spec } = world;
    for (let slot = 0; slot < alive.length; slot++) {
        const row = alive[slot] === 1 ? byId.get(lineageId[slot]) : undefined;
        if (row !== undefined) {
            row.bySpec[spec[slot]] += 1;
            row.kills += observer.kills[slot];
            row.deepest = Math.max(row.deepest, generations.depth[slot]);
            if (ageTicks[slot] > row.oldestAgeTicks) {
                row.oldestAgeTicks = ageTicks[slot];
                row.oldestGenomeId = genomeId[slot];
            }
        }
    }
    return rows;
}
