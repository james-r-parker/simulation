// What `tick` does for the subject plate: reads the followed body from the frame's agents, adds the inspector's counters
// when the worker is inspecting that same body, and hands the plate its view. The plate hides with no follow, no body on
// screen or the `followPlate` preference off.

import { childrenAlive } from './follow-handoff.js';
import { findAgent } from './renderer/overlays.js';
import { inspectorView } from './ui/inspector-data.js';
import { plateView } from './ui/subject-plate.js';

/**
 * @param {Record<string, any>} ctx the interface's shared parts
 * @param {import('./interpolate.js').Interpolated} agents the frame's agents
 * @returns {number} the followed body's index, -1 when there is no follow, no world or no body on screen
 */
function followedIndex(ctx, agents) {
    const { deps, prefs } = ctx;
    const i = findAgent(agents, deps.state.followId);
    return !prefs.followPlate || deps.getReady() === null ? -1 : i;
}

/**
 * @param {Record<string, any>} ctx the interface's shared parts
 * @param {number} id the followed genome
 * @returns {{ageSeasons: number, kills: number} | null} the inspector's counters when the worker is inspecting `id`
 */
function inspectedStats(ctx, id) {
    const { deps } = ctx;
    const snapshot = deps.getClient()?.latest;
    if (!snapshot || deps.state.selectedId !== id) {
        return null;
    }
    const inspected = inspectorView({ snapshot, ready: deps.getReady(), slots: deps.slots });
    return inspected.valid && inspected.header.genomeId === id ? inspected.stats : null;
}

/**
 * @param {Record<string, any>} ctx the interface's shared parts: `deps`, `prefs` and `plate`
 * @param {number} nowMs wall time
 * @returns {void}
 */
export function refreshPlate(ctx, nowMs) {
    const { deps, plate } = ctx;
    const source = deps.getFollowView?.() ?? null;
    const i = source === null ? -1 : followedIndex(ctx, source.agents);
    if (source === null || i < 0) {
        plate.update(null, nowMs);
        return;
    }
    const id = deps.state.followId;
    const { agents, player } = source;
    plate.update(
        plateView({
            agents,
            i,
            ready: deps.getReady(),
            slots: deps.slots,
            hunted: player !== null && player.flee.fleeing[i] === 1,
            children: player === null ? 0 : childrenAlive(player.story, agents, id),
            stats: inspectedStats(ctx, id),
        }),
        nowMs,
    );
}
