// The grouping sample (D5): how many same-lineage agents without `canHunt` stand within `callRadius` of a threatened
// agent without `canHunt`, against the same count around an unthreatened one. The sums are pooled over the run.

import { THREAT_PROXIMITY } from './observer-intent-state.js';

/**
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @param {number} a an alive slot without `canHunt`
 * @returns {number} the alive same-lineage agents without `canHunt` within `callRadius` of `a`, not counting `a`
 */
function kinNear(intent, world, a) {
    const { alive, spec, lineageId, x, y } = world;
    const r2 = intent.callRadius * intent.callRadius;
    let count = 0;
    for (let b = 0; b < alive.length; b++) {
        const dx = x[b] - x[a];
        const dy = y[b] - y[a];
        const near = dx * dx + dy * dy <= r2;
        if (b !== a && alive[b] === 1 && near && lineageId[b] === lineageId[a] && intent.hunterSpec[spec[b]] === 0) {
            count += 1;
        }
    }
    return count;
}

/**
 * Takes one grouping sample over every alive agent without `canHunt`; an agent is threatened when its nearest
 * bigger-class hit is at proximity `THREAT_PROXIMITY` or more this tick.
 * @param {Record<string, any>} intent the intent state
 * @param {Record<string, any>} world the world
 * @returns {void}
 */
export function sampleGroups(intent, world) {
    const { alive, spec } = world;
    const { run } = intent;
    for (let a = 0; a < alive.length; a++) {
        if (alive[a] !== 1 || intent.hunterSpec[spec[a]] === 1) {
            continue;
        }
        const count = kinNear(intent, world, a);
        if (intent.threatProx[a] >= THREAT_PROXIMITY) {
            run.groupThreatSum += count;
            run.groupThreatN += 1;
        } else {
            run.groupCalmSum += count;
            run.groupCalmN += 1;
        }
    }
}
