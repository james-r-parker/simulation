// The alarm credit (D5, D6): a precise `AlarmCalled` is queued with its caller, lineage and position. When an agent
// without `canHunt` is first bitten, the queued alarms of its lineage made within `packWindow` ticks before, from within
// `callRadius` of where it stood, are noted on its slot (up to `ALARM_MATCH_CAP`, oldest first). If its episode then
// resolves as escaped with a response, each noted caller still alive in its slot is credited. A caller that died, or
// whose slot was reused, is dropped. The queue is a window over typed arrays that compacts, then doubles, when full,
// so a steady run allocates nothing.

const START_CAPACITY = 16;

/** The most alarms noted per bite episode. */
export const ALARM_MATCH_CAP = 4;

const QUEUE_FIELDS = ['tick', 'slot', 'id', 'lineage', 'x', 'y'];

/**
 * @returns {Record<string, any>} an empty alarm queue
 */
export function createAlarmQueue() {
    return {
        tick: new Float64Array(START_CAPACITY),
        slot: new Int32Array(START_CAPACITY),
        id: new Uint32Array(START_CAPACITY),
        lineage: new Uint32Array(START_CAPACITY),
        x: new Float64Array(START_CAPACITY),
        y: new Float64Array(START_CAPACITY),
        head: 0,
        size: 0,
    };
}

/**
 * Makes room at the tail: moves the live entries to the front, or doubles the arrays when none is free in front.
 * @param {Record<string, any>} queue the queue
 * @returns {void}
 */
function makeRoom(queue) {
    const { head, size } = queue;
    for (const name of QUEUE_FIELDS) {
        const old = queue[name];
        if (head === 0) {
            const next = new old.constructor(old.length * 2);
            next.set(old);
            queue[name] = next;
        } else {
            old.copyWithin(0, head, head + size);
        }
    }
    queue.head = 0;
}

/**
 * Queues a precise alarm call.
 * @param {Record<string, any>} queue the queue
 * @param {Record<string, any>} world the world
 * @param {number} caller the caller's slot
 * @returns {void}
 */
export function pushAlarm(queue, world, caller) {
    if (queue.head + queue.size === queue.tick.length) {
        makeRoom(queue);
    }
    const at = queue.head + queue.size;
    queue.tick[at] = world.tick;
    queue.slot[at] = caller;
    queue.id[at] = world.genomeId[caller];
    queue.lineage[at] = world.lineageId[caller];
    queue.x[at] = world.x[caller];
    queue.y[at] = world.y[caller];
    queue.size += 1;
}

/**
 * Drops the alarms that can no longer be followed by a bite within `span` ticks.
 * @param {Record<string, any>} queue the queue
 * @param {number} tick the observed tick
 * @param {number} span `packWindow`
 * @returns {void}
 */
export function pruneAlarms(queue, tick, span) {
    while (queue.size > 0 && queue.tick[queue.head] + span <= tick) {
        queue.head += 1;
        queue.size -= 1;
    }
    if (queue.size === 0) {
        queue.head = 0;
    }
}

/**
 * Notes on a newly bitten agent the queued alarms it could answer to: another caller of its lineage, called at least
 * one tick and at most `packWindow` ticks ago, from within `callRadius` of the victim.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} victim the bitten slot
 * @returns {void}
 */
export function matchAlarms(intent, world, victim) {
    const queue = intent.alarmQueue;
    const r2 = intent.callRadius * intent.callRadius;
    const base = victim * ALARM_MATCH_CAP;
    let count = 0;
    for (let i = queue.head; i < queue.head + queue.size && count < ALARM_MATCH_CAP; i++) {
        const dx = world.x[victim] - queue.x[i];
        const dy = world.y[victim] - queue.y[i];
        const age = world.tick - queue.tick[i];
        const near = age >= 1 && age <= intent.packWindow && dx * dx + dy * dy <= r2;
        if (near && queue.lineage[i] === world.lineageId[victim] && queue.id[i] !== world.genomeId[victim]) {
            intent.alarmMatchSlot[base + count] = queue.slot[i];
            intent.alarmMatchId[base + count] = queue.id[i];
            count += 1;
        }
    }
    intent.alarmMatches[victim] = count;
}

/**
 * Credits the callers noted on a victim whose episode resolved as escaped with a response, and clears the notes.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} victim the slot
 * @returns {void}
 */
export function creditAlarms(intent, world, victim) {
    const base = victim * ALARM_MATCH_CAP;
    for (let m = 0; m < intent.alarmMatches[victim]; m++) {
        const caller = intent.alarmMatchSlot[base + m];
        if (world.alive[caller] === 1 && world.genomeId[caller] === intent.alarmMatchId[base + m]) {
            intent.alarmCredits[caller] += 1;
        }
    }
    intent.alarmMatches[victim] = 0;
}
