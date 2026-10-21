// The grouping sample (D5): how many same-lineage agents without `canHunt` stand within `callRadius` of a threatened
// agent without `canHunt`, against the same count around an unthreatened one. The sums are pooled over the run.

import { THREAT_PROXIMITY } from './observer-intent-state.js';

/**
 * Lists the alive slots without `canHunt` into `intent.groupKeys` as `lineageId * slotCount + slot`, sorted, with
 * `Infinity` after the last, so each lineage's agents sit together in slot order.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
function listByLineage(intent, world) {
    const { alive, spec, lineageId } = world;
    const keys = intent.groupKeys;
    let count = 0;
    for (let a = 0; a < alive.length; a++) {
        if (alive[a] === 1 && intent.hunterSpec[spec[a]] === 0) {
            keys[count] = lineageId[a] * alive.length + a;
            count += 1;
        }
    }
    keys.fill(Infinity, count);
    keys.sort();
}

/**
 * Counts, for the agents of one lineage listed at `from` up to `to`, the others of the lineage within `callRadius`.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} from the first index in `intent.groupKeys`
 * @param {number} to one past the last
 * @returns {void}
 */
function countKin(intent, world, from, to) {
    const { x, y } = world;
    const { groupKeys, groupKin } = intent;
    const slots = world.alive.length;
    const r2 = intent.callRadius * intent.callRadius;
    for (let i = from; i < to; i++) {
        groupKin[groupKeys[i] % slots] = 0;
    }
    for (let i = from; i < to; i++) {
        const a = groupKeys[i] % slots;
        for (let j = i + 1; j < to; j++) {
            const b = groupKeys[j] % slots;
            const dx = x[b] - x[a];
            const dy = y[b] - y[a];
            if (dx * dx + dy * dy <= r2) {
                groupKin[a] += 1;
                groupKin[b] += 1;
            }
        }
    }
}

/**
 * Takes one grouping sample over every alive agent without `canHunt`; an agent is threatened when its nearest
 * bigger-class hit is at proximity `THREAT_PROXIMITY` or more this tick. Each lineage is counted on its own, so the
 * cost follows the sum of squared lineage sizes, not the square of the population.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleGroups(intent, world) {
    const { run, groupKeys, groupKin } = intent;
    const slots = world.alive.length;
    listByLineage(intent, world);
    for (let from = 0; groupKeys[from] !== Infinity;) {
        const lineage = Math.floor(groupKeys[from] / slots);
        let to = from + 1;
        while (groupKeys[to] < (lineage + 1) * slots) {
            to += 1;
        }
        countKin(intent, world, from, to);
        for (let i = from; i < to; i++) {
            const a = groupKeys[i] % slots;
            if (intent.threatProx[a] >= THREAT_PROXIMITY) {
                run.groupThreatSum += groupKin[a];
                run.groupThreatN += 1;
            } else {
                run.groupCalmSum += groupKin[a];
                run.groupCalmN += 1;
            }
        }
        from = to;
    }
}
