// The pack host: one request in, one published frame slot out (docs/designs/pack-worker.md, "The frame"). It holds the
// snapshot ring from the request's older snapshot, blends the two snapshots into a claimed slot, finds the pursuits on
// that blend for the fleeing marks, packs and rigs every spec bucket, interleaves the rows into the slot, checks that
// neither snapshot slot was overwritten meanwhile and publishes. Pure over its inputs: the worker entry only waits for
// requests and calls it, and the tests call it directly. Nothing allocates per request.

import { minPxTable } from '../display-size.js';
import { interpolateInto } from '../interpolate.js';
import { PALETTE_NAMES } from '../prefs.js';
import { createPursuits, findPursuits, pursuitRules } from '../pursuit.js';
import { bucketLanes, meshTable, rigContext } from '../renderer/agent-lanes.js';
import { createAgentRig, rigBucket } from '../renderer/agent-rig.js';
import { createAgentStore, packAgents } from '../renderer/agents-pack.js';
import { temperatureBands } from '../renderer/colors.js';
import { packDying } from '../renderer/dying-pack.js';
import { interleaveRows } from '../renderer/interleave.js';
import { TV_MIN_PX_SCALE } from '../renderer/palette.js';
import { holdFrom, READER, RELEASED, slotOfSeq } from '../../worker/snapshot-ring.js';
import { FAMILY_SLOTS } from '../family-slots.js';
import { claimFrameSlot, LENS, noteSkipped, publishFrame, SLOT, writeSlotMeta } from './frame-slots.js';

/** The longest gap between two packed requests the jaw easing integrates, ms (as `MAX_DT_MS` in the frame loop). */
export const MAX_GAP_MS = 100;

/**
 * @typedef {object} PackInit what `packInit` carries, as the worker and the tests build it
 * @property {Record<string, any>} info `ready.info`
 * @property {Record<string, any>} layout `ready.layout` (the pack reads its `flags` and `stateBits`)
 * @property {import('../../worker/snapshot-ring.js').Ring} ring the snapshot ring
 * @property {import('./frame-slots.js').FrameSlots} slots the frame slots
 * @property {{dents: import('../renderer/dents.js').Dents, tweens: import('../renderer/body-tweens.js').BodyTweens,
 *   dying: import('../renderer/dying.js').Dying}} stores the effect stores the main thread writes
 * @property {readonly string[]} causeNames the death cause names by number
 */

/**
 * @typedef {object} PackHost
 * @property {PackInit} init what the host was built from
 * @property {import('../renderer/agents-pack.js').AgentStore} store the packed buckets, the jaws and the fleeing marks
 * @property {ReturnType<typeof createAgentRig>} rig the rig arrays and scratch
 * @property {import('../renderer/agent-rig.js').RigContext} ctx the rig context, rewritten per request
 * @property {ReturnType<typeof temperatureBands>} bands the temperature lens bands
 * @property {import('../pursuit.js').Pursuits} pursuits this request's pairs
 * @property {{canHunt: Uint8Array, maxVelocity: number}} rules who hunts, and the speed scale
 * @property {Float32Array[][]} lanes per bucket, its lanes in instance attribute order
 * @property {import('../family-slots.js').FamilySlots} family the family colour slots, copied from each request
 * @property {{dtMs: number, zoom: number, slots: import('../family-slots.js').FamilySlots, maxVelocity: number,
 *   tick: number, nowMs: number}} view the packing view
 * @property {{slots: import('../family-slots.js').FamilySlots, zoom: number, causeNames: readonly string[],
 *   nowMs: number, flagBits: Record<string, number>, maxVelocity: number}} dyingView the dying bodies' view
 * @property {{rig: ReturnType<typeof createAgentRig>, out: any, ctx: import('../renderer/agent-rig.js').RigContext}} into
 *   the rig call's argument, reused
 * @property {number} lastNowMs the wall time of the last packed request, 0 before one
 */

/**
 * @param {PackInit} init the world and the shared memory
 * @returns {PackHost} the host
 */
export function createPackHost(init) {
    const { info, layout, stores } = init;
    const store = createAgentStore(info.maxAgents, info.specs.length, meshTable(info), minPxTable(info));
    store.tweens = stores.tweens;
    store.dents = stores.dents;
    store.dying = stores.dying;
    store.fleeing = new Uint8Array(info.maxAgents);
    const rig = createAgentRig(info.maxAgents, info.specs.length);
    const ctx = rigContext(info, layout.flags, layout.stateBits);
    ctx.dents = stores.dents;
    const family = { ids: new Int32Array(FAMILY_SLOTS).fill(-1), palette: 'default', version: 0, top: [] };
    return {
        init,
        store,
        rig,
        ctx,
        bands: temperatureBands(info),
        pursuits: createPursuits(),
        rules: pursuitRules(info),
        lanes: store.buckets.map((bucket, b) => bucketLanes(bucket, /** @type {any} */ (rig.arrays[b]))),
        family,
        view: { dtMs: 0, zoom: 1, slots: family, maxVelocity: info.maxVelocity, tick: 0, nowMs: 0 },
        dyingView: {
            slots: family,
            zoom: 1,
            causeNames: init.causeNames,
            nowMs: 0,
            flagBits: layout.flags,
            maxVelocity: info.maxVelocity,
        },
        into: { rig, out: rig.arrays[0], ctx },
        lastNowMs: 0,
    };
}

/**
 * Marks the agents under pursuit in the blend the packing reads.
 * @param {PackHost} host the host
 * @param {import('../interpolate.js').Interpolated} agents the blend
 * @returns {void}
 */
function markFleeing(host, agents) {
    const { fleeing } = /** @type {{fleeing: Uint8Array}} */ (host.store);
    fleeing.fill(0, 0, Math.min(agents.count, fleeing.length));
    findPursuits(agents, host.rules, host.pursuits);
    for (let k = 0; k < host.pursuits.count; k++) {
        fleeing[host.pursuits.prey[k]] = 1;
    }
}

/**
 * Copies the request's frame values into the host's views and the rig context.
 * @param {PackHost} host the host
 * @param {import('./frame-slots.js').Request} request the request
 * @returns {void}
 */
function applyRequest(host, request) {
    const { view, dyingView, ctx, family } = host;
    const gap = host.lastNowMs === 0 ? 0 : request.nowMs - host.lastNowMs;
    view.dtMs = Math.min(Math.max(gap, 0), MAX_GAP_MS);
    view.zoom = request.zoom;
    view.tick = request.tick;
    view.nowMs = request.nowMs;
    family.ids.set(request.family);
    family.palette = PALETTE_NAMES[request.palette] ?? PALETTE_NAMES[0];
    dyingView.zoom = request.zoom;
    host.store.minScale = (request.lens & LENS.TV) !== 0 ? TV_MIN_PX_SCALE : 1;
    dyingView.nowMs = request.nowMs;
    ctx.timeSec = request.nowMs / 1000;
    ctx.tick = request.tick;
    ctx.palette = family.palette;
    ctx.temperatureLens = (request.lens & LENS.TEMPERATURE) !== 0 ? host.bands : null;
    host.lastNowMs = request.nowMs;
}

/**
 * Packs and rigs every bucket of the blend and interleaves its rows into the slot.
 * @param {PackHost} host the host
 * @param {import('./frame-slots.js').FrameSlot} slot the slot being written
 * @returns {void}
 */
function packBuckets(host, slot) {
    const { store, rig, ctx, into, init } = host;
    const agents = slot.agents;
    packAgents(agents, store, init.layout.flags, host.view);
    packDying(/** @type {any} */ (store.dying), store, host.dyingView);
    const specs = /** @type {{canHunt: boolean}[]} */ (init.info.specs);
    for (let b = 0; b < store.buckets.length; b++) {
        ctx.hunter = specs[b].canHunt;
        into.out = rig.arrays[b];
        rigBucket(/** @type {any} */ (store.buckets[b]), agents, into);
        interleaveRows(host.lanes[b], slot.rows[b], store.buckets[b].count);
        slot.head[SLOT.BUCKETS + b] = store.buckets[b].count;
    }
}

/**
 * @param {PackHost} host the host
 * @param {import('./frame-slots.js').Request} request the request
 * @returns {boolean} whether the slots of both snapshots hold their sequence still
 */
function snapshotsHeld(host, request) {
    const { ring } = host.init;
    return slotOfSeq(ring, request.latestSeq) >= 0 && (request.prevSeq <= 0 || slotOfSeq(ring, request.prevSeq) >= 0);
}

/**
 * Packs one request into a claimed slot and publishes it, unless a snapshot slot was overwritten on the way.
 * @param {PackHost} host the host
 * @param {import('./frame-slots.js').Request} request the request
 * @returns {boolean} whether a slot was published
 */
function fillSlot(host, request) {
    const { ring, slots } = host.init;
    if (!snapshotsHeld(host, request)) {
        return false;
    }
    const prevAt = request.prevSeq > 0 ? slotOfSeq(ring, request.prevSeq) : -1;
    const latestAt = slotOfSeq(ring, request.latestSeq);
    const k = claimFrameSlot(slots);
    const slot = slots.slots[k];
    interpolateInto(prevAt < 0 ? null : ring.slots[prevAt], ring.slots[latestAt], request.alpha, slot.agents);
    applyRequest(host, request);
    markFleeing(host, slot.agents);
    packBuckets(host, slot);
    // a snapshot slot overwritten while it was read holds garbage: drop the frame (a slot being written reads as seq 0)
    if (
        slotOfSeq(ring, request.latestSeq) !== latestAt ||
        (prevAt >= 0 && slotOfSeq(ring, request.prevSeq) !== prevAt)
    ) {
        return false;
    }
    writeSlotMeta(slots, { slot: k, request });
    publishFrame(slots, k, request.seq);
    return true;
}

/**
 * Packs one request. A request with no snapshot yet does nothing; one whose snapshot slot was overwritten is skipped and
 * counted (`skippedPacks`).
 * @param {PackHost} host the host
 * @param {import('./frame-slots.js').Request} request the request, as `readRequest` filled it
 * @returns {boolean} whether a slot was published
 */
export function packRequest(host, request) {
    if (request.latestSeq <= 0) {
        return false;
    }
    const { ring, slots } = host.init;
    holdFrom(ring, READER.PACK, request.prevSeq > 0 ? request.prevSeq : request.latestSeq);
    const published = fillSlot(host, request);
    holdFrom(ring, READER.PACK, RELEASED);
    if (!published) {
        // a snapshot slot read mid-overwrite may have left stray entries in the blend's scratch map
        for (let k = 0; k < slots.slots.length; k++) {
            slots.slots[k].agents.previous.fill(0);
        }
        noteSkipped(slots);
    }
    return published;
}
