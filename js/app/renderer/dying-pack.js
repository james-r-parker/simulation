// Packs the dying bodies into the agent buckets, after the live rows: the body's own model draws it, a death tween kind
// plays the clip of its cause over the death's progress, and the row's `fade` takes it out. Pure; nothing allocates.

import { drawnRadius } from '../display-size.js';
import { slotOf } from '../family-slots.js';
import { claimRow, colorUnslotted, ITEM, PHI_FRAC } from './agents-pack.js';
import { familyColor } from './colors.js';
import { animFor, fadeOf, progressOf } from './death-anim.js';
import { isPlaying, isUsed, MAX_DYING, positionOf } from './dying.js';

const COLOR_AGENT = { mesh: 0, lineageId: 0, neutral: false, energy01: 0 };

/**
 * @param {import('./agents-pack.js').AgentStore} store the store
 * @param {import('../family-slots.js').FamilySlots} slots the colour slots
 * @param {import('./dying.js').Dying} d the dying bodies
 * @param {{k: number, mesh: number}} body the pool index and the mesh
 * @returns {number[]} the body's family colour (the store's scratch)
 */
function colorOf(store, slots, d, { k, mesh }) {
    const lineageId = d.lineage[k];
    const rgb = familyColor(slots, lineageId, d.pose[4][k], store.rgb);
    COLOR_AGENT.mesh = mesh;
    COLOR_AGENT.lineageId = lineageId;
    COLOR_AGENT.neutral = slots.palette === 'default' && slotOf(slots, lineageId) < 0;
    COLOR_AGENT.energy01 = d.pose[4][k];
    colorUnslotted(rgb, COLOR_AGENT);
    return rgb;
}

/**
 * Writes one dying body's row.
 * @param {import('./agents-pack.js').AgentStore} store the store
 * @param {{d: import('./dying.js').Dying, k: number, mesh: number, nowMs: number}} body the dying bodies, the body, its
 *   mesh and wall time
 * @param {{slots: import('../family-slots.js').FamilySlots, zoom: number, causeNames: readonly string[]}} view the
 *   colour slots, the zoom and the cause names by number
 * @returns {void}
 */
function packBody(store, { d, k, mesh, nowMs }, view) {
    const bucket = store.buckets[mesh];
    const o = claimRow(bucket, -1);
    const at = positionOf(d, k, nowMs);
    const rgb = colorOf(store, view.slots, d, { k, mesh });
    bucket.pose[o] = at.x;
    bucket.pose[o + 1] = at.y;
    bucket.pose[o + 2] = d.pose[2][k];
    bucket.pose[o + 3] = drawnRadius(d.pose[3][k], store.minPx[mesh], view.zoom);
    bucket.color[o] = rgb[0];
    bucket.color[o + 1] = rgb[1];
    bucket.color[o + 2] = rgb[2];
    bucket.color[o + 3] = d.pose[4][k];
    bucket.state.fill(0, o, o + ITEM);
    bucket.extra.fill(0, o, o + ITEM);
    bucket.extra[o + 1] = COLOR_AGENT.neutral ? 1 : 0;
    bucket.motion.fill(0, o, o + ITEM);
    bucket.motion[o + 2] = (d.genome[k] * PHI_FRAC) % 1;
    bucket.body.fill(0, o, o + ITEM);
    bucket.tween.fill(0, o, o + ITEM);
    let fade = 0;
    if (isPlaying(d, k)) {
        const anim = animFor(view.causeNames[d.cause[k]]);
        const progress = progressOf(anim, nowMs - d.start[k]);
        bucket.tween[o] = anim.kind;
        bucket.tween[o + 1] = progress;
        fade = fadeOf(anim, progress);
    }
    bucket.fade[o / ITEM] = fade;
}

/**
 * Appends every dying body to its specialisation's bucket, up to the bucket's capacity.
 * @param {import('./dying.js').Dying} d the dying bodies
 * @param {import('./agents-pack.js').AgentStore} store the store `packAgents` just filled
 * @param {{slots: import('../family-slots.js').FamilySlots, zoom: number, causeNames: readonly string[],
 *   nowMs: number}} view the colour slots, zoom, cause names and wall time
 * @returns {number} bodies packed
 */
export function packDying(d, store, view) {
    let packed = 0;
    for (let k = 0; k < MAX_DYING; k++) {
        if (!isUsed(d, k)) {
            continue;
        }
        const mesh = store.meshOfSpec[d.spec[k]];
        const bucket = store.buckets[mesh];
        if (bucket === undefined || bucket.count >= bucket.index.length) {
            continue;
        }
        packBody(store, { d, k, mesh, nowMs: view.nowMs }, view);
        packed += 1;
    }
    return packed;
}
