// A real `ready.info`, `ready.layout` and snapshot from a small world, so the renderer tests read what the worker sends.

import { createSimLog } from '../../../js/sim/log.js';
import { createSnapshotViews, writeSnapshot } from '../../../js/sim/snapshot.js';
import { buildRun, readyLayout, tickOnce, worldInfo } from '../../../js/worker/host-world.js';
import { noisePolicy, SMALL_CONFIG } from '../../worker/helpers/host-harness.js';

const LOG = createSimLog(() => {}, { level: 'error' });

/**
 * @param {number} [ticks] ticks to run before taking the snapshot
 * @returns {{info: Record<string, any>, layout: Record<string, any>, snapshot: {tick: number, u32: Uint32Array, f32: Float32Array, buffer: ArrayBuffer}}}
 *   the ready fields and a snapshot of the world
 */
export function smallReady(ticks = 0) {
    const run = buildRun({ seed: 3, overrides: SMALL_CONFIG, createPolicy: noisePolicy, log: LOG });
    for (let i = 0; i < ticks; i++) {
        tickOnce(run);
    }
    const buffer = new ArrayBuffer(run.layout.bytes);
    const views = createSnapshotViews(buffer);
    writeSnapshot(run.world, views, false);
    return {
        info: worldInfo(run),
        layout: readyLayout(run),
        snapshot: { tick: run.world.tick, buffer, ...views },
    };
}
