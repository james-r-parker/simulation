// The rarer ticker items the director frames and the charts drawer lists as milestones: the world's first pack kill, a
// hunt streak that beats the record, the oldest blob yet, a family's last stand and where a family died out. Each is
// announced once. Reads the world and the lineage board; never steps.

/** The kills a streak must beat before it can be a record (the streak the `hunt-streak` item announces). */
export const STREAK_FLOOR = 5;

/** Agents left in a family that has grown to `EXTINCT_PEAK` for its last stand to be announced. */
export const LAST_STAND_COUNT = 1;

/**
 * @typedef {object} Milestones
 * @property {boolean} packKillSeen whether the first pack kill has been announced
 * @property {number} recordStreak the longest hunt streak announced so far
 * @property {number} recordGenome the genome that holds the age record, 0 for none
 * @property {number} recordAge its age in ticks when last seen
 * @property {Set<number>} standing the families whose last stand was announced and that are still down to one
 * @property {Map<number, {x: number, y: number}>} centre where each big family was the last time it was looked at
 */

/** @returns {Milestones} state for a fresh run */
export function createMilestones() {
    return {
        packKillSeen: false,
        recordStreak: STREAK_FLOOR,
        recordGenome: 0,
        recordAge: 0,
        standing: new Set(),
        centre: new Map(),
    };
}

/**
 * Items for one pack kill: the world's first, as `first-pack-kill`.
 * @param {Milestones} m the state
 * @param {{tick: number, genomeId: number, x?: number, y?: number}} kill the kill, with the killer's place when known
 * @returns {{tick: number, kind: string, text: string, genomeId: number, x?: number, y?: number}[]} zero or one item
 */
export function packKillItems(m, { tick, genomeId, x, y }) {
    if (m.packKillSeen) {
        return [];
    }
    m.packKillSeen = true;
    const at = x === undefined || y === undefined ? {} : { x, y };
    return [{ tick, kind: 'first-pack-kill', text: 'first pack kill', genomeId, ...at }];
}

/**
 * Items for a hunter's kill count: `record-streak` when it beats every streak announced before.
 * @param {Milestones} m the state
 * @param {{tick: number, genomeId: number, kills: number, x: number, y: number}} hunter the hunter after its kill
 * @returns {{tick: number, kind: string, text: string, genomeId: number, x: number, y: number}[]} zero or one item
 */
export function streakItems(m, { tick, genomeId, kills, x, y }) {
    if (kills <= m.recordStreak) {
        return [];
    }
    m.recordStreak = kills;
    return [{ tick, kind: 'record-streak', text: `record hunt streak: ${kills} kills`, genomeId, x, y }];
}

/**
 * Items for the oldest alive agent: `record-age` when a different agent than the holder passes the record. The holder
 * keeps the record as it ages without a new item.
 * @param {Milestones} m the state
 * @param {Record<string, any>} world the world
 * @param {number} minAge the age in ticks under which no record is announced (the elder age)
 * @returns {{tick: number, kind: string, text: string, genomeId: number, lineageId: number, x: number, y: number}[]} zero
 *   or one item
 */
export function ageItems(m, world, minAge) {
    const { alive, ageTicks } = world;
    let oldest = -1;
    for (let slot = 0; slot < alive.length; slot++) {
        if (alive[slot] === 1 && ageTicks[slot] >= minAge && (oldest < 0 || ageTicks[slot] > ageTicks[oldest])) {
            oldest = slot;
        }
    }
    if (oldest < 0 || ageTicks[oldest] <= m.recordAge) {
        return [];
    }
    const genomeId = world.genomeId[oldest];
    const holder = genomeId === m.recordGenome;
    m.recordGenome = genomeId;
    m.recordAge = ageTicks[oldest];
    return holder
        ? []
        : [
              {
                  tick: world.tick,
                  kind: 'record-age',
                  text: `${genomeId} is the oldest blob yet`,
                  genomeId,
                  lineageId: world.lineageId[oldest],
                  x: world.x[oldest],
                  y: world.y[oldest],
              },
          ];
}

/**
 * Where each big family is now: sums the places of the agents of the families in `big`.
 * @param {Record<string, any>} world the world
 * @param {Set<number>} big the families that reached the extinction peak and are alive
 * @returns {Map<number, {n: number, x: number, y: number}>} the count and the mean place of each
 */
function placesOf(world, big) {
    const places = new Map();
    for (let slot = 0; slot < world.alive.length; slot++) {
        const id = world.lineageId[slot];
        if (world.alive[slot] === 1 && big.has(id)) {
            const at = places.get(id) ?? { n: 0, x: 0, y: 0 };
            at.n += 1;
            at.x += world.x[slot];
            at.y += world.y[slot];
            places.set(id, at);
        }
    }
    return places;
}

/**
 * Remembers where each big family is, and announces a family's last stand once when it is down to
 * `LAST_STAND_COUNT`. Call it after the board has applied the tick.
 * @param {Milestones} m the state
 * @param {Record<string, any>} world the world
 * @param {Set<number>} big `board.big`
 * @returns {{tick: number, kind: string, text: string, lineageId: number, x: number, y: number}[]} the last stands
 */
export function lineageItems(m, world, big) {
    const out = [];
    const places = placesOf(world, big);
    for (const [id, at] of places) {
        const here = { x: at.x / at.n, y: at.y / at.n };
        m.centre.set(id, here);
        if (at.n <= LAST_STAND_COUNT && !m.standing.has(id)) {
            m.standing.add(id);
            out.push({
                tick: world.tick,
                kind: 'last-stand',
                text: `lineage ${id} is down to its last`,
                lineageId: id,
                ...here,
            });
        } else if (at.n > LAST_STAND_COUNT) {
            m.standing.delete(id);
        }
    }
    return out;
}

/**
 * @param {Milestones} m the state
 * @param {number} id a family that has just died out
 * @returns {{x: number, y: number} | null} where it was last seen, forgotten with it; null when never looked at
 */
export function takeCentre(m, id) {
    const at = m.centre.get(id) ?? null;
    m.centre.delete(id);
    m.standing.delete(id);
    return at;
}
